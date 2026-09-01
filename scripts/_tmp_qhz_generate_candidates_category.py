#!/usr/bin/env python3
import csv, os
import _tmp_qhz_generate_candidates as m

category = os.environ['FILTER_CATEGORY']
with m.CATALOG.open(encoding='utf-8-sig', newline='') as f:
    names = {row[1] for row in csv.reader(f) if len(row) > 5 and row[4] == category and row[1] in m.TSET}
m.TARGETS = [name for name in m.TARGETS if name in names]
m.OUT = m.ROOT / f"_tmp_qhz_candidates_{os.environ.get('FILTER_KEY','part')}"
print(f"CATEGORY {category}: {len(m.TARGETS)} targets", flush=True)
m.main()
