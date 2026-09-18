#!/usr/bin/env bash

set -u
set -o pipefail

CACHE_DIR="${CODEX_PLUGIN_CACHE:-$HOME/.codex/plugins/cache}"

# 设为 1 时，只安装 compatibility=full 的插件
STRICT_FULL="${STRICT_FULL:-0}"

# 设为 1 时，安装已存在的同名插件会附加 --replace
REPLACE_EXISTING="${REPLACE_EXISTING:-0}"

LOG_DIR="${LOG_DIR:-$PWD/reasonix-plugin-batch-$(date +%Y%m%d-%H%M%S)}"

command -v reasonix >/dev/null 2>&1 || {
  echo "错误：找不到 reasonix 命令。" >&2
  exit 127
}

# Reasonix 本身依赖 Node；这里用 Node 解析预检 JSON
command -v node >/dev/null 2>&1 || {
  echo "错误：找不到 node 命令。" >&2
  exit 127
}

reasonix plugin --help >/dev/null 2>&1 || {
  echo "错误：当前 Reasonix 不支持 reasonix plugin，请先升级。" >&2
  exit 2
}

[[ -d "$CACHE_DIR" ]] || {
  echo "错误：Codex 插件缓存目录不存在：$CACHE_DIR" >&2
  exit 2
}

mkdir -p "$LOG_DIR"

# 从 Reasonix 预检 JSON 的任意层级提取 compatibility
extract_compatibility() {
  node - "$1" <<'NODE'
const fs = require("fs");

const file = process.argv[2];
const data = JSON.parse(fs.readFileSync(file, "utf8"));
const found = new Set();

function walk(value) {
  if (Array.isArray(value)) {
    value.forEach(walk);
    return;
  }

  if (!value || typeof value !== "object") {
    return;
  }

  for (const [key, child] of Object.entries(value)) {
    if (/compatib/i.test(key) && typeof child === "string") {
      const status = child.toLowerCase();

      if (
        status === "full" ||
        status === "partial" ||
        status === "none"
      ) {
        found.add(status);
      }
    }

    walk(child);
  }
}

walk(data);
process.stdout.write([...found].join("\n"));
NODE
}

# 查找全部插件根目录，使用 -print0 正确处理空格等特殊字符
plugin_roots=()

while IFS= read -r -d '' manifest; do
  # manifest:
  # <插件根目录>/.codex-plugin/plugin.json
  plugin_roots+=("$(dirname "$(dirname "$manifest")")")
done < <(
  find "$CACHE_DIR" \
    -type f \
    -path '*/.codex-plugin/plugin.json' \
    -print0
)

if (( ${#plugin_roots[@]} == 0 )); then
  echo "未找到任何 Codex 插件。"
  exit 0
fi

printf '找到 %d 个插件目录。\n' "${#plugin_roots[@]}"
printf '日志目录：%s\n\n' "$LOG_DIR"

passed_roots=()
passed_labels=()

precheck_failed=0
precheck_skipped=0
index=0

# 第一阶段：全部预检
for root in "${plugin_roots[@]}"; do
  index=$((index + 1))

  label="$(basename "$root")"
  prefix="$LOG_DIR/$(printf '%03d' "$index")-$label"

  stdout_file="${prefix}-precheck.json"
  stderr_file="${prefix}-precheck.stderr.log"

  printf '[%d/%d] 预检：%s\n' \
    "$index" \
    "${#plugin_roots[@]}" \
    "$root"

  if NO_COLOR=1 reasonix plugin install "$root" --dry-run \
      >"$stdout_file" \
      2>"$stderr_file"; then

    statuses="$(
      extract_compatibility "$stdout_file" 2>/dev/null || true
    )"

    has_full=0
    has_partial=0
    has_none=0

    while IFS= read -r status; do
      case "$status" in
        full)
          has_full=1
          ;;
        partial)
          has_partial=1
          ;;
        none)
          has_none=1
          ;;
      esac
    done <<< "$statuses"

    if (( has_none == 1 )); then
      echo "  跳过：compatibility=none"
      precheck_skipped=$((precheck_skipped + 1))
      continue
    fi

    if [[ "$STRICT_FULL" == "1" ]] &&
       ! (( has_full == 1 && has_partial == 0 )); then
      if (( has_partial == 1 )); then
        echo "  跳过：仅部分兼容，当前 STRICT_FULL=1"
      else
        echo "  跳过：未明确确认 compatibility=full"
      fi

      precheck_skipped=$((precheck_skipped + 1))
      continue
    fi

    if (( has_partial == 1 )); then
      echo "  通过：partial"
    elif (( has_full == 1 )); then
      echo "  通过：full"
    else
      # 为兼容未来 JSON 字段变化：
      # dry-run 成功且没有显式 none 时，默认视为通过
      echo "  通过：dry-run 成功，未识别 compatibility 字段"
    fi

    passed_roots+=("$root")
    passed_labels+=("$label")
  else
    echo "  失败：dry-run 返回非零退出码"
    echo "        错误日志：$stderr_file"

    precheck_failed=$((precheck_failed + 1))
  fi
done

printf '\n预检完成：通过 %d，跳过 %d，失败 %d。\n' \
  "${#passed_roots[@]}" \
  "$precheck_skipped" \
  "$precheck_failed"

if (( ${#passed_roots[@]} == 0 )); then
  echo "没有可安装的插件。"
  exit 1
fi

# 第二阶段：安装通过项
printf '\n开始安装预检通过的插件。\n'

install_ok=0
install_failed=0

for i in "${!passed_roots[@]}"; do
  root="${passed_roots[$i]}"
  label="${passed_labels[$i]}"

  prefix="$LOG_DIR/$(printf '%03d' "$((i + 1))")-$label"

  stdout_file="${prefix}-install.json"
  stderr_file="${prefix}-install.stderr.log"

  args=(
    plugin
    install
    "$root"
    --yes
  )

  if [[ "$REPLACE_EXISTING" == "1" ]]; then
    args+=(--replace)
  fi

  printf '[%d/%d] 安装：%s\n' \
    "$((i + 1))" \
    "${#passed_roots[@]}" \
    "$root"

  if NO_COLOR=1 reasonix "${args[@]}" \
      >"$stdout_file" \
      2>"$stderr_file"; then
    echo "  成功"
    install_ok=$((install_ok + 1))
  else
    echo "  失败：$stderr_file"
    install_failed=$((install_failed + 1))
  fi
done

printf '\n安装完成：成功 %d，失败 %d。\n' \
  "$install_ok" \
  "$install_failed"

printf '完整日志：%s\n' "$LOG_DIR"

(( install_failed == 0 ))
