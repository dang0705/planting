import automator from 'miniprogram-automator'
import fs from 'node:fs'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const SHOT='/tmp/qa-shots'
const attr=async(n,k)=>{try{return await n.attribute(k)}catch{return null}}
let mp
try {
  mp = await automator.connect({ wsEndpoint: 'ws://127.0.0.1:9420' })
} catch(e){ console.error('connect fail', e); process.exit(1) }

async function idsContaining(page, key) {
  const all = await page.$$('view,button,scroll-view,text')
  const out=[]
  for (const n of all){ const id=await attr(n,'id'); if(id && id.includes(key)) out.push(id) }
  return out
}

await mp.callWxMethod('reLaunch', { url: '/pages/index/index' })
await sleep(4500)
const page = await mp.currentPage()
console.log('diagnose ids:', JSON.stringify(await idsContaining(page,'diagnose-entry-button')))
console.log('reminder ids:', JSON.stringify(await idsContaining(page,'plant-card-reminder')))
console.log('popup ids(before):', JSON.stringify(await idsContaining(page,'diagnose-popup')))
console.log('sheet ids(before):', JSON.stringify(await idsContaining(page,'watering-reminder')))

// tap diagnose entry button
const all = await page.$$('view,button')
let diagBtn=null
for(const n of all){ const id=await attr(n,'id'); if(id && id.includes('diagnose-entry-button-')){diagBtn=n; break} }
console.log('diagBtn found:', !!diagBtn, diagBtn? await attr(diagBtn,'id') : null)
if(diagBtn){
  try { await diagBtn.tap(); console.log('tap ok') } catch(e){ console.log('tap err', e?.message) }
}
await sleep(3500)
console.log('popup ids(after tap):', JSON.stringify(await idsContaining(page,'diagnose-popup')))
await mp.screenshot({ path: `${SHOT}/probe-diagnose-after-tap.png` })

// also try opening via page method directly (automation helper path)
try {
  await page.callMethod('openDiagnose', { id: '15' })
  console.log('callMethod openDiagnose ok')
} catch(e){ console.log('callMethod err', e?.message) }
await sleep(2500)
console.log('popup ids(after callMethod):', JSON.stringify(await idsContaining(page,'diagnose-popup')))
await mp.screenshot({ path: `${SHOT}/probe-diagnose-after-callmethod.png` })

// compare file sizes
for (const f of ['page-index.png','probe-diagnose-after-tap.png','probe-diagnose-after-callmethod.png','popup-diagnose-open.png']) {
  try{ const s=fs.statSync(`${SHOT}/${f}`); console.log('size', f, s.size) }catch(e){ console.log('size', f, 'MISSING') }
}
await mp.disconnect()
