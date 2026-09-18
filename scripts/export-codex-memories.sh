#!/usr/bin/env bash

set -Eeuo pipefail
umask 077

trap 'printf "\n失败：第 %s 行，退出码 %s\n" "$LINENO" "$?" >&2' ERR

if [[ $# -ne 2 ]]; then
  echo "用法：$0 <CODEX_HOME> <目标项目目录>" >&2
  echo "示例：$0 \"\$HOME/.codex\" \"/Users/jay/WebstormProjects/planting\"" >&2
  exit 2
fi

CODEX_HOME_PATH="${1/#\~/$HOME}"
TARGET_PROJECT="${2/#\~/$HOME}"

if [[ ! -d "$CODEX_HOME_PATH" ]]; then
  echo "错误：CODEX_HOME 不存在：$CODEX_HOME_PATH" >&2
  exit 1
fi

if [[ ! -d "$TARGET_PROJECT" ]]; then
  echo "错误：目标项目不存在：$TARGET_PROJECT" >&2
  exit 1
fi

CODEX_HOME_PATH="$(
  cd "$CODEX_HOME_PATH"
  pwd -P
)"

TARGET_PROJECT="$(
  cd "$TARGET_PROJECT"
  pwd -P
)"

SOURCE="$CODEX_HOME_PATH/memories"
IMPORT_ROOT="$TARGET_PROJECT/.reasonix-import"
EXPORT_DIR="$IMPORT_ROOT/latest"
RAW_DIR="$EXPORT_DIR/raw"
SUMMARY_FILE="$EXPORT_DIR/codex-memory-raw.txt"
MANIFEST_FILE="$EXPORT_DIR/迁移说明.md"

if [[ ! -d "$SOURCE" ]]; then
  echo "错误：Codex 记忆目录不存在：$SOURCE" >&2
  exit 1
fi

SOURCE_COUNT="$(
  find "$SOURCE" \
    -type f \
    -not -path '*/.git/*' \
    -not -path '*/.brv/*' \
    -not -name '.DS_Store' |
  wc -l |
  tr -d '[:space:]'
)"

if [[ "$SOURCE_COUNT" -eq 0 ]]; then
  echo "错误：Codex 记忆目录中没有可导出的文件：$SOURCE" >&2
  exit 1
fi

echo "Codex Home：$CODEX_HOME_PATH"
echo "记忆源目录：$SOURCE"
echo "目标项目：$TARGET_PROJECT"
echo "源文件数量：$SOURCE_COUNT"
echo

# 每次重新生成 latest，避免读取到旧迁移材料
rm -rf "$EXPORT_DIR"
mkdir -p "$RAW_DIR"

echo "复制记忆文件……"

rsync -a \
  --exclude='.git/' \
  --exclude='.brv/' \
  --exclude='.DS_Store' \
  "$SOURCE/" \
  "$RAW_DIR/"

COPIED_COUNT="$(
  find "$RAW_DIR" -type f |
  wc -l |
  tr -d '[:space:]'
)"

if [[ "$COPIED_COUNT" -eq 0 ]]; then
  echo "错误：没有复制出任何文件。" >&2
  exit 1
fi

echo "生成文本汇总……"

{
  echo "# Codex 本地记忆导出"
  echo
  echo "- 导出时间：$(date '+%Y-%m-%d %H:%M:%S %z')"
  echo "- Codex Home：$CODEX_HOME_PATH"
  echo "- 来源目录：$SOURCE"
  echo "- 文件数量：$COPIED_COUNT"
  echo
  echo "以下内容仅作为 Reasonix 迁移候选材料，不代表已写入 Reasonix 记忆。"
} > "$SUMMARY_FILE"

while IFS= read -r -d '' file; do
  relative="${file#"$RAW_DIR/"}"

  {
    echo
    echo
    echo "============================================================"
    echo "SOURCE FILE: $relative"
    echo "============================================================"
  } >> "$SUMMARY_FILE"

  case "$file" in
    *.md|*.markdown|*.txt|*.json|*.jsonl|*.yaml|*.yml|*.toml|*.csv|*.xml)
      cat "$file" >> "$SUMMARY_FILE"
      ;;
    *)
      if LC_ALL=C grep -Iq . "$file" 2>/dev/null; then
        cat "$file" >> "$SUMMARY_FILE"
      else
        echo "[非文本文件，未展开]" >> "$SUMMARY_FILE"
      fi
      ;;
  esac
done < <(
  find "$RAW_DIR" -type f -print0
)

cat > "$MANIFEST_FILE" <<EOF
# Codex 记忆迁移说明

## 来源

- Codex Home：\`$CODEX_HOME_PATH\`
- 记忆目录：\`$SOURCE\`
- 导出文件数：$COPIED_COUNT

## 文件结构

- \`raw/\`：Codex 记忆原始副本
- \`codex-memory-raw.txt\`：供 Reasonix 分析的文本汇总

## 当前状态

这些内容尚未写入 Reasonix 记忆系统。

Reasonix 应先筛选、去重并排除：

- 临时任务状态；
- 失败或废弃方案；
- 工具输出；
- 已过期事实；
- Token、Cookie、密钥等敏感信息。
EOF

if [[ ! -s "$SUMMARY_FILE" ]]; then
  echo "错误：汇总文件未成功生成：$SUMMARY_FILE" >&2
  exit 1
fi

echo
echo "导出完成："
find "$IMPORT_ROOT" -maxdepth 4 -print

echo
echo "Reasonix 应读取："
echo "$SUMMARY_FILE"
