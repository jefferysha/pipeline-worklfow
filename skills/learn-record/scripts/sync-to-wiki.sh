#!/usr/bin/env bash
# sync-to-wiki.sh — 把 learned skill 同步到 shadoc wiki 知识库
#
# Usage: sync-to-wiki.sh <category> <slug> <source-file>
#
# 操作：
#   1. cp <source> → <shadoc>/wiki/<category>/sources/learned-<slug>.md
#   2. append 到 <shadoc>/wiki/log.md
#   3. update <shadoc>/wiki/index.md 在对应 category 加引用

set -uo pipefail

red()   { printf '\033[31m%s\033[0m\n' "$*" >&2; }
green() { printf '\033[32m%s\033[0m\n' "$*" >&2; }
yellow(){ printf '\033[33m%s\033[0m\n' "$*" >&2; }

# shadoc wiki 根：从环境变量或本地未追踪配置读取——不写死作者机器路径（去泄露）。
# 机器特定路径放 ~/.claude/.pipeline-local.conf（不随插件分发、应被 gitignore）。未配置则跳过本层。
[ -z "${SHADOC_ROOT:-}" ] && [ -f "$HOME/.claude/.pipeline-local.conf" ] && . "$HOME/.claude/.pipeline-local.conf" 2>/dev/null
SHADOC_ROOT="${SHADOC_ROOT:-}"
[ -z "$SHADOC_ROOT" ] && { yellow "未配置 SHADOC_ROOT（见 ~/.claude/.pipeline-local.conf），跳过 Layer 3 wiki 同步"; exit 0; }
WIKI_ROOT="$SHADOC_ROOT/wiki"

CATEGORY="${1:-ai}"
SLUG="${2:-untitled}"
SOURCE="${3:-}"

# 校验
[ -z "$SOURCE" ] && { red "ERROR: 缺 source file 参数"; exit 1; }
[ ! -f "$SOURCE" ] && { red "ERROR: source 文件不存在: $SOURCE"; exit 1; }
[ ! -d "$SHADOC_ROOT" ] && { yellow "WARN: shadoc 根目录不存在 ($SHADOC_ROOT)，跳过 Layer 3"; exit 0; }
[ ! -d "$WIKI_ROOT" ] && { yellow "WARN: wiki 目录不存在 ($WIKI_ROOT)，跳过"; exit 0; }

# category 白名单
case "$CATEGORY" in
  ai|backend|frontend|cicd|devops|bigdata) ;;
  *) yellow "WARN: 未知 category '$CATEGORY'，归到 ai/"
     CATEGORY="ai" ;;
esac

# slug 校验
if [[ ! "$SLUG" =~ ^[a-zA-Z0-9_-]+$ ]]; then
  red "ERROR: slug 非法字符（仅允许 a-z A-Z 0-9 - _）: '$SLUG'"
  exit 1
fi

TARGET_DIR="$WIKI_ROOT/$CATEGORY/sources"
TARGET_FILE="$TARGET_DIR/learned-$SLUG.md"
DATE=$(date +%Y-%m-%d)
TS=$(date -u +%Y-%m-%dT%H:%M:%SZ)

# === Step 1: 复制 ===
mkdir -p "$TARGET_DIR"
cp "$SOURCE" "$TARGET_FILE"
green "[OK] 已复制 → $TARGET_FILE"

# === Step 2: 提取 title 和 description ===
TITLE=$(grep -m1 '^# ' "$SOURCE" | sed 's/^# //' || echo "$SLUG")
DESC=$(grep -m1 '^description:' "$SOURCE" | sed 's/^description:[[:space:]]*//' | sed 's/^"\(.*\)"$/\1/' || echo "")

# === Step 3: append 到 wiki/log.md ===
LOG_FILE="$WIKI_ROOT/log.md"
if [ ! -f "$LOG_FILE" ]; then
  cat > "$LOG_FILE" <<EOF
---
updated: $DATE
---

# Wiki Update Log

EOF
fi

# 直接 append 到文件末尾（保持简单可靠）
cat >> "$LOG_FILE" <<EOF

## $DATE — $CATEGORY
- [[wiki/$CATEGORY/sources/learned-$SLUG]] — $TITLE
EOF

green "[OK] 已追加 → $LOG_FILE"

# 更新 frontmatter updated 字段
if grep -q '^updated:' "$LOG_FILE"; then
  TMP_LOG=$(mktemp)
  awk -v d="$DATE" 'BEGIN{c=0} /^updated:/ && c==0 {print "updated: " d; c=1; next} {print}' "$LOG_FILE" > "$TMP_LOG" && mv "$TMP_LOG" "$LOG_FILE"
fi

# === Step 4: 更新 wiki/index.md（在对应 category section 加引用） ===
INDEX_FILE="$WIKI_ROOT/index.md"
if [ -f "$INDEX_FILE" ]; then
  CAT_HEADER="## $CATEGORY"
  # 不同 category 标题不同，做个映射
  case "$CATEGORY" in
    ai)       CAT_LABEL="ai" ;;
    backend)  CAT_LABEL="backend" ;;
    frontend) CAT_LABEL="frontend" ;;
    cicd)     CAT_LABEL="cicd" ;;
    devops)   CAT_LABEL="devops" ;;
    bigdata)  CAT_LABEL="bigdata" ;;
  esac

  # 若 sources/ 段不存在则提示，但不强制更新（避免破坏现有结构）
  if grep -q "wiki/$CATEGORY/sources" "$INDEX_FILE"; then
    yellow "[INFO] index.md 已有 $CATEGORY/sources 引用区，请手动添加新条目"
  else
    yellow "[INFO] index.md 无 $CATEGORY/sources 段，需要手动添加条目"
  fi

  # 更新 frontmatter updated
  if grep -q '^updated:' "$INDEX_FILE"; then
    TMP=$(mktemp)
    awk -v d="$DATE" 'BEGIN{c=0} /^updated:/ && c==0 {print "updated: " d; c=1; next} {print}' "$INDEX_FILE" > "$TMP" && mv "$TMP" "$INDEX_FILE"
    green "[OK] index.md updated 字段已更新"
  fi
fi

rm -f "${TMP_LOG:-}" 2>/dev/null

green ""
green "✓ Layer 3 (shadoc wiki) 同步完成"
green "  · 文件:  $TARGET_FILE"
green "  · log:   $LOG_FILE"
green "  · index: $INDEX_FILE (frontmatter updated)"
