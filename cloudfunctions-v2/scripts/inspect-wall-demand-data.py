"""核验 Wall 等公开数据包的字段与时间步；不运行宏、不拟合或发布模型。"""

import hashlib
import io
import json
import re
import sys
import xml.etree.ElementTree as ET
import zipfile

EXPECTED_SHA256 = "5efd4cae49631d1c61c387ec5526a80f39e7bfdf33b371df9fb9eec3d476646c"
NS = {"s": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
ENVIRONMENT_NAMES = re.compile(r"vpd|humid|temperature|Tair|Tleaf|PPFD|\bPAR\b|Qin|kPa", re.I)


def inspect_workbook(raw):
    """只解析工作表 XML 与字符串，不执行公式或宏。"""
    with zipfile.ZipFile(io.BytesIO(raw)) as workbook:
        strings = []
        if "xl/sharedStrings.xml" in workbook.namelist():
            strings = ["".join(item.itertext()) for item in ET.fromstring(workbook.read("xl/sharedStrings.xml"))]
        relations = {item.attrib["Id"]: item.attrib["Target"] for item in ET.fromstring(workbook.read("xl/_rels/workbook.xml.rels"))}
        sheets = []
        for sheet in ET.fromstring(workbook.read("xl/workbook.xml")).find("s:sheets", NS):
            relation = sheet.attrib["{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"]
            target = relations[relation].lstrip("/")
            if not target.startswith("xl/"):
                target = "xl/" + target
            rows = []
            for row in ET.fromstring(workbook.read(target)).findall("s:sheetData/s:row", NS):
                cells = {}
                for cell in row:
                    value = cell.find("s:v", NS)
                    inline = cell.find("s:is", NS)
                    text = value.text if value is not None else "".join(inline.itertext()) if inline is not None else ""
                    if cell.attrib.get("t") == "s":
                        text = strings[int(text)]
                    if text:
                        cells[cell.attrib["r"]] = text
                if cells:
                    rows.append(cells)
            record = {"name": sheet.attrib["name"], "nonemptyRows": len(rows), "firstTwoRows": rows[:2]}
            if sheet.attrib["name"] == "Ditech Suagarcane Greenhouse":
                samples = [float(value) for row in rows[2:] for ref, value in row.items() if re.fullmatch(r"A\d+", ref)]
                record["elapsedMinutes"] = {"sampleCount": len(samples), "first": samples[0], "last": samples[-1], "uniqueSteps": sorted(set(round(b-a, 9) for a, b in zip(samples, samples[1:])))}
                record["nonemptyDataColumns"] = sorted(set(re.sub(r"\d", "", ref) for row in rows[2:] for ref in row))
            sheets.append(record)
        return {"environmentNameMatches": [text for text in strings if ENVIRONMENT_NAMES.search(text)], "sheets": sheets}


def main(path):
    """只接受已核验公开归档；输出机械事实，准入结论另由证据记录说明。"""
    with open(path, "rb") as source:
        raw = source.read()
    digest = hashlib.sha256(raw).hexdigest()
    if digest != EXPECTED_SHA256:
        raise ValueError("数据包摘要变化，须先重新核验来源")
    report = {"archiveSha256": digest, "archiveBytes": len(raw), "workbooks": []}
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        for member in archive.namelist():
            if member.endswith((".xlsx", ".xlsm")):
                book = archive.read(member)
                report["workbooks"].append({"member": member, "sha256": hashlib.sha256(book).hexdigest(), **inspect_workbook(book)})
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main(sys.argv[1])
