#!/usr/bin/env python3
import csv, io, json, os, re, time
from pathlib import Path
from PIL import Image, ImageOps
import _tmp_qhz_build_final_pack as base

ROOT=base.ROOT
SEL=base.SEL
OUT=ROOT/f"_tmp_qhz_final_{os.environ['FILTER_KEY']}"
CAT=os.environ['FILTER_CATEGORY']

def main():
    cats=base.catalog(); OUT.mkdir(exist_ok=True)
    ids=[pid for pid in sorted(SEL.keys(),key=lambda x:int(x)) if cats[pid]['cat_cn']==CAT]
    records=[]; failures=[]
    for n,pid in enumerate(ids,1):
        plant=cats[pid]; title=SEL[pid]
        print(f'[{n}/{len(ids)}] {pid} {plant["name"]} <- {title}',flush=True)
        try:
            params={'action':'query','format':'json','formatversion':'2','titles':title,'prop':'imageinfo','iiprop':'url|extmetadata|size|mime'}
            data=base.get(params).json(); pages=data.get('query',{}).get('pages',[])
            if not pages or pages[0].get('missing') is not None: raise RuntimeError('Commons file title not found')
            page=pages[0]; actual=page.get('title',''); ii=(page.get('imageinfo') or [{}])[0]; md=ii.get('extmetadata') or {}
            url=ii.get('url'); mime=(ii.get('mime') or '')
            if not url or not mime.startswith('image/'): raise RuntimeError('no valid image URL')
            lic=base.clean((md.get('LicenseShortName') or {}).get('value','')); usage=base.clean((md.get('UsageTerms') or {}).get('value',''))
            if not any(k in (lic+' '+usage).lower() for k in base.ALLOWED): raise RuntimeError(f'license not allowed: {lic}/{usage}')
            raw=base.download(url); im=Image.open(io.BytesIO(raw)); im=ImageOps.exif_transpose(im).convert('RGB')
            ow,oh=im.size
            if min(ow,oh)<350: raise RuntimeError(f'image too small {im.size}')
            im.thumbnail((1800,1800),Image.Resampling.LANCZOS)
            sub=base.CATDIR[plant['cat_cn']]; (OUT/sub).mkdir(parents=True,exist_ok=True)
            safe=re.sub(r'[^a-z0-9]+','-',plant['scientific'].lower().replace('×','x')).strip('-'); rel=f'{sub}/{pid}_{safe}.jpg'
            im.save(OUT/rel,'JPEG',quality=91,optimize=True,progressive=True)
            author=base.clean((md.get('Artist') or {}).get('value','')); desc=base.clean((md.get('ImageDescription') or {}).get('value','')); source=base.clean((md.get('Credit') or {}).get('value','')) or base.clean((md.get('Source') or {}).get('value',''))
            records.append({'plant_id':pid,'category':plant['cat_cn'],'plant_cn':plant['name'],'scientific_name':plant['scientific'],'commons_title':actual,'source_page':'https://commons.wikimedia.org/wiki/'+actual.replace(' ','_'),'original_url':url,'author':author,'license':lic,'license_url':base.license_url(lic),'needs_attribution':'no' if ('cc0' in lic.lower() or 'public domain' in lic.lower()) else 'yes','source':source,'description':desc,'original_width':ow,'original_height':oh,'file':rel})
            time.sleep(0.5)
        except Exception as e:
            failures.append({'plant_id':pid,'plant_cn':plant['name'],'scientific_name':plant['scientific'],'title':title,'error':str(e)}); print(' FAIL',e,flush=True); time.sleep(1)
    fields=['plant_id','category','plant_cn','scientific_name','commons_title','source_page','original_url','author','license','license_url','needs_attribution','source','description','original_width','original_height','file']
    with (OUT/'attribution.csv').open('w',encoding='utf-8-sig',newline='') as f:
        w=csv.DictWriter(f,fieldnames=fields); w.writeheader(); w.writerows(records)
    with (OUT/'failures.csv').open('w',encoding='utf-8-sig',newline='') as f:
        w=csv.DictWriter(f,fieldnames=['plant_id','plant_cn','scientific_name','title','error']); w.writeheader(); w.writerows(failures)
    json.dump({'category':CAT,'requested':len(ids),'downloaded':len(records),'failed':len(failures),'records':records,'failures':failures},open(OUT/'manifest.json','w',encoding='utf-8'),ensure_ascii=False,indent=2)
    print(f'DONE requested={len(ids)} downloaded={len(records)} failed={len(failures)}')
if __name__=='__main__': main()
