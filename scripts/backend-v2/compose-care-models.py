"""合成养护决策总图；只读取四个编辑源，不访问架构目录或业务数据。"""

from copy import deepcopy
from hashlib import sha256
import json
from pathlib import Path
import xml.etree.ElementTree as ET


MODEL = "https://www.omg.org/spec/DMN/20191111/MODEL/"
DMNDI = "https://www.omg.org/spec/DMN/20191111/DMNDI/"
DC = "http://www.omg.org/spec/DMN/20180521/DC/"
DI = "http://www.omg.org/spec/DMN/20180521/DI/"
DIRECTORY = Path(__file__).resolve().parents[2] / "cloudfunctions-v2/models/care"
SOURCES = ("light.dmn", "pot.dmn", "dry-cycle.dmn", "watering.dmn")
LINKS = {
    "watering_input_light_result": "light_decision_light_result",
    "watering_input_pot_result": "pot_decision_pot_result",
    "watering_input_personal_calibration": "dry_cycle_decision_personal_calibration",
}

for prefix, uri in (("", MODEL), ("dmndi", DMNDI), ("dc", DC), ("di", DI)):
    ET.register_namespace(prefix, uri)


def validate(root):
    """检查 XML、标识、局部引用、依赖无环及表格列数；不替代 XSD、dmnlint 或 FEEL 执行。"""
    ids = [node.attrib["id"] for node in root.iter() if "id" in node.attrib]
    if len(ids) != len(set(ids)):
        raise ValueError("模型存在重复标识")
    all_ids = set(ids)
    graph = {}
    for node in root.iter():
        for field in ("href", "dmnElementRef"):
            if field in node.attrib and node.attrib[field].lstrip("#") not in all_ids:
                raise ValueError("模型引用无法解析：" + node.attrib[field])
        if node.tag in {f"{{{MODEL}}}{kind}" for kind in ("decision", "inputData", "knowledgeSource")}:
            if not node.attrib.get("name"):
                raise ValueError("缺少中文展示名称")
        if node.tag == f"{{{MODEL}}}decision":
            graph[node.attrib["id"]] = [
                ref.attrib["href"].lstrip("#")
                for ref in node.findall(f"{{{MODEL}}}informationRequirement/{{{MODEL}}}requiredDecision")
            ]
        if node.tag == f"{{{MODEL}}}decisionTable":
            inputs = len(node.findall(f"{{{MODEL}}}input"))
            outputs = len(node.findall(f"{{{MODEL}}}output"))
            if node.attrib.get("hitPolicy") not in {"FIRST", "UNIQUE"}:
                raise ValueError("使用了未批准的命中策略")
            for rule in node.findall(f"{{{MODEL}}}rule"):
                if len(rule.findall(f"{{{MODEL}}}inputEntry")) != inputs or len(rule.findall(f"{{{MODEL}}}outputEntry")) != outputs:
                    raise ValueError("规则的输入输出列数不一致")
    visited = set()

    def visit(node_id, path):
        if node_id in path:
            raise ValueError("模型存在同轮循环依赖")
        if node_id in visited:
            return
        for dependency in graph.get(node_id, []):
            visit(dependency, path | {node_id})
        visited.add(node_id)

    for node_id in graph:
        visit(node_id, set())
    return {"ids": len(ids), "decisions": len(graph)}


def layout(root):
    """按模型分栏布局，保存可在编辑器审阅的节点及连线。"""
    diagram = ET.SubElement(
        ET.SubElement(root, f"{{{DMNDI}}}DMNDI"), f"{{{DMNDI}}}DMNDiagram",
        {"id": "care_models_diagram", "name": "养护模型跨领域依赖总图"},
    )
    positions = {}
    groups = ("light", "pot", "dry_cycle", "watering")
    for column, group in enumerate(groups):
        nodes = [node for node in root if node.attrib.get("id", "").startswith(group + "_")]
        for row, node in enumerate(nodes):
            x, y = 80 + column * 620 + (row % 2) * 280, 70 + (row // 2) * 160
            positions[node.attrib["id"]] = (x, y)
            shape = ET.SubElement(diagram, f"{{{DMNDI}}}DMNShape", {
                "id": node.attrib["id"] + "_shape", "dmnElementRef": node.attrib["id"],
            })
            ET.SubElement(shape, f"{{{DC}}}Bounds", {"x": str(x), "y": str(y), "width": "230", "height": "80"})
    for node in root.findall(f"{{{MODEL}}}decision"):
        for requirement in node:
            if requirement.tag not in {f"{{{MODEL}}}informationRequirement", f"{{{MODEL}}}authorityRequirement"}:
                continue
            source = list(requirement)[0].attrib["href"].lstrip("#")
            a, b = positions[source], positions[node.attrib["id"]]
            edge = ET.SubElement(diagram, f"{{{DMNDI}}}DMNEdge", {
                "id": requirement.attrib["id"] + "_edge", "dmnElementRef": requirement.attrib["id"],
            })
            ET.SubElement(edge, f"{{{DI}}}waypoint", {"x": str(a[0] + 115), "y": str(a[1] + 80)})
            ET.SubElement(edge, f"{{{DI}}}waypoint", {"x": str(b[0] + 115), "y": str(b[1])})


def main():
    combined = ET.Element(f"{{{MODEL}}}definitions", {
        "id": "care_models_definitions", "name": "养护决策模型合成总图",
        "namespace": "http://camunda.org/schema/1.0/dmn",
    })
    ET.SubElement(combined, f"{{{MODEL}}}description").text = "由四个编辑源确定性生成，禁止单独修改。离线草案，未通过 Camunda 引擎行为验收。"
    entries = []
    for filename in SOURCES:
        path = DIRECTORY / filename
        source = ET.parse(path).getroot()
        counts = validate(source)
        entries.append({
            "file": filename, "sha256": sha256(path.read_bytes()).hexdigest(), **counts,
            "decisions": [
                {"id": node.attrib["id"], "output": node.find(f"{{{MODEL}}}variable").attrib["name"]}
                for node in source.findall(f"{{{MODEL}}}decision")
            ],
            "inputs": [
                {"name": node.find(f"{{{MODEL}}}variable").attrib["name"],
                 "type": node.find(f"{{{MODEL}}}variable").attrib["typeRef"]}
                for node in source.findall(f"{{{MODEL}}}inputData")
            ],
        })
        for child in source:
            if child.tag in {f"{{{MODEL}}}description", f"{{{DMNDI}}}DMNDI"} or child.attrib.get("id") in LINKS:
                continue
            combined.append(deepcopy(child))
    for requirement in combined.iter(f"{{{MODEL}}}informationRequirement"):
        reference = list(requirement)[0]
        target = LINKS.get(reference.attrib["href"].lstrip("#"))
        if target:
            reference.tag = f"{{{MODEL}}}requiredDecision"
            reference.attrib["href"] = "#" + target
    layout(combined)
    counts = validate(combined)
    ET.indent(combined, space="  ")
    output = DIRECTORY / "care-models.dmn"
    ET.ElementTree(combined).write(output, encoding="utf-8", xml_declaration=True)
    manifest = {
        "format": "DMN 1.3", "status": "draft_unverified_behavior",
        "sourceOfRules": "四个独立 DMN 编辑源；合成文件不得手工修改",
        "sources": entries, "composite": {"file": output.name, "sha256": sha256(output.read_bytes()).hexdigest(), **counts},
        "validation": {"xmlAndReferences": "passed", "dependencyAcyclic": "passed",
                       "dmnlint": "not_run_tool_unavailable", "compatibleEngine": "not_run_tool_unavailable",
                       "desktopModelerRoundtrip": "not_verified", "typescriptParity": "not_verified"},
        "runtime": "未接入 CloudBase 或生产规则执行；数值结果由 TypeScript 用例输入，本制品不证明这些用例已经实现",
    }
    (DIRECTORY / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"sourceFiles": len(SOURCES), "compositeDecisions": counts["decisions"], "status": manifest["status"]}))


if __name__ == "__main__":
    main()
