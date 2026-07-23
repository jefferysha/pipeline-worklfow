#!/usr/bin/env bash
# prompt-intent.sh — UserPromptSubmit 的跨会话绑定判定。
#
# `.pipeline-active` 是仓库级恢复候选，不是任意新会话的隐式绑定。只有用户明确要求
# 继续（或点名 change）时，调用方才可把该候选注入为当前任务。这里仅做 shell
# pattern 判定；用户文本始终保持数据，绝不 eval/source。

pipeline_prompt_requests_resume() { # $1=prompt $2=候选 change 名；0=允许绑定旧 change
  local prompt="${1:-}" change="${2:-}"
  [ -n "$prompt" ] || return 1

  # 明确的新主题/拒绝继续优先于宽泛的“继续”词，避免“不要继续，调研新项目”被误绑。
  case "$prompt" in
    *"不要继续"*|*"不继续"*|*"别继续"*|*"新任务"*|*"新项目"*|*"另一个"*|*"另外一个"*|*"重新开始"*|*"新建"*) return 1 ;;
  esac

  # 只有安全的 change 名才可作为 shell pattern 的一部分；hook 也会做同样的
  # 路径校验，但这里保持独立防线，避免异常目录名改变 case 的匹配语义。
  case "$change" in
    ''|*[!A-Za-z0-9_-]*) ;;
    *)
      # 点名 change 是最明确的恢复意图。
      case "$prompt" in
        *"$change"*) return 0 ;;
      esac
      ;;
  esac

  case "$prompt" in
    *"继续"*|*"接着"*|*"恢复"*|*"上一项"*|*"上一步"*|*"按原计划"*|*"continue"*|*"Continue"*|*"resume"*|*"Resume"*) return 0 ;;
  esac
  return 1
}
