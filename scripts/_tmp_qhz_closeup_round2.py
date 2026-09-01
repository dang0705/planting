#!/usr/bin/env python3
import csv, html, io, json, os, re, time
from pathlib import Path
import requests
from PIL import Image, ImageOps, ImageDraw
ROOT=Path(__file__).resolve().parents[1]
API='https://commons.wikimedia.org/w/api.php'
S=requests.Session();S.headers.update({'User-Agent':'QinghuazhiCloseupRound2/1.0 (GitHub dang0705/planting)'})
IDS={7,10,23,24,26,28,43,53,56,60,61,62,117,120,134,136,139,140,148,149,151,153,156,158,161,162,170,174,177,187}
OUT=ROOT/f"_tmp_qhz_round2_{os.environ.get('PART_INDEX','0')}"
BAD=('herbarium','specimen','pressed','seed','pollen','fruit only','slice','section','microscope','disease','virus','rust','mildew','fungus','insect','aphid','thrips','mite','gall','damage','dead','wilt','bark','wood','label','sign','illustration','drawing','plate')
GOOD=('potted','in pot','pot plant','container','houseplant','whole plant','habit','cultivated','nursery','single plant','garden plant')
BADVIEW=('flower close','flower detail','macro','close-up flower','blossom detail','field','forest','avenue','street tree','landscape','garden view','hedge')
def clean(s):
 s=re.sub(r'<[^>]+>',' ',str(s or ''));return html.unescape(re.sub(r'\s+',' ',s)).strip()
def req(params,tries=6):
 wait=1
 for i in range(tries):
  try:
   r=S.get(API,params=params,timeout=45)
   if r.status_code==429:
    time.sleep(float(r.headers.get('Retry-After') or wait));wait=min(wait*1.8,15);continue
   r.raise_for_status();return r.json()
  except Exception:
   if i==tries-1:raise
   time.sleep(wait);wait=min(wait*1.8,15)
def catalog():
 d={}
 with (ROOT/'docs/plant_catalog.csv').open(encoding='utf-8-sig',newline='') as f:
  for row in csv.reader(f):
   if len(row)>9 and row[0].isdigit() and int(row[0]) in IDS:d[int(row[0])]={'id':int(row[0]),'name':row[1],'scientific':row[6]}
 return d
def base_taxon(s):return re.sub(r"\s+'[^']+'$",'',s.replace('×','x').replace(' spp.','').replace(' sp.','')).strip()
def search(row):
 tax=base_taxon(row['scientific']);queries=[f'"{tax}" potted',f'"{tax}" "in pot"',f'"{tax}" container',f'"{tax}" cultivated',f'"{tax}" "whole plant"',f'"{tax}" habit',f'"{tax}"']
 allp=[];seen=set()
 for q in queries:
  try:data=req({'action':'query','format':'json','formatversion':'2','generator':'search','gsrnamespace':6,'gsrsearch':q,'gsrlimit':40,'prop':'imageinfo|categories','iiprop':'url|extmetadata|size|mime','iiurlwidth':1000,'cllimit':'max'})
  except Exception:continue
  for p in data.get('query',{}).get('pages',[]):
   if p.get('title') not in seen:seen.add(p.get('title'));allp.append(p)
  if len(allp)>=80:break
  time.sleep(.5)
 return allp
def score(p,row):
 ii=(p.get('imageinfo') or [{}])[0];md=ii.get('extmetadata') or {};mime=(ii.get('mime') or '').lower()
 if not mime.startswith('image/') or mime in ('image/svg+xml','image/gif'):return None
 title=p.get('title','');cats=' '.join(x.get('title','') for x in p.get('categories',[]));desc=' '.join(clean((md.get(k) or {}).get('value','')) for k in ('ImageDescription','ObjectName','Categories','Credit','Source'))
 text=(title+' '+cats+' '+desc).lower();lic=clean((md.get('LicenseShortName') or {}).get('value','')).lower()
 if not any(x in lic for x in ('cc0','public domain','cc by','cc-by','cc by-sa','cc-by-sa')):return None
 if any(x in text for x in BAD):return None
 tax=base_taxon(row['scientific']).lower();parts=tax.split();sc=0
 if tax in text:sc+=180
 if parts and parts[0] in text:sc+=40
 if len(parts)>1 and parts[1] in text:sc+=70
 for x in GOOD:
  if x in text:sc+=60
 for x in BADVIEW:
  if x in text:sc-=55
 low=title.lower()
 for x in ('flower','flowers','blossom','bloom','fruit','fruits','seed','detail','macro'):
  if x in low:sc-=30
 for x in ('pot','potted','plant','habit','cultivar'):
  if x in low:sc+=20
 w=ii.get('width') or 0;h=ii.get('height') or 0
 if min(w,h)>=1200:sc+=20
 elif min(w,h)>=700:sc+=10
 if max(w,h)>0 and min(w,h)/max(w,h)>.55:sc+=15
 return sc
def thumb(p):
 ii=(p.get('imageinfo') or [{}])[0];u=ii.get('thumburl') or ii.get('url')
 if not u:return None
 try:
  r=S.get(u,timeout=60);r.raise_for_status();im=Image.open(io.BytesIO(r.content));im=ImageOps.exif_transpose(im).convert('RGB');im.thumbnail((280,205));return im
 except:return None
def main():
 rows=catalog();part=int(os.environ.get('PART_INDEX','0'));count=int(os.environ.get('PART_COUNT','4'));ids=[pid for i,pid in enumerate(sorted(rows)) if i%count==part]
 OUT.mkdir(exist_ok=True);(OUT/'thumbs').mkdir(exist_ok=True);records=[]
 for ri,pid in enumerate(ids,1):
  row=rows[pid];print(f'[{ri}/{len(ids)}] {pid} {row["name"]}',flush=True);pages=search(row);rank=[]
  for p in pages:
   s=score(p,row)
   if s is not None:rank.append((s,p))
  rank.sort(key=lambda x:x[0],reverse=True);c=[]
  for s,p in rank:
   im=thumb(p)
   if im is None:continue
   n=len(c)+1;fn=f'{pid}_c{n}.jpg';im.save(OUT/'thumbs'/fn,quality=88);ii=(p.get('imageinfo') or [{}])[0];md=ii.get('extmetadata') or {}
   c.append({'n':n,'score':s,'title':p.get('title',''),'url':ii.get('url',''),'thumburl':ii.get('thumburl',''),'author':clean((md.get('Artist') or {}).get('value','')),'license':clean((md.get('LicenseShortName') or {}).get('value','')),'description':clean((md.get('ImageDescription') or {}).get('value','')),'thumb':fn})
   if len(c)>=10:break
  records.append({'plant':row,'candidates':c});time.sleep(.6)
 with (OUT/'candidates.json').open('w',encoding='utf-8') as f:json.dump(records,f,ensure_ascii=False,indent=2)
 tw,th=220,165;lw=150;rh=193;m=5;W=lw+10*(tw+m);H=m+len(records)*rh;sheet=Image.new('RGB',(W,H),'white');d=ImageDraw.Draw(sheet)
 for rix,item in enumerate(records):
  y=m+rix*rh;p=item['plant'];d.text((m,y+4),f"{p['id']} {p['name']}",fill='black');d.text((m,y+22),p['scientific'][:23],fill='black')
  for ci,c in enumerate(item['candidates']):
   im=Image.open(OUT/'thumbs'/c['thumb']).convert('RGB');x=lw+ci*(tw+m);sheet.paste(im,(x+(tw-im.width)//2,y+(th-im.height)//2));d.text((x,y+th+2),f"C{ci+1} {c['title'][5:25]}",fill='black')
 sheet.save(OUT/'sheet.jpg',quality=88)
if __name__=='__main__':main()
