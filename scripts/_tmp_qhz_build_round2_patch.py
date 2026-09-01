#!/usr/bin/env python3
import csv, html, io, json, os, re, time
from pathlib import Path
import requests
from PIL import Image, ImageOps
ROOT=Path(__file__).resolve().parents[1]
SEL=json.load(open(ROOT/'scripts/_tmp_qhz_round2_replacements.json',encoding='utf-8'))
OUT=ROOT/f"_tmp_qhz_round2_patch_{os.environ.get('PART_INDEX','0')}"
API='https://commons.wikimedia.org/w/api.php'
S=requests.Session();S.headers.update({'User-Agent':'QinghuazhiRound2Patch/1.0 (GitHub dang0705/planting)'})
CATDIR={'仙人掌/多肉':'cactus-succulent','水生植物':'aquatic','球根花卉':'bulbous','草本':'herbaceous','蔬菜':'vegetable','观叶植物':'foliage','观花植物':'flowering','香草':'herb'}
ALLOWED=('cc0','public domain','cc by','cc-by','cc by-sa','cc-by-sa','attribution')
def clean(s):
 s=re.sub(r'<[^>]+>',' ',str(s or ''));return html.unescape(re.sub(r'\s+',' ',s)).strip()
def req(params,tries=6):
 wait=.8
 for i in range(tries):
  try:
   r=S.get(API,params=params,timeout=45)
   if r.status_code==429:
    time.sleep(float(r.headers.get('Retry-After') or wait));wait=min(wait*1.8,12);continue
   r.raise_for_status();return r.json()
  except Exception:
   if i==tries-1:raise
   time.sleep(wait);wait=min(wait*1.8,12)
def download(url,tries=6):
 wait=.8
 for i in range(tries):
  try:
   r=S.get(url,timeout=75)
   if r.status_code==429:
    time.sleep(float(r.headers.get('Retry-After') or wait));wait=min(wait*1.8,15);continue
   r.raise_for_status();return r.content
  except Exception:
   if i==tries-1:raise
   time.sleep(wait);wait=min(wait*1.8,15)
def catalog():
 d={}
 with (ROOT/'docs/plant_catalog.csv').open(encoding='utf-8-sig',newline='') as f:
  for row in csv.reader(f):
   if len(row)>9:d[row[0]]={'id':row[0],'name':row[1],'cat_cn':row[4],'scientific':row[6]}
 return d
def licurl(short):
 s=short.lower();m=re.search(r'cc\s*[- ]?by\s*[- ]?sa\s*([0-9.]+)',s)
 if m:return f'https://creativecommons.org/licenses/by-sa/{m.group(1)}/'
 m=re.search(r'cc\s*[- ]?by\s*([0-9.]+)',s)
 if m:return f'https://creativecommons.org/licenses/by/{m.group(1)}/'
 if 'cc0' in s:return 'https://creativecommons.org/publicdomain/zero/1.0/'
 if 'public domain' in s:return 'https://creativecommons.org/publicdomain/mark/1.0/'
 return ''
def main():
 cats=catalog();part=int(os.environ.get('PART_INDEX','0'));count=int(os.environ.get('PART_COUNT','4'));ids=[x for i,x in enumerate(sorted(SEL,key=lambda x:int(x))) if i%count==part]
 OUT.mkdir(exist_ok=True);records=[];fails=[]
 for n,pid in enumerate(ids,1):
  plant=cats[pid];title=SEL[pid];print(f'[{n}/{len(ids)}] {pid} {plant["name"]}',flush=True)
  try:
   data=req({'action':'query','format':'json','formatversion':'2','titles':title,'prop':'imageinfo','iiprop':'url|extmetadata|size|mime','iiurlwidth':1600});pages=data.get('query',{}).get('pages',[])
   if not pages or pages[0].get('missing') is not None:raise RuntimeError('Commons title not found')
   page=pages[0];actual=page.get('title','');ii=(page.get('imageinfo') or [{}])[0];md=ii.get('extmetadata') or {};url=ii.get('thumburl') or ii.get('url');orig=ii.get('url');mime=ii.get('mime') or ''
   if not url or not mime.startswith('image/'):raise RuntimeError('invalid image')
   lic=clean((md.get('LicenseShortName') or {}).get('value',''));usage=clean((md.get('UsageTerms') or {}).get('value',''))
   if not any(k in (lic+' '+usage).lower() for k in ALLOWED):raise RuntimeError(f'license not allowed: {lic}')
   raw=download(url);im=Image.open(io.BytesIO(raw));im=ImageOps.exif_transpose(im).convert('RGB');w,h=im.size
   if min(w,h)<400:raise RuntimeError(f'image too small {w}x{h}')
   sub=CATDIR[plant['cat_cn']];(OUT/sub).mkdir(parents=True,exist_ok=True);safe=re.sub(r'[^a-z0-9]+','-',plant['scientific'].lower().replace('×','x')).strip('-');rel=f'{sub}/{pid}_{safe}.jpg';im.save(OUT/rel,'JPEG',quality=91,optimize=True,progressive=True)
   author=clean((md.get('Artist') or {}).get('value',''));desc=clean((md.get('ImageDescription') or {}).get('value',''));source=clean((md.get('Credit') or {}).get('value','')) or clean((md.get('Source') or {}).get('value',''))
   records.append({'plant_id':pid,'category':plant['cat_cn'],'plant_cn':plant['name'],'scientific_name':plant['scientific'],'commons_title':actual,'source_page':'https://commons.wikimedia.org/wiki/'+actual.replace(' ','_'),'original_url':orig,'author':author,'license':lic,'license_url':licurl(lic),'needs_attribution':'no' if ('cc0' in lic.lower() or 'public domain' in lic.lower()) else 'yes','source':source,'description':desc,'original_width':ii.get('width'),'original_height':ii.get('height'),'file':rel})
  except Exception as e:
   fails.append({'plant_id':pid,'plant_cn':plant['name'],'title':title,'error':str(e)});print(' FAIL',e,flush=True)
  time.sleep(.45)
 fields=['plant_id','category','plant_cn','scientific_name','commons_title','source_page','original_url','author','license','license_url','needs_attribution','source','description','original_width','original_height','file']
 with (OUT/'attribution.csv').open('w',encoding='utf-8-sig',newline='') as f:
  w=csv.DictWriter(f,fieldnames=fields);w.writeheader();w.writerows(records)
 json.dump({'requested':len(ids),'downloaded':len(records),'failed':len(fails),'records':records,'failures':fails},open(OUT/'manifest.json','w',encoding='utf-8'),ensure_ascii=False,indent=2)
 if fails:raise SystemExit(2)
if __name__=='__main__':main()
