#!/usr/bin/env python3
import csv, html, io, json, os, re, time
from pathlib import Path
import requests
from PIL import Image, ImageOps, ImageDraw

ROOT=Path(__file__).resolve().parents[1]
CATALOG=ROOT/'docs'/'plant_catalog.csv'
API='https://commons.wikimedia.org/w/api.php'
S=requests.Session(); S.headers.update({'User-Agent':'QinghuazhiMVPAssetReview/1.2 (GitHub dang0705/planting)'})
TARGETS='''姬龟背
小香葱
茄子
小青菜
矮生番茄
矮生辣椒
草莓
豆角
吊竹梅
巴西木
散尾葵
油画吊兰
海芋
白掌
白玉虎皮兰
网纹草
蔓绿绒
金边富贵竹
金钻蔓绿绒
银皇后
炮仗花
玫瑰
大丽花
络石
木香花
金银花
橡皮树
袖珍椰子
豆瓣绿
冷水花
香菜
条纹十二卷
丝瓜
南瓜
油麦菜
菠菜
祈祷草
青苹果竹芋
绯牡丹
常春藤
百合
蝴蝶兰
铁线莲
丽格海棠
倒挂金钟
凌霄
向日葵
君子兰
桂花
绣球花
茑萝
长寿花
鸡蛋花
鸢尾'''.splitlines()
PART=int(os.environ.get('PART_INDEX','0')); PARTS=int(os.environ.get('PART_COUNT','1'))
OUT=ROOT/f'_tmp_qhz_targeted_{PART}'
BAD=('herbarium','specimen','pressed','illustration','drawing','diagram','plate','seed','pollen','slice','section','microscope','macro','close-up','closeup','detail','disease','virus','rust','mildew','fungus','insect','aphid','thrips','mite','gall','damage','dead','wilt','bark','wood','stem section','fruit only')
GOOD=('habit','habitus','whole plant','potted','in pot','cultivated','botanical garden','botanic garden','nursery','shrub','vine','clump','plant')

def clean(s):
    s=re.sub(r'<[^>]+>',' ',str(s or '')); return html.unescape(re.sub(r'\s+',' ',s)).strip()

def req(params, tries=6):
    wait=1.5
    for i in range(tries):
        r=S.get(API,params=params,timeout=45)
        if r.status_code==429:
            time.sleep(float(r.headers.get('Retry-After') or wait)); wait=min(wait*1.8,18); continue
        r.raise_for_status(); return r.json()
    raise RuntimeError('rate limit')

def base(s):
    s=s.replace('×','x').replace(' spp.','').replace(' sp.','')
    s=re.sub(r"\s+'[^']+'$",'',s)
    return s.strip()

def rows():
    wanted=set(TARGETS); out={}
    with CATALOG.open(encoding='utf-8-sig',newline='') as f:
        for r in csv.reader(f):
            if len(r)>9 and r[1] in wanted:
                out[r[1]]={'id':r[0],'name':r[1],'scientific':r[6],'cat_cn':r[4]}
    return out

def search(row):
    tax=base(row['scientific']); terms=[]
    for suffix in (' habit',' potted',' cultivated',''):
        terms.append(f'"{tax}"{suffix}')
    seen={};
    for term in terms:
        p={'action':'query','format':'json','formatversion':'2','generator':'search','gsrnamespace':6,'gsrsearch':term,'gsrlimit':30,
           'prop':'imageinfo|categories','iiprop':'url|extmetadata|size|mime','iiurlwidth':900,'cllimit':'max','maxlag':5}
        try: pages=req(p).get('query',{}).get('pages',[])
        except Exception: pages=[]
        for x in pages: seen.setdefault(x.get('title',''),x)
        time.sleep(.5)
    return list(seen.values())

def score(p,row):
    ii=(p.get('imageinfo') or [{}])[0]; md=ii.get('extmetadata') or {}; mime=(ii.get('mime') or '').lower()
    if not mime.startswith('image/') or mime in ('image/svg+xml','image/gif'): return None
    title=p.get('title',''); cats=' '.join(c.get('title','') for c in p.get('categories',[])); desc=' '.join(clean((md.get(k) or {}).get('value','')) for k in ('ImageDescription','ObjectName','Categories','Source','Credit'))
    text=(title+' '+cats+' '+desc).lower(); lic=clean((md.get('LicenseShortName') or {}).get('value','')).lower()
    if not any(x in lic for x in ('cc0','public domain','cc by','cc-by','cc by-sa','cc-by-sa')): return None
    if any(x in text for x in BAD): return None
    tax=base(row['scientific']).lower(); toks=[t for t in tax.split() if t!='x']
    if toks and toks[0] not in text: return None
    if len(toks)>1 and toks[1] not in text: return None
    s=160
    for g in GOOD:
        if g in text: s+=18
    low=title.lower()
    for b in ('flower','flowers','leaf','leaves','fruit','fruits','seed','detail','close','bark','trunk'):
        if b in low:s-=20
    w=ii.get('width') or 0; h=ii.get('height') or 0
    if min(w,h)>=900:s+=10
    return s

def get_thumb(p):
    ii=(p.get('imageinfo') or [{}])[0]; u=ii.get('thumburl') or ii.get('url')
    if not u:return None
    try:
        r=S.get(u,timeout=60); r.raise_for_status(); im=Image.open(io.BytesIO(r.content)); im=ImageOps.exif_transpose(im).convert('RGB'); im.thumbnail((280,210)); return im
    except Exception:return None

def main():
    rs=rows(); names=[n for i,n in enumerate(TARGETS) if i%PARTS==PART]; OUT.mkdir(parents=True,exist_ok=True); (OUT/'thumbs').mkdir(exist_ok=True)
    result=[]
    for j,n in enumerate(names,1):
        row=rs[n]; print(f'[{j}/{len(names)}] {n}',flush=True); scored=[]
        for p in search(row):
            s=score(p,row)
            if s is not None: scored.append((s,p))
        scored.sort(key=lambda z:z[0],reverse=True); cs=[]
        for s,p in scored:
            im=get_thumb(p)
            if im is None:continue
            k=len(cs)+1; fn=f"{row['id']}_c{k}.jpg"; im.save(OUT/'thumbs'/fn,quality=86)
            ii=(p.get('imageinfo') or [{}])[0]; md=ii.get('extmetadata') or {}
            cs.append({'n':k,'score':s,'title':p.get('title',''),'url':ii.get('url',''),'source_page':'https://commons.wikimedia.org/wiki/'+p.get('title','').replace(' ','_'),'author':clean((md.get('Artist') or {}).get('value','')),'license':clean((md.get('LicenseShortName') or {}).get('value','')),'desc':clean((md.get('ImageDescription') or {}).get('value','')),'thumb':fn})
            if len(cs)>=6:break
        result.append({'plant':row,'candidates':cs})
    json.dump(result,(OUT/'candidates.json').open('w',encoding='utf-8'),ensure_ascii=False,indent=2)
    for start in range(0,len(result),8):
        ch=result[start:start+8]; W=210+6*290; H=len(ch)*245+10; sh=Image.new('RGB',(W,H),'white'); d=ImageDraw.Draw(sh)
        for ri,item in enumerate(ch):
            y=10+ri*245; p=item['plant']; d.text((8,y+8),f"{p['id']} {p['name']}",fill='black'); d.text((8,y+28),p['scientific'][:28],fill='black')
            for ci,c in enumerate(item['candidates']):
                im=Image.open(OUT/'thumbs'/c['thumb']).convert('RGB'); x=210+ci*290; sh.paste(im,(x+(280-im.width)//2,y+(210-im.height)//2)); d.text((x,y+214),f"C{ci+1} {c['score']}",fill='black')
        sh.save(OUT/f'sheet_{start//8+1}.jpg',quality=88)
if __name__=='__main__':main()
