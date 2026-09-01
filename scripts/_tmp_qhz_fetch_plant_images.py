#!/usr/bin/env python3
import csv
import html
import io
import json
import os
import re
import sys
import time
import unicodedata
from pathlib import Path
from urllib.parse import quote

import requests
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / "docs" / "plant_catalog.csv"
OUT = ROOT / "_tmp_qhz_images"

TARGETS = """
生石花
不死鸟
乙女心
仙人球
佛珠
吉娃娃
条纹十二卷
桃蛋
玉树
玉缀
瓦松
白鸟
绯牡丹
胧月
芦荟
落地生根
虹之玉
量天尺
金枝玉叶
金琥
长生草
鹿角海棠
龙骨
睡莲
再力花
凤眼莲
旱伞草
梭鱼草
水葱
荷花
金钱蒲
铜钱草
番红花
郁金香
唐菖蒲
朱顶红
水仙
风信子
罗勒
香菜
上海青
丝瓜
南瓜
四季豆
小青菜
小香葱
油麦菜
甜椒
生菜
矮生番茄
矮生辣椒
秋葵
羽衣甘蓝
芝麻菜
苦瓜
茄子
草莓
菠菜
西葫芦
豆角
豌豆
韭菜
黄瓜
空气凤梨
万年青
冷水花
卷叶吊兰
卷柏
发财树
吊兰
吊竹梅
姬龟背
孔雀竹芋
富贵竹
巴西木
常春藤
幸福树
彩叶芋
散尾葵
文竹
棕竹
橡皮树
油画吊兰
波士顿蕨
海芋
滴水观音
狐尾天门冬
琴叶榕
白掌
白玉虎皮兰
白脉椒草
白蝶合果芋
祈祷草
福禄桐
紫露草
网纹草
花叶椒草
蔓绿绒
袖珍椰子
裂叶喜林芋
西瓜皮椒草
豆瓣绿
酒瓶兰
金边富贵竹
金钱树
金钻蔓绿绒
铁线蕨
银皇后
镜面草
青苹果竹芋
鸟巢蕨
鹅掌柴
鹿角蕨
黛粉叶
龙血树
百合
花烛
蝴蝶兰
铁线莲
一品红
三色堇
三角梅
丽格海棠
仙客来
倒挂金钟
凌霄
向日葵
君子兰
四季海棠
夜来香
大丽花
大岩桐
天竺葵
夹竹桃
姜荷花
康乃馨
扶郎花
旱金莲
月季
木槿
木芙蓉
木香花
杜鹃花
栀子花
桂花
炮仗花
牵牛花
玛格丽特
玫瑰
球兰
百日草
矮牵牛
石竹
紫罗兰
紫薇
红掌
络石
绣球花
美人蕉
茉莉花
茑萝
茶花
蓝雪花
虎刺梅
蟹爪兰
金盏花
金银花
金鱼草
长寿花
长春花
雏菊
非洲堇
马蹄莲
鸡冠花
鸡蛋花
鸢尾
柠檬香蜂草
欧芹
牛至
百里香
碰碰香
紫苏
细香葱
茴香
莳萝
薄荷
迷迭香
鼠尾草
""".strip().splitlines()
TARGETS = [x.strip() for x in TARGETS if x.strip()]
TARGET_SET = set(TARGETS)

COMMONS_API = "https://commons.wikimedia.org/w/api.php"
UA = "QinghuazhiMVPAssetCollector/1.0 (educational plant-care app; contact via GitHub dang0705/planting)"
SESSION = requests.Session()
SESSION.headers.update({"User-Agent": UA})

ALLOWED_LICENSE_TOKENS = (
    "cc0", "public domain", "cc by", "cc-by", "cc by-sa", "cc-by-sa",
    "attribution", "attribution-share alike", "attribution-sharealike"
)
REJECT_TEXT = (
    "watermark", "logo", "illustration", "drawing", "diagram", "map", "herbarium sheet",
    "pressed specimen", "label", "stamp", "poster", "book plate", "botanical illustration"
)
AUTHORITY_TEXT = (
    "botanic garden", "botanical garden", "arboretum", "university", "kew", "missouri botanical",
    "new york botanical", "royal botanic", "usda", "smithsonian", "naturalis", "museum",
    "植物园", "植物園", "大学", "大學"
)

CATEGORY_DIR = {
    "Succulent": "cactus-succulent",
    "Aquatic": "aquatic",
    "Bulb": "bulbous",
    "Herbaceous": "herbaceous",
    "Vegetable": "vegetable",
    "Foliage": "foliage",
    "Flowering": "flowering",
    "Herb": "herb",
}

# Exact category labels in the user's requested grouping; used if CSV English labels differ.
CN_CATEGORY_DIR = {
    "仙人掌/多肉": "cactus-succulent",
    "水生植物": "aquatic",
    "球根花卉": "bulbous",
    "草本": "herbaceous",
    "蔬菜": "vegetable",
    "观叶植物": "foliage",
    "观花植物": "flowering",
    "香草": "herb",
}


def clean_html(s):
    if not s:
        return ""
    s = re.sub(r"<[^>]+>", " ", str(s))
    return html.unescape(re.sub(r"\s+", " ", s)).strip()


def slugify(s):
    s = unicodedata.normalize("NFKD", s)
    s = re.sub(r"[^A-Za-z0-9]+", "-", s).strip("-").lower()
    return s or "plant"


def read_catalog():
    rows = {}
    with CATALOG.open("r", encoding="utf-8-sig", newline="") as f:
        for row in csv.reader(f):
            if len(row) < 10:
                continue
            name = row[1].strip()
            if name not in TARGET_SET:
                continue
            rows[name] = {
                "id": row[0].strip(),
                "name": name,
                "image": row[2].strip(),
                "desc": row[3].strip(),
                "category_cn": row[4].strip(),
                "category_en": row[5].strip(),
                "scientific": row[6].strip(),
                "family_cn": row[7].strip(),
                "family_en": row[8].strip(),
                "genus": row[9].strip(),
            }
    missing = [x for x in TARGETS if x not in rows]
    if missing:
        raise RuntimeError(f"{len(missing)} target names absent from plant_catalog.csv: {missing}")
    if len(rows) != len(TARGETS):
        raise RuntimeError(f"expected {len(TARGETS)} targets, got {len(rows)}")
    return rows


def query_commons(search_term, limit=30):
    params = {
        "action": "query",
        "format": "json",
        "formatversion": "2",
        "generator": "search",
        "gsrnamespace": 6,
        "gsrsearch": search_term,
        "gsrlimit": limit,
        "prop": "imageinfo|categories",
        "iiprop": "url|extmetadata|size|mime",
        "iiurlwidth": 1800,
        "cllimit": "max",
    }
    r = SESSION.get(COMMONS_API, params=params, timeout=30)
    r.raise_for_status()
    return r.json().get("query", {}).get("pages", [])


def norm_taxon(scientific):
    s = scientific.replace("×", "x").replace(" spp.", "").replace(" sp.", "")
    s = re.sub(r"\s+'[^']+'$", "", s)
    s = re.sub(r"\s+var\.\s+.*$", "", s, flags=re.I)
    s = re.sub(r"\s+subsp\.\s+.*$", "", s, flags=re.I)
    s = re.sub(r"\s+f\.\s+.*$", "", s, flags=re.I)
    return s.strip()


def candidate_score(page, scientific, cn_name):
    ii = (page.get("imageinfo") or [{}])[0]
    md = ii.get("extmetadata") or {}
    title = page.get("title", "")
    cats = " ".join(x.get("title", "") for x in page.get("categories", []))
    desc = " ".join(clean_html((md.get(k) or {}).get("value", "")) for k in (
        "ImageDescription", "ObjectName", "Categories", "Credit", "Source", "Attribution"
    ))
    alltxt = f"{title} {cats} {desc}".lower()
    lic = clean_html((md.get("LicenseShortName") or {}).get("value", "")).lower()
    usage = clean_html((md.get("UsageTerms") or {}).get("value", "")).lower()
    mime = (ii.get("mime") or "").lower()

    if not mime.startswith("image/") or mime in {"image/svg+xml", "image/gif"}:
        return None
    if any(t in alltxt for t in REJECT_TEXT):
        return None
    if not any(t in f"{lic} {usage}" for t in ALLOWED_LICENSE_TOKENS):
        return None

    taxon = norm_taxon(scientific).lower()
    parts = [p for p in re.split(r"\s+", taxon) if p and p != "x"]
    genus = parts[0] if parts else ""
    species = parts[1] if len(parts) > 1 else ""
    score = 0
    if taxon and taxon in alltxt:
        score += 80
    if genus and genus in alltxt:
        score += 25
    if species and species in alltxt:
        score += 35
    if cn_name.lower() in alltxt:
        score += 10
    if any(t in alltxt for t in AUTHORITY_TEXT):
        score += 30
    if "own work" in alltxt or "self-photographed" in alltxt:
        score += 5
    width = ii.get("width") or 0
    height = ii.get("height") or 0
    if min(width, height) >= 1000:
        score += 15
    elif min(width, height) >= 600:
        score += 8
    if max(width, height) < 500:
        score -= 40
    if "cc0" in lic or "public domain" in lic:
        score += 12
    elif "cc by " in lic or "cc-by-" in lic:
        score += 8
    # Prefer photos that show the whole plant over flowers/details when filenames say so.
    lowtitle = title.lower()
    for bad in ("flower", "flowers", "closeup", "close-up", "leaf detail", "detail", "fruit", "seed", "root"):
        if bad in lowtitle:
            score -= 12
    return score


def choose_candidate(row):
    scientific = row["scientific"]
    cn = row["name"]
    terms = []
    base = norm_taxon(scientific)
    if base:
        terms.append(f'"{base}"')
        # For cultivar/variety rows, also try the genus/species baseline.
        base2 = " ".join(base.split()[:2])
        if base2 and base2 != base:
            terms.append(f'"{base2}"')
    terms.append(f'"{cn}"')
    terms.append(base or scientific)

    seen = set()
    scored = []
    for term in terms:
        try:
            pages = query_commons(term, 40)
        except Exception as e:
            print(f"WARN search {cn} {term}: {e}", file=sys.stderr)
            continue
        for p in pages:
            title = p.get("title", "")
            if title in seen:
                continue
            seen.add(title)
            s = candidate_score(p, scientific, cn)
            if s is not None:
                scored.append((s, p))
        if scored and max(x[0] for x in scored) >= 75:
            break
        time.sleep(0.15)
    if not scored:
        return None
    scored.sort(key=lambda x: x[0], reverse=True)
    return scored[0]


def extval(md, key):
    return clean_html((md.get(key) or {}).get("value", ""))


def save_image(page, row, outpath):
    ii = (page.get("imageinfo") or [{}])[0]
    url = ii.get("thumburl") or ii.get("url")
    if not url:
        raise RuntimeError("candidate has no image URL")
    r = SESSION.get(url, timeout=90)
    r.raise_for_status()
    im = Image.open(io.BytesIO(r.content))
    im = ImageOps.exif_transpose(im).convert("RGB")
    # Keep enough detail for product UI while preventing a 188-image pack from becoming huge.
    im.thumbnail((1600, 1600), Image.Resampling.LANCZOS)
    if min(im.size) < 420:
        raise RuntimeError(f"image too small after decode: {im.size}")
    outpath.parent.mkdir(parents=True, exist_ok=True)
    im.save(outpath, "JPEG", quality=90, optimize=True, progressive=True)
    return im.size


def main():
    rows = read_catalog()
    OUT.mkdir(parents=True, exist_ok=True)
    records = []
    failures = []

    for idx, name in enumerate(TARGETS, 1):
        row = rows[name]
        scientific = row["scientific"]
        print(f"[{idx}/{len(TARGETS)}] {name} / {scientific}", flush=True)
        pick = choose_candidate(row)
        if not pick:
            failures.append((name, scientific, "no licensed matching Commons candidate"))
            print("  FAIL no candidate", flush=True)
            continue
        score, page = pick
        ii = (page.get("imageinfo") or [{}])[0]
        md = ii.get("extmetadata") or {}
        category_dir = CN_CATEGORY_DIR.get(row["category_cn"]) or CATEGORY_DIR.get(row["category_en"]) or "other"
        taxon_slug = slugify(norm_taxon(scientific))
        filename = f"{row['id']}_{taxon_slug}.jpg"
        relpath = Path(category_dir) / filename
        outpath = OUT / relpath
        try:
            size = save_image(page, row, outpath)
        except Exception as e:
            failures.append((name, scientific, f"download/decode failed: {e}"))
            print(f"  FAIL {e}", flush=True)
            continue

        source_page = "https://commons.wikimedia.org/wiki/" + quote(page.get("title", "").replace(" ", "_"), safe=":()_',-")
        license_name = extval(md, "LicenseShortName") or extval(md, "UsageTerms")
        license_url = extval(md, "LicenseUrl")
        author = extval(md, "Artist") or extval(md, "Author") or extval(md, "Credit")
        source = extval(md, "Source")
        attribution = extval(md, "Attribution")
        image_desc = extval(md, "ImageDescription")
        records.append({
            "category": row["category_cn"],
            "plant_cn": name,
            "plant_id": row["id"],
            "scientific_name": scientific,
            "selected_commons_title": page.get("title", ""),
            "match_score": score,
            "source_page": source_page,
            "source": source,
            "author": author,
            "license": license_name,
            "license_url": license_url,
            "attribution": attribution,
            "needs_attribution": "no" if ("cc0" in license_name.lower() or "public domain" in license_name.lower()) else "yes",
            "width": size[0],
            "height": size[1],
            "file": str(relpath),
            "description": image_desc,
        })
        print(f"  OK score={score} {page.get('title')} -> {relpath}", flush=True)
        time.sleep(0.1)

    fields = [
        "category", "plant_cn", "plant_id", "scientific_name", "selected_commons_title", "match_score",
        "source_page", "source", "author", "license", "license_url", "attribution", "needs_attribution",
        "width", "height", "file", "description"
    ]
    with (OUT / "attribution.csv").open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        w.writerows(records)

    with (OUT / "failures.csv").open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)
        w.writerow(["plant_cn", "scientific_name", "reason"])
        w.writerows(failures)

    with (OUT / "manifest.json").open("w", encoding="utf-8") as f:
        json.dump({"requested": len(TARGETS), "downloaded": len(records), "failures": failures, "records": records}, f, ensure_ascii=False, indent=2)

    print(f"DONE requested={len(TARGETS)} downloaded={len(records)} failed={len(failures)}")
    # Fail the job if coverage is not complete so we do not accidentally deliver a partial pack as final.
    if failures:
        sys.exit(2)


if __name__ == "__main__":
    main()
