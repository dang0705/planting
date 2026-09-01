#!/usr/bin/env python3
import csv, html, io, json, os, re, sys, time
from pathlib import Path
import requests
from PIL import Image, ImageOps

ROOT=Path(__file__).resolve().parents[1]
SEL=json.load(open(ROOT/'scripts/_tmp_qhz_final_titles.json',encoding='utf-8'))
CATALOG=ROOT/'docs/plant_catalog.csv'
OUT=ROOT/'_tmp_qhz_final'
API='https://commons.wikimedia.org/w/api.php'
UA='QinghuazhiMVPFinalAssetBuilder/2.0 (GitHub dang0705/planting)'
S=requests.Session(); S.headers.update({'User-Agent':UA})
CATDIR={'仙人掌/多肉':'cactus-succulent','水生植物':'aquatic','球根花卉':'bulbous','草本':'herbaceous','蔬菜':'vegetable','观叶植物':'foliage','观花植物':'flowering','香草':'herb'}
ALLOWED=('cc0','public domain','cc by','cc-by','cc by-sa','cc-by-sa','attribution')

def clean(s):
    s=re.sub(r'<[^>]+>',' ',str(s or '')); return html.unescape(re.sub(r'\s+',' ',s)).strip()

def get(params,tries=10,timeout=60):
    wait=1.5
    for i in range(tries):
        try:
            r=S.get(API,params=params,timeout=timeout)
            if r.status_code==429:
                time.sleep(float(r.headers.get('Retry-After') or wait)); wait=min(wait*1.8,25); continue
            r.raise_for_status(); return r
        except Exception:
            if i==tries-1: raise
            time.sleep(wait); wait=min(wait*1.8,25)

def download(url,tries=10):
    wait=1.5
    for i in range(tries):
        try:
            r=S.get(url,timeout=90)
            if r.status_code==429:
                time.sleep(float(r.headers.get('Retry-After') or wait)); wait=min(wait*1.8,30); continue
            r.raise_for_status(); return r.content
        except Exception:
            if i==tries-1: raise
            time.sleep(wait); wait=min(wait*1.8,30)

def catalog():
    d={}
    with CATALOG.open(encoding='utf-8-sig',newline='') as f:
        for row in csv.reader(f):
            if len(row)>9:
                d[row[0]]={'id':row[0],'name':row[1],'cat_cn':row[4],'cat_en':row[5],'scientific':row[6],'family_cn':row[7],'family_en':row[8],'genus':row[9]}
    return d

def license_url(short):
    s=short.lower().replace('creative commons','').strip()
    m=re.search(r'cc\s*[- ]?by\s*[- ]?sa\s*([0-9.]+)',s)
    if m:return f'https://creativecommons.org/licenses/by-sa/{m.group(1)}/'
    m=re.search(r'cc\s*[- ]?by\s*([0-9.]+)',s)
    if m:return f'https://creativecommons.org/licenses/by/{m.group(1)}/'
    if 'cc0' in s:return 'https://creativecommons.org/publicdomain/zero/1.0/'
    if 'public domain' in s:return 'https://creativecommons.org/publicdomain/mark/1.0/'
    return ''

def main():
    cats=catalog(); OUT.mkdir(exist_ok=True)
    records=[]; failures=[]
    ids=sorted(SEL.keys(),key=lambda x:int(x))
    if len(ids)!=188: raise SystemExit(f'expected 188 selections, got {len(ids)}')
    for n,pid in enumerate(ids,1):
        plant=cats[pid]; title=SEL[pid]
        print(f'[{n}/188] {pid} {plant["name"]} <- {title}',flush=True)
        try:
            params={'action':'query','format':'json','formatversion':'2','titles':title,'prop':'imageinfo','iiprop':'url|extmetadata|size|mime'}
            data=get(params).json(); pages=data.get('query',{}).get('pages',[])
            if not pages or pages[0].get('missing') is not None: raise RuntimeError('Commons file title not found')
            page=pages[0]; actual=page.get('title',''); ii=(page.get('imageinfo') or [{}])[0]; md=ii.get('extmetadata') or {}
            url=ii.get('url'); mime=(ii.get('mime') or '')
            if not url or not mime.startswith('image/'): raise RuntimeError('no valid image URL')
            lic=clean((md.get('LicenseShortName') or {}).get('value',''))
            usage=clean((md.get('UsageTerms') or {}).get('value',''))
            if not any(k in (lic+' '+usage).lower() for k in ALLOWED): raise RuntimeError(f'license not allowed: {lic}/{usage}')
            raw=download(url)
            im=Image.open(io.BytesIO(raw)); im=ImageOps.exif_transpose(im).convert('RGB')
            ow,oh=im.size
            if min(ow,oh)<450: raise RuntimeError(f'image too small {im.size}')
            im.thumbnail((1800,1800),Image.Resampling.LANCZOS)
            sub=CATDIR[plant['cat_cn']]; path=OUT/sub; path.mkdir(parents=True,exist_ok=True)
            safe=re.sub(r'[^a-z0-9]+','-',plant['scientific'].lower().replace('×','x')).strip('-')
            fn=f'{pid}_{safe}.jpg'; rel=f'{sub}/{fn}'
            im.save(OUT/rel,'JPEG',quality=91,optimize=True,progressive=True)
            author=clean((md.get('Artist') or {}).get('value',''))
            desc=clean((md.get('ImageDescription') or {}).get('value',''))
            source=clean((md.get('Credit') or {}).get('value','')) or clean((md.get('Source') or {}).get('value',''))
            records.append({'plant_id':pid,'category':plant['cat_cn'],'plant_cn':plant['name'],'scientific_name':plant['scientific'],'commons_title':actual,'source_page':'https://commons.wikimedia.org/wiki/'+actual.replace(' ','_'),'original_url':url,'author':author,'license':lic,'license_url':license_url(lic),'needs_attribution':'no' if ('cc0' in lic.lower() or 'public domain' in lic.lower()) else 'yes','source':source,'description':desc,'original_width':ow,'original_height':oh,'file':rel})
            time.sleep(0.8)
        except Exception as e:
            failures.append({'plant_id':pid,'plant_cn':plant['name'],'scientific_name':plant['scientific'],'title':title,'error':str(e)})
            print(' FAIL',e,flush=True)
            time.sleep(2)
    fields=['plant_id','category','plant_cn','scientific_name','commons_title','source_page','original_url','author','license','license_url','needs_attribution','source','description','original_width','original_height','file']
    with (OUT/'attribution.csv').open('w',encoding='utf-8-sig',newline='') as f:
        w=csv.DictWriter(f,fieldnames=fields); w.writeheader(); w.writerows(records)
    json.dump({'requested':188,'downloaded':len(records),'failed':len(failures),'records':records,'failures':failures},open(OUT/'manifest.json','w',encoding='utf-8'),ensure_ascii=False,indent=2)
    if failures:
        with (OUT/'failures.csv').open('w',encoding='utf-8-sig',newline='') as f:
            w=csv.DictWriter(f,fieldnames=['plant_id','plant_cn','scientific_name','title','error']); w.writeheader(); w.writerows(failures)
    print(f'DONE downloaded={len(records)} failed={len(failures)}',flush=True)
    if len(records)!=188: raise SystemExit(2)
if __name__=='__main__': main()
