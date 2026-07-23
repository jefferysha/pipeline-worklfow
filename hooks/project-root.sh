#!/usr/bin/env bash
# project-root.sh — hooks 共享的项目根定位。
#
# 旧实现会从任意 cwd 向上扫描 openspec/changes；当多个临时项目共用 /tmp 时，会把父目录的
# Change 误绑定到无关会话。这里把「存在 OpenSpec」与「这是当前项目的根」分开：只接受当前目录、
# 显式 PIPELINE_PROJECT_ROOT，或当前 Git worktree 根。非 Git 的嵌套调用需要显式传根，绝不
# 越过边界借用祖先项目。
#
# 所有函数保持 Bash 3.2 兼容，且不 spawn git/node/python，供热路径 hook 直接 source。

pipeline_physical_dir() { # $1 -> canonical physical directory
  [ -d "$1" ] || return 1
  (cd -P -- "$1" 2>/dev/null && pwd)
}

pipeline_path_within() { # $1=child $2=ancestor
  [ "$2" = "/" ] && return 0
  case "$1/" in
    "$2/"*) return 0 ;;
    *) return 1 ;;
  esac
}

pipeline_git_root() { # $1=canonical cwd; walk only to the closest Git root
  local d="$1" parent
  while true; do
    if [ -d "$d/.git" ] || [ -f "$d/.git" ]; then
      printf '%s' "$d"
      return 0
    fi
    [ "$d" = "/" ] && return 1
    parent="${d%/*}"
    [ -n "$parent" ] || parent="/"
    [ "$parent" != "$d" ] || return 1
    d="$parent"
  done
}

# pipeline_project_root <cwd> [existing|bootstrap] [changes|openspec]
#
# existing  仅返回确有指定 OpenSpec 目录的可信根；用于读取/写入 Change 状态。
# bootstrap 无状态时返回 Git 根（或 cwd 本身），让正常开发对话可选择 default pipeline，
#           但绝不沿父目录误绑定另一项目。
pipeline_project_root() {
  local cwd_raw="$1" mode="${2:-existing}" kind="${3:-changes}"
  local cwd root git_root marker
  case "$mode" in existing|bootstrap) ;; *) return 1 ;; esac
  case "$kind" in changes) marker="openspec/changes" ;; openspec) marker="openspec" ;; *) return 1 ;; esac

  cwd="$(pipeline_physical_dir "$cwd_raw")" || return 1

  # Launcher 明示的根优先，但 cwd 必须实际位于其内，避免环境变量把另一个项目注入本会话。
  if [ -n "${PIPELINE_PROJECT_ROOT:-}" ]; then
    root="$(pipeline_physical_dir "$PIPELINE_PROJECT_ROOT")" || return 1
    pipeline_path_within "$cwd" "$root" || return 1
    if [ "$mode" = "bootstrap" ] || [ -d "$root/$marker" ]; then
      printf '%s' "$root"
      return 0
    fi
    return 1
  fi

  # 非 Git 项目只有在恰好从其根启动时才可信；不向上猜测。
  if [ -d "$cwd/$marker" ]; then
    printf '%s' "$cwd"
    return 0
  fi

  git_root="$(pipeline_git_root "$cwd" || true)"
  if [ -n "$git_root" ]; then
    if [ "$mode" = "bootstrap" ] || [ -d "$git_root/$marker" ]; then
      printf '%s' "$git_root"
      return 0
    fi
  fi

  if [ "$mode" = "bootstrap" ]; then
    printf '%s' "$cwd"
    return 0
  fi
  return 1
}
