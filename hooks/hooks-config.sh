#!/usr/bin/env bash
# hooks-config.sh — untrusted project hooks.json 的有界、fd 固定快照。
#
# Bash 3.2 没有 O_NOFOLLOW/O_NONBLOCK 标志。可写文件先以读写方式打开固定 fd，让 FIFO 打开立即
# 返回；合法只读文件则在纯 Bash 子进程中只读打开，由父进程的限时 read 兜住 pathname 被换成
# FIFO 的竞态。两路都比较 pathname/fd inode+size、限制磁盘字节数，并通过 od 的十六进制字节流
# 显式拒绝 NUL（Bash 变量不能保存 NUL）。不能安全取得同一份快照时统一 fail-open。

pipeline_hooks_config_identity() { # $1=path；stdout=inode:size
  # Darwin 的 /dev/fd 位于 devfs，stat 会报告 devfs 的 dev 而非底层文件 dev；inode 与 size
  # 仍来自同一 open file description。两侧另有普通文件与 symlink 判定，故比较这两个稳定字段。
  stat -f '%i:%z' "$1" 2>/dev/null \
    || stat -c '%i:%s' "$1" 2>/dev/null
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

pipeline_hooks_config_snapshot_readonly() { # $1=path；父进程限时等待子进程的 NUL 结尾快照
  local file="${1:-}" snapshot='' reader_pid read_rc
  exec 8< <(
    exec 9< "$file" 2>/dev/null || exit 1
    pipeline_hooks_config_snapshot_from_fd "$file" || exit 1
    printf '%s\0' "$PIPELINE_HOOKS_CONFIG_SNAPSHOT"
  )
  reader_pid=$!
  IFS= read -r -d '' -t 1 snapshot <&8
  read_rc=$?
  exec 8<&-
  if [ "$read_rc" -ne 0 ]; then
    kill "$reader_pid" 2>/dev/null || true
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
