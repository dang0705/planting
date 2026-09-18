#!/usr/bin/env python3
"""按关键词检索 uni-ui 组件候选。

用法：
  python scripts/match_uni_ui_component.py "左滑删除 列表"
  python scripts/match_uni_ui_component.py "日期范围 打点 月历" --top 5
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path


def normalize(text: str) -> str:
    return text.lower().replace('-', ' ').replace('_', ' ')


def score_component(query: str, component: dict) -> int:
    haystacks = []
    for key in ["name", "cn", "category", "useWhen", "avoid"]:
        value = component.get(key)
        if isinstance(value, str):
            haystacks.append(value)
    haystacks.extend(component.get("figmaSignals", []))
    haystacks.extend(component.get("props", []))
    haystacks.extend(component.get("events", []))
    hay = normalize(" ".join(haystacks))
    tokens = [t for t in normalize(query).split() if t]
    score = 0
    for token in tokens:
        if token in hay:
            score += 2
    # 中文无空格时做子串加分
    q = normalize(query)
    for signal in component.get("figmaSignals", []):
        if normalize(signal) and normalize(signal) in q:
            score += 3
    if normalize(component.get("cn", "")) in q:
        score += 4
    if normalize(component.get("name", "")) in q:
        score += 5
    return score


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("query", help="Figma 节点名、文本、交互描述或中文关键词")
    parser.add_argument("--top", type=int, default=8, help="返回候选数量")
    args = parser.parse_args()

    data_path = Path(__file__).resolve().parents[1] / "assets" / "component-map.json"
    data = json.loads(data_path.read_text(encoding="utf-8"))
    scored = []
    for component in data["components"]:
        s = score_component(args.query, component)
        if s > 0:
            scored.append((s, component))
    scored.sort(key=lambda x: x[0], reverse=True)

    if not scored:
        print("未命中候选。请换用更具体的 Figma 线索，例如：左滑删除、底部弹层、日期范围、红点角标。")
        return

    for score, c in scored[: args.top]:
        print(f"[{score}] {c['name']}｜{c['cn']}")
        print(f"  适用：{c['useWhen']}")
        print(f"  线索：{'、'.join(c.get('figmaSignals', [])[:8])}")
        print(f"  props：{', '.join(c.get('props', [])[:10])}")
        print(f"  风险：{c.get('avoid', '')}")
        print(f"  文档：{c.get('doc', '')}")
        print()


if __name__ == "__main__":
    main()
