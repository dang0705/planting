"""复核孙等（2024）指定原始工作簿的配对结构；不运行宏、不联网、不拟合模型。

仅接受已核验的文件摘要，避免把固定工作表顺序套用到其他工作簿。
输出是数据资格证据，不是产品测试、测量单位确认或生产策略。
"""
import collections
import datetime
import hashlib
import json
from pathlib import Path
import re
import sys
import xml.etree.ElementTree as ET
import zipfile

EXPECTED_SHA256 = "debb6104d928bd932bf089487d653ed0aa4c4498f8bc257a772776f58b1943c3"
path = Path(sys.argv[1])
content = path.read_bytes()
digest = hashlib.sha256(content).hexdigest()
if digest != EXPECTED_SHA256:
    raise SystemExit("文件摘要不符：本工具仅复核已登记版本，不解释其他工作簿。")

ns = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
result = {"bytes": len(content), "sha256": digest, "tables": {}, "missingData": []}
grids = {}
headers_by_sheet = {}
with zipfile.ZipFile(path) as archive:
    strings = ["".join(item.itertext()) for item in ET.fromstring(
        archive.read("xl/sharedStrings.xml")).findall("m:si", ns)]

    def value(cell):
        """读取文件保存的数值，不执行公式或将缺失值变成零。"""
        child = cell.find("m:v", ns)
        if child is None:
            return None
        return strings[int(child.text)] if cell.get("t") == "s" else float(child.text)

    for index, name in enumerate(("genotype", "Transpiration", "environment", "soil VWC", "Daily Transpiration"), 1):
        rows = ET.fromstring(archive.read(f"xl/worksheets/sheet{index}.xml")).findall("m:sheetData/m:row", ns)
        headers = {re.sub(r"\d+$", "", cell.get("r")): value(cell) for cell in rows[0] if value(cell) is not None}
        headers_by_sheet[name] = list(headers.values())
        data = []
        for row in rows[1:]:
            record = {re.sub(r"\d+$", "", cell.get("r")): value(cell) for cell in row}
            if record.get("A") is None:
                continue
            data.append(record)
            for column, heading in headers.items():
                if record.get(column) is None:
                    result["missingData"].append({"sheet": name, "cell": column + row.get("r"), "heading": heading, "record": record["A"]})
        numeric = [record[column] for column in headers if column != "A" for record in data
                   if isinstance(record.get(column), (int, float))]
        result["tables"][name] = {"dataRows": len(data), "columns": len(headers)}
        if numeric and name != "genotype":
            result["tables"][name]["rawRange"] = {"min": min(numeric), "max": max(numeric)}
        if name == "environment":
            result["tables"][name]["fields"] = {
                heading: {"min": min(record[column] for record in data), "max": max(record[column] for record in data)}
                for column, heading in headers.items() if column != "A"
            }
            del result["tables"][name]["rawRange"]
        if name == "genotype":
            counts = collections.Counter(record["B"] for record in data)
            result["genotypeCount"] = len(counts)
            result["potsPerGenotype"] = dict(collections.Counter(counts.values()))
        grids[name] = [record["A"] for record in data]

grid = grids["environment"]
result["identicalTimeGrids"] = grid == grids["Transpiration"] == grids["soil VWC"]
result["samePotHeaders"] = headers_by_sheet["Transpiration"] == headers_by_sheet["soil VWC"]
result["timeStepMinutes"] = sorted(set(round((right - left) * 1440, 5) for left, right in zip(grid, grid[1:])))
# 此工作簿使用 Excel 1900 日期系统。未添加来源没有提供的时区。
epoch = datetime.datetime(1899, 12, 30)
for key, serial in (("timeStartWithoutZone", grid[0]), ("timeEndWithoutZone", grid[-1])):
    result[key] = (epoch + datetime.timedelta(days=serial)).strftime("%Y-%m-%d %H:%M:%S")
result["pairedNonmissingRows"] = len(grid) * (len(headers_by_sheet["Transpiration"]) - 1) - len(result["missingData"])
result["scope"] = "file_structure_only"
print(json.dumps(result, ensure_ascii=False, indent=2, allow_nan=False))
