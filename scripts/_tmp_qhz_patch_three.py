#!/usr/bin/env python3
import csv, io, json, re, time
from pathlib import Path
from PIL import Image, ImageOps
import _tmp_qhz_build_final_pack as base

ROOT=base.ROOT
OUT=ROOT/'_tmp_qhz_patch_three'
PATCH={
 '48':'File:Starr 070906-8755 Ficus lyrata.jpg',
 '62':'File:Hibiscus syriacus broad shrub.jpg',
 '189':"File:Courgette plant 'Diamant'.jpg",
}

def main():
    cats=base.catalog(); OUT.mkdir(exist_ok=True)
    records=[]; failures=[]
    for pid,title in PATCH.items():
        plant=cats[pid]
        print(f'{pid} {plant["name"]} <- {title}',flush=True)
        try:
            params={'action':'query','format':'json','formatversion':'2','titles':title,'prop':'imageinfo','iiprop':'url|extmetadata|size|mime','iiurlwidth':1200}
            data=base.get(params,tries=6,timeout=45).json(); pages=data.get('query',{}).get('pages',[])
            if not pages or pages[0].get('missing') is not None: raise RuntimeError('Commons file title not found')
            page=pages[0]; actual=page.get('title',''); ii=(page.get('imageinfo') or [{}])[0]; md=ii.get('extmetadata') or {}
            url=ii.get('thumburl') or ii.get('url'); original_url=ii.get('url'); mime=(ii.get('mime') or '')
            if not url or not mime.startswith('image/'): raise RuntimeError('no valid image URL')
            lic=base.clean((md.get('LicenseShortName') or {}).get('value','')); usage=base.clean((md.get('UsageTerms') or {}).get('value',''))
            if not any(k in (lic+' '+usage).lower() for k in base.ALLOWED): raise RuntimeError(f'license not allowed: {lic}/{usage}')
            raw=base.download(url,tries=6); im=Image.open(io.BytesIO(raw)); im=ImageOps.exif_transpose(im).convert('RGB')
            w,h=im.size
            if min(w,h)<450: raise RuntimeError(f'image too small {im.size}')
            sub=base.CATDIR[plant['cat_cn']]; (OUT/sub).mkdir(parents=True,exist_ok=True)
            safe=re.sub(r'[^a-z0-9]+','-',plant['scientific'].lower().replace('×','x')).strip('-'); rel=f'{sub}/{pid}_{safe}.jpg'
            im.save(OUT/rel,'JPEG',quality=91,optimize=True,progressive=True)
            author=base.clean((md.get('Artist') or {}).get('value','')); desc=base.clean((md.get('ImageDescription') or {}).get('value','')); source=base.clean((md.get('Credit') or {}).get('value','')) or base.clean((md.get('Source') or {}).get('value',''))
            records.append({'plant_id':pid,'category':plant['cat_cn'],'plant_cn':plant['name'],'scientific_name':plant['scientific'],'commons_title':actual,'source_page':'https://commons.wikimedia.org/wiki/'+actual.replace(' ','_'),'original_url':original_url,'author':author,'license':lic,'license_url':base.license_url(lic),'needs_attribution':'no' if ('cc0' in lic.lower() or 'public domain' in lic.lower()) else 'yes','source':source,'description':desc,'original_width':ii.get('width'),'original_height':ii.get('height'),'file':rel})
        except Exception as e:
            failures.append({'plant_id':pid,'plant_cn':plant['name'],'scientific_name':plant['scientific'],'title':title,'error':str(e)}); print(' FAIL',e,flush=True)
        time.sleep(0.6)
    fields=['plant_id','category','plant_cn','scientific_name','commons_title','source_page','original_url','author','license','license_url','needs_attribution','source','description','original_width','original_height','file']
    with (OUT/'attribution.csv').open('w',encoding='utf-8-sig',newline='') as f:
        w=csv.DictWriter(f,fieldnames=fields); w.writeheader(); w.writerows(records)
    json.dump({'requested':3,'downloaded':len(records),'failed':len(failures),'records':records,'failures':failures},open(OUT/'manifest.json','w',encoding='utf-8'),ensure_ascii=False,indent=2)
    if failures: raise SystemExit(2)
if __name__=='__main__': main()
