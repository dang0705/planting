"""提取原论文补充表的固定称重字段；不拟合、不解释成用户浇水策略。"""
import hashlib
import json
import math
from pathlib import Path
import sys
import xml.etree.ElementTree as ET
import zipfile

source = Path(sys.argv[1])
destination = Path(sys.argv[2])
digest = hashlib.sha256(source.read_bytes()).hexdigest()
if digest != "e960c89a152e13f253e0000dac3b0f9ec90e395db4f25ab04372d85945a2572b":
    raise ValueError("原始制品摘要不符")
ns = {"x": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
with zipfile.ZipFile(source) as book:
    strings = ["".join(node.itertext()) for node in ET.fromstring(book.read("xl/sharedStrings.xml")).findall("x:si", ns)]
    sheet = ET.fromstring(book.read("xl/worksheets/sheet1.xml"))
    if sheet.findall(".//x:f", ns):
        raise ValueError("原始制品出现公式，需重新核验保存值")
    records = []
    excluded = []
    for row in sheet.findall("x:sheetData/x:row", ns):
        number = int(row.attrib["r"])
        cells = {}
        for cell in row:
            value = cell.findtext("x:v", namespaces=ns)
            cells["".join(c for c in cell.attrib["r"] if c.isalpha())] = strings[int(value)] if cell.attrib.get("t") == "s" else value
        if number == 1:
            for column, date in zip(["E", "F", "K", "P"], [4, 5, 6, 7]):
                if cells[column] != f"weight {date}/02/2019":
                    raise ValueError("称重列变更")
            continue
        selected = [cells.get(column) for column in ["E", "F", "K", "P", "H", "M", "R"]]
        if any(value is None for value in selected):
            excluded.append({"sourceRow": number, "reason": "称重或作者保存差值缺失；不补零"})
            continue
        values = list(map(float, selected))
        if not all(math.isfinite(value) for value in values) or any(value < 0 for value in values[:4]):
            raise ValueError("重量非法")
        weights, losses = values[:4], values[4:]
        if any(abs(weights[i] - weights[i + 1] - losses[i]) > 1e-9 for i in range(3)):
            raise ValueError(f"第{number}行称重与作者保存差值不符")
        records.append({"sourceRow": number, "genotype": cells["C"], "weightsG": weights, "authorLossG": losses})
if len(records) != 72 or [row["sourceRow"] for row in excluded] != [25, 26, 27, 28, 29]:
    raise ValueError("固定子集记录范围变更")
metadata = {
    "sourceDoi": "10.1186/s13007-019-0474-0",
    "sourceSha256": digest,
    "sourceFile": "13007_2019_474_MOESM5_ESM.xlsx",
    "sheet": "RAW Data",
    "sourceDates": ["2019-02-04", "2019-02-05", "2019-02-06", "2019-02-07"],
    "timeSemantics": "原始当地日期；精确采集时刻与时区未提供，按观察步比较",
    "unitBasis": "克；原论文方法中的盆重公式，不来自无单位列名猜测",
    "license": "CC0 1.0，按原论文数据许可声明；作者 de Ollas 等，2019",
    "excluded": excluded,
    "records": records,
}
# 每条研究记录单行，便于逐行对照原表；不保存无关生理字段。
prefix = json.dumps({key: value for key, value in metadata.items() if key != "records"}, ensure_ascii=False, indent=2)
destination.write_text(prefix[:-2] + ',\n  "records": [\n' + ',\n'.join('    ' + json.dumps(record, ensure_ascii=False) for record in records) + '\n  ]\n}\n')
print(json.dumps({"included": len(records), "excluded": len(excluded), "sha256": hashlib.sha256(destination.read_bytes()).hexdigest()}))
