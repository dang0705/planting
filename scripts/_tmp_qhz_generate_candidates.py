#!/usr/bin/env python3
import csv, html, io, os, re, sys, time, json
from pathlib import Path
import requests
from PIL import Image, ImageOps, ImageDraw

ROOT=Path(__file__).resolve().parents[1]
CATALOG=ROOT/'docs'/'plant_catalog.csv'
OUT=ROOT/'_tmp_qhz_candidates'
API='https://commons.wikimedia.org/w/api.php'
UA='QinghuazhiMVPAssetReview/1.1 (GitHub dang0705/planting)'
S=requests.Session(); S.headers.update({'User-Agent':UA})

TARGETS='''生石花\n不死鸟\n乙女心\n仙人球\n佛珠\n吉娃娃\n条纹十二卷\n桃蛋\n玉树\n玉缀\n瓦松\n白鸟\n绯牡丹\n胧月\n芦荟\n落地生根\n虹之玉\n量天尺\n金枝玉叶\n金琥\n长生草\n鹿角海棠\n龙骨\n睡莲\n再力花\n凤眼莲\n旱伞草\n梭鱼草\n水葱\n荷花\n金钱蒲\n铜钱草\n番红花\n郁金香\n唐菖蒲\n朱顶红\n水仙\n风信子\n罗勒\n香菜\n上海青\n丝瓜\n南瓜\n四季豆\n小青菜\n小香葱\n油麦菜\n甜椒\n生菜\n矮生番茄\n矮生辣椒\n秋葵\n羽衣甘蓝\n芝麻菜\n苦瓜\n茄子\n草莓\n菠菜\n西葫芦\n豆角\n豌豆\n韭菜\n黄瓜\n空气凤梨\n万年青\n冷水花\n卷叶吊兰\n卷柏\n发财树\n吊兰\n吊竹梅\n姬龟背\n孔雀竹芋\n富贵竹\n巴西木\n常春藤\n幸福树\n彩叶芋\n散尾葵\n文竹\n棕竹\n橡皮树\n油画吊兰\n波士顿蕨\n海芋\n滴水观音\n狐尾天门冬\n琴叶榕\n白掌\n白玉虎皮兰\n白脉椒草\n白蝶合果芋\n祈祷草\n福禄桐\n紫露草\n网纹草\n花叶椒草\n蔓绿绒\n袖珍椰子\n裂叶喜林芋\n西瓜皮椒草\n豆瓣绿\n酒瓶兰\n金边富贵竹\n金钱树\n金钻蔓绿绒\n铁线蕨\n银皇后\n镜面草\n青苹果竹芋\n鸟巢蕨\n鹅掌柴\n鹿角蕨\n黛粉叶\n龙血树\n百合\n花烛\n蝴蝶兰\n铁线莲\n一品红\n三色堇\n三角梅\n丽格海棠\n仙客来\n倒挂金钟\n凌霄\n向日葵\n君子兰\n四季海棠\n夜来香\n大丽花\n大岩桐\n天竺葵\n夹竹桃\n姜荷花\n康乃馨\n扶郎花\n旱金莲\n月季\n木槿\n木芙蓉\n木香花\n杜鹃花\n栀子花\n桂花\n炮仗花\n牵牛花\n玛格丽特\n玫瑰\n球兰\n百日草\n矮牵牛\n石竹\n紫罗兰\n紫薇\n红掌\n络石\n绣球花\n美人蕉\n茉莉花\n茑萝\n茶花\n蓝雪花\n虎刺梅\n蟹爪兰\n金盏花\n金银花\n金鱼草\n长寿花\n长春花\n雏菊\n非洲堇\n马蹄莲\n鸡冠花\n鸡蛋花\n鸢尾\n柠檬香蜂草\n欧芹\n牛至\n百里香\n碰碰香\n紫苏\n细香葱\n茴香\n莳萝\n薄荷\n迷迭香\n鼠尾草'''.splitlines()
TSET=set(TARGETS)
BAD=('herbarium','specimen sheet','pressed','illustration','drawing','diagram','plate','seed','pollen','fruit only','slice','section','microscope','macro','close-up','closeup','leaf detail','flower detail','disease','virus','rust','mildew','fungus','insect','aphid','thrips','mite','gall','damage','dead','wilt','dry leaf','root detail','wood','bark','stem section','temperature gun','thermometer')
GOOD=('whole plant','habit','potted','in pot','container','cultivated','garden','botanical garden','botanic garden','nursery','plant habit','shrub','vine','clump')

def clean(s):
    s=re.sub(r'<[^>]+>',' ',str(s or '')); return html.unescape(re.sub(r'\s+',' ',s)).strip()

def get_json(params, tries=7):
    wait=1.5
    for a in range(tries):
        try:
            r=S.get(API,params=params,timeout=45)
            if r.status_code==429:
                time.sleep(float(r.headers.get('Retry-After') or wait)); wait=min(wait*1.8,20); continue
            r.raise_for_status(); return r.json()
        except Exception:
            if a==tries-1: raise
            time.sleep(wait); wait=min(wait*1.8,20)

def read_catalog():
    out={}
    with CATALOG.open(encoding='utf-8-sig',newline='') as f:
        for row in csv.reader(f):
            if len(row)>9 and row[1] in TSET:
                out[row[1]]={'id':row[0],'name':row[1],'cat_cn':row[4],'cat_en':row[5],'scientific':row[6],'genus':row[9]}
    missing=[x for x in TARGETS if x not in out]
    if missing: raise RuntimeError(f'missing catalog names: {missing}')
    return out

def base_taxon(s):
    s=s.replace('×','x').replace(' spp.','').replace(' sp.','')
    s=re.sub(r"\s+'[^']+'$",'',s)
    return s.strip()

def search(row):
    b=base_taxon(row['scientific'])
    terms=[b]
    if ' x ' in b: terms.append(' '.join([x for x in b.split() if x!='x'][:2]))
    # one query first; fallback genus only if too few
    allp=[]; seen=set()
    for term in terms:
        params={'action':'query','format':'json','formatversion':'2','generator':'search','gsrnamespace':6,
                'gsrsearch':f'"{term}"','gsrlimit':30,'prop':'imageinfo|categories',
                'iiprop':'url|extmetadata|size|mime','iiurlwidth':900,'cllimit':'max','maxlag':5}
        pages=get_json(params).get('query',{}).get('pages',[])
        for p in pages:
            if p.get('title') not in seen: seen.add(p.get('title')); allp.append(p)
        if len(allp)>=10: break
        time.sleep(1.0)
    return allp

def score(p,row):
    ii=(p.get('imageinfo') or [{}])[0]; md=ii.get('extmetadata') or {}; mime=(ii.get('mime') or '').lower()
    if not mime.startswith('image/') or mime in ('image/svg+xml','image/gif'): return None
    title=p.get('title',''); cats=' '.join(c.get('title','') for c in p.get('categories',[]))
    desc=' '.join(clean((md.get(k) or {}).get('value','')) for k in ('ImageDescription','ObjectName','Categories','Source','Credit'))
    text=(title+' '+cats+' '+desc).lower(); lic=clean((md.get('LicenseShortName') or {}).get('value','')).lower()
    if not any(x in lic for x in ('cc0','public domain','cc by','cc-by','cc by-sa','cc-by-sa')): return None
    if any(x in text for x in BAD): return None
    b=base_taxon(row['scientific']).lower(); toks=[t for t in b.split() if t!='x']
    sc=0
    if b and b in text: sc+=100
    if toks and toks[0] in text: sc+=30
    if len(toks)>1 and toks[1] in text: sc+=45
    for x in GOOD:
        if x in text: sc+=15
    # Hard penalties for detail-only framing terms.
    low=title.lower()
    for x in ('flower','flowers','leaf','leaves','fruit','fruits','seed','seeds','detail','close','bark','trunk','stem'):
        if x in low: sc-=25
    w=ii.get('width') or 0; h=ii.get('height') or 0
    if min(w,h)>=1000: sc+=12
    elif min(w,h)>=600: sc+=6
    if max(w,h)<600: sc-=30
    return sc

def thumb(p):
    ii=(p.get('imageinfo') or [{}])[0]; u=ii.get('thumburl') or ii.get('url')
    if not u: return None
    try:
        r=S.get(u,timeout=60); r.raise_for_status(); im=Image.open(io.BytesIO(r.content)); im=ImageOps.exif_transpose(im).convert('RGB'); im.thumbnail((310,230)); return im
    except Exception: return None

def main():
    rows=read_catalog(); OUT.mkdir(parents=True,exist_ok=True); (OUT/'thumbs').mkdir(exist_ok=True)
    allrows=[]
    for idx,name in enumerate(TARGETS,1):
        row=rows[name]; print(f'[{idx}/188] {name} {row["scientific"]}',flush=True)
        try: pages=search(row)
        except Exception as e: print(' search failed',e,flush=True); pages=[]
        scored=[]
        for p in pages:
            s=score(p,row)
            if s is not None: scored.append((s,p))
        scored.sort(key=lambda x:x[0],reverse=True)
        selected=[]
        for s,p in scored:
            im=thumb(p)
            if im is None: continue
            n=len(selected)+1; fn=f'{row["id"]}_c{n}.jpg'; im.save(OUT/'thumbs'/fn,quality=86)
            ii=(p.get('imageinfo') or [{}])[0]; md=ii.get('extmetadata') or {}
            selected.append({'n':n,'score':s,'title':p.get('title',''),'source_page':'https://commons.wikimedia.org/wiki/'+p.get('title','').replace(' ','_'),
                             'url':ii.get('url',''),'thumburl':ii.get('thumburl',''),'author':clean((md.get('Artist') or {}).get('value','')),
                             'license':clean((md.get('LicenseShortName') or {}).get('value','')),'desc':clean((md.get('ImageDescription') or {}).get('value','')),'thumb':fn})
            if len(selected)>=4: break
        allrows.append({'plant':row,'candidates':selected})
        time.sleep(1.0)
    with (OUT/'candidates.json').open('w',encoding='utf-8') as f: json.dump(allrows,f,ensure_ascii=False,indent=2)
    # category sheets, 12 plants per page; each row: plant label + 4 candidate cells
    by={}
    for r in allrows: by.setdefault(r['plant']['cat_cn'],[]).append(r)
    for cat,items in by.items():
        for page0 in range(0,len(items),12):
            chunk=items[page0:page0+12]; cellw=310; cellh=230; labelw=210; rowh=265; margin=8
            W=labelw+4*cellw+5*margin; H=margin+len(chunk)*rowh
            sheet=Image.new('RGB',(W,H),'white'); d=ImageDraw.Draw(sheet)
            for ri,item in enumerate(chunk):
                y=margin+ri*rowh; p=item['plant']; d.text((margin,y+8),f"{p['id']} {p['name']}",fill='black'); d.text((margin,y+30),p['scientific'][:28],fill='black')
                for ci,c in enumerate(item['candidates']):
                    im=Image.open(OUT/'thumbs'/c['thumb']).convert('RGB'); x=labelw+margin+ci*(cellw+margin)
                    sheet.paste(im,(x+(cellw-im.width)//2,y+(cellh-im.height)//2)); d.text((x,y+cellh+3),f"C{ci+1} score={c['score']}",fill='black')
            safe=re.sub(r'[^A-Za-z0-9_-]+','_',cat)
            sheet.save(OUT/f'{safe}_{page0//12+1}.jpg',quality=88)
    print('DONE')
if __name__=='__main__': main()
