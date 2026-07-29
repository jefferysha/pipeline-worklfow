#!/usr/bin/env bash
# hooks-config.sh — untrusted project hooks.json 的有界、fd 固定快照。
#
# Bash 3.2 没有 O_NOFOLLOW/O_NONBLOCK 标志。可写文件先以读写方式打开固定 fd，让 FIFO 打开立即
# 返回；合法只读文件则在纯 Bash 子进程中只读打开，由父进程的限时 read 兜住 pathname 被换成
# FIFO 的竞态。两路都比较 pathname/fd inode+size、限制磁盘字节数，并通过 od 的十六进制字节流
# 显式拒绝 NUL（Bash 变量不能保存 NUL）。不能安全取得同一份快照时统一 fail-open。

pipeline_hooks_config_identity() { # $1=path；stdout=inode:size
  local identity inode size
  # Darwin 的 /dev/fd 位于 devfs，stat 会报告 devfs 的 dev 而非底层文件 dev；inode 与 size
  # 仍来自同一 open file description。GNU stat 默认不跟随 /dev/fd/N 符号链接，必须显式 -L，
  # 否则会把链接自身的 inode/size 与 pathname 比较并让所有只读配置在 Linux 上失效。
  # 两侧另有普通文件与 symlink 判定，故比较这两个稳定字段。
  # 先试 GNU 形式：GNU `stat -f FORMAT path` 会把 FORMAT 当成另一个 pathname，
  # 即使最终失败也会先把 path 的文件系统报告写到 stdout，不能安全地放在 fallback 前面。
  # 每个探针各自在 command substitution 中隔离 stdout；只有单一数字 inode:size 才向调用方输出。
  # 这样即使能力探针“先写 stdout、再失败”，污染内容也不会和 fallback 的成功结果拼接。
  identity="$(stat -Lc '%i:%s' "$1" 2>/dev/null)" || identity=''
  if [ -n "$identity" ] && [ "${identity#*:}" != "$identity" ]; then
    inode="${identity%%:*}"
    size="${identity#*:}"
    case "$inode" in ''|*[!0-9]*) ;; *)
      case "$size" in ''|*[!0-9]*) ;; *)
        printf '%s\n' "$identity"
        return 0
        ;;
      esac
    esac
  fi

  identity="$(stat -f '%i:%z' "$1" 2>/dev/null)" || return 1
  [ -n "$identity" ] && [ "${identity#*:}" != "$identity" ] || return 1
  inode="${identity%%:*}"
  size="${identity#*:}"
  case "$inode" in ''|*[!0-9]*) return 1 ;; esac
  case "$size" in ''|*[!0-9]*) return 1 ;;
  esac
  printf '%s\n' "$identity"
}

pipeline_hooks_config_snapshot_from_fd() { # $1=path，fd 9 已打开
  local file="${1:-}" path_identity fd_identity post_identity size hex byte decoded snapshot='' bytes=0
  if [ -L "$file" ] || [ ! -f "$file" ] || [ ! -f /dev/fd/9 ]; then
    return 1
  fi
  path_identity="$(pipeline_hooks_config_identity "$file")"
  fd_identity="$(pipeline_hooks_config_identity /dev/fd/9)"
  if [ -z "$path_identity" ] || [ "$path_identity" != "$fd_identity" ]; then
    return 1
  fi
  size="${fd_identity##*:}"
  case "$size" in ''|*[!0-9]*) return 1 ;; esac
  [ "$size" -le 4096 ] || return 1

  # dd 从同一 fd 最多取 4097 bytes，因此即使文件在 stat 后持续增长，读取也不会先无界
  # 阻塞/占用内存。不把原始字节直接放进 command substitution：Bash 3.2 会静默丢弃
  # NUL；od 先转成可安全保存的两位 hex，随后由 Bash 自己解码并明确拒绝 00。
  hex="$(
    set -o pipefail
    dd bs=4097 count=1 <&9 2>/dev/null | od -An -v -t x1 2>/dev/null
  )" || return 1
  post_identity="$(pipeline_hooks_config_identity /dev/fd/9)"
  [ "$post_identity" = "$fd_identity" ] || return 1
  for byte in $hex; do
    bytes=$((bytes + 1))
    [ "$bytes" -le 4096 ] || return 1
    case "$byte" in
      00) return 1 ;;
      [0-9a-f][0-9a-f]) ;;
      *) return 1 ;;
    esac
    printf -v decoded "\\x$byte"
    snapshot="${snapshot}${decoded}"
  done
  PIPELINE_HOOKS_CONFIG_SNAPSHOT="$snapshot"
}

pipeline_hooks_config_kill_tree() { # $1=pid $2=启动 identity；超时路径的有界后代清理
  local root_pid="${1:-}" process_table='' current signaled=' ' pid ppid
  local root_identity="${2:-}" current_root_identity
  local changed round=0 poll=0 alive
  case "$root_pid" in ''|*[!0-9]*) return 1 ;; esac
  if [ -z "$root_identity" ]; then
    root_identity="$(ps -o ppid=,lstart=,comm= -p "$root_pid" 2>/dev/null)" || return 0
  fi
  [ -n "$root_identity" ] || return 0

  # 先保留外壳；每轮只对 fresh parent-child 快照求闭包，且同一 PID 最多 signal 一次，避免
  # 已退出后代的 PID 被复用后遭重复误杀。异常路径才调用 ps，正常 hot path 无额外进程。
  while [ "$round" -lt 3 ]; do
    current_root_identity="$(ps -o ppid=,lstart=,comm= -p "$root_pid" 2>/dev/null)" || break
    [ "$current_root_identity" = "$root_identity" ] || break
    process_table="$(ps -eo pid=,ppid= 2>/dev/null)" || process_table=''
    current=" $root_pid "
    changed=1
    while [ "$changed" -eq 1 ]; do
      changed=0
      while read -r pid ppid; do
        case "$pid:$ppid" in
          *[!0-9:]*|:*) continue ;;
        esac
        case "$current" in
          *" $ppid "*)
            case "$current" in
              *" $pid "*) ;;
              *) current="${current}${pid} "; changed=1 ;;
            esac
            ;;
        esac
      done <<< "$process_table"
    done
    for pid in $current; do
      [ "$pid" = "$root_pid" ] && continue
      case "$signaled" in *" $pid "*) continue ;; esac
      if kill "$pid" 2>/dev/null; then
        signaled="${signaled}${pid} "
      fi
    done
    round=$((round + 1))
  done

  # 给仍存活的 reader 外壳一个短窗口回收刚终止的直接子进程；之后才验证所有权并终止外壳。
  sleep 0.1
  current_root_identity="$(ps -o ppid=,lstart=,comm= -p "$root_pid" 2>/dev/null)" \
    || current_root_identity=''
  [ "$current_root_identity" = "$root_identity" ] && kill "$root_pid" 2>/dev/null || true
  wait "$root_pid" 2>/dev/null || true
  while [ "$poll" -lt 20 ]; do
    alive=0
    for pid in $root_pid $signaled; do
      if kill -0 "$pid" 2>/dev/null; then
        alive=1
        break
      fi
    done
    [ "$alive" -eq 1 ] || return 0
    sleep 0.1
    poll=$((poll + 1))
  done
  return 1
}

pipeline_hooks_config_snapshot_readonly() { # $1=path；父进程限时等待子进程的 NUL 结尾快照
  local file="${1:-}" snapshot='' reader_pid reader_identity current_reader_identity read_rc
  exec 8< <(
    exec 9< "$file" 2>/dev/null || exit 1
    pipeline_hooks_config_snapshot_from_fd "$file" || exit 1
    printf '%s\0' "$PIPELINE_HOOKS_CONFIG_SNAPSHOT"
  )
  reader_pid=$!
  reader_identity="$(ps -o ppid=,lstart=,comm= -p "$reader_pid" 2>/dev/null)" \
    || reader_identity=''
  IFS= read -r -d '' -t 1 snapshot <&8
  read_rc=$?
  exec 8<&-
  if [ "$read_rc" -ne 0 ]; then
    # Bash 3.2 的 timeout 与 EOF 都可能返回 1，不能靠状态码区分。只有当前 PID 的启动 identity
    # 仍与创建 reader 时完全一致，才按 timeout 清理；worker 已退出的 EOF 不触碰可能复用的 PID。
    current_reader_identity="$(ps -o ppid=,lstart=,comm= -p "$reader_pid" 2>/dev/null)" \
      || current_reader_identity=''
    if [ -n "$reader_identity" ] && [ "$current_reader_identity" = "$reader_identity" ]; then
      pipeline_hooks_config_kill_tree "$reader_pid" "$reader_identity" || true
    else
      wait "$reader_pid" 2>/dev/null || true
    fi
    return 1
  fi
  PIPELINE_HOOKS_CONFIG_SNAPSHOT="$snapshot"
}

pipeline_hooks_config_snapshot() { # $1=项目根；成功后写全局 PIPELINE_HOOKS_CONFIG_SNAPSHOT
  local root="${1:-}" file
  PIPELINE_HOOKS_CONFIG_ROOT="$root"
  PIPELINE_HOOKS_CONFIG_SNAPSHOT=''
  file="$root/.pipeline/hooks.json"
  [ ! -L "$file" ] && [ -f "$file" ] && [ -r "$file" ] || return 1

  exec 9>&- 2>/dev/null || true
  if exec 9<> "$file" 2>/dev/null; then
    pipeline_hooks_config_snapshot_from_fd "$file"
    local read_rc=$?
    exec 9>&-
    return "$read_rc"
  fi
  pipeline_hooks_config_snapshot_readonly "$file"
}

pipeline_hook_disabled() { # $1=项目根 $2=hook id $3=阶段 → 0=该阶段已禁用
  local root="${1:-}" hook="${2:-}" phase="${3:-}" line trimmed expected
  [ -n "$root" ] && [ -n "$phase" ] || return 1
  if [ "${PIPELINE_HOOKS_CONFIG_ROOT:-}" != "$root" ]; then
    pipeline_hooks_config_snapshot "$root" || return 1
  fi
  expected="\"$hook.$phase\": false"
  while IFS= read -r line || [ -n "$line" ]; do
    trimmed="${line#"${line%%[![:space:]]*}"}"
    trimmed="${trimmed%"${trimmed##*[![:space:]]}"}"
    [ "$trimmed" = "$expected" ] || [ "$trimmed" = "$expected," ] || continue
    return 0
  done <<< "$PIPELINE_HOOKS_CONFIG_SNAPSHOT"
  return 1
}
