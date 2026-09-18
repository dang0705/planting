const automator = require('miniprogram-automator');
const WS = 'ws://127.0.0.1:9420';

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function run() {
  console.log('[diag] Connecting...');
  const mp = await automator.connect({ wsEndpoint: WS });
  console.log('[diag] Connected. ReLaunching...');
  await mp.reLaunch('/pages/index/index');
  await sleep(8000);

  const page = await mp.currentPage();
  console.log('[diag] page.path=' + page.path);

  // 1. Inspect $vm and setupState
  const r1 = await mp.evaluate(() => {
    const pages = getCurrentPages();
    const cp = pages[pages.length - 1];
    const result = { route: cp.route };
    if (cp.$vm) {
      result.vmKeys = Object.keys(cp.$vm).filter(k => !k.startsWith('_') && !k.startsWith('$')).slice(0, 50);
      const inst = cp.$vm.$;
      if (inst) {
        result.setupStateKeys = inst.setupState ? Object.keys(inst.setupState).slice(0, 50) : 'no_setupState';
        result.proxyKeys = inst.proxy ? Object.keys(inst.proxy).filter(k => !k.startsWith('_') && !k.startsWith('$')).slice(0, 50) : 'no_proxy';
      }
    }
    return result;
  });
  console.log('[diag] r1_page_inspect=' + JSON.stringify(r1));

  // 2. Check Pinia store via getApp()
  const r2 = await mp.evaluate(() => {
    const result = {};
    const app = getApp();
    result.hasApp = !!app;
    if (!app) return result;
    result.appKeys = Object.keys(app).filter(k => !k.startsWith('_')).slice(0, 30);
    result.globalDataKeys = app.globalData ? Object.keys(app.globalData) : 'no_globalData';
    
    // Try app._context (Vue 3 app instance internal)
    if (app._context) {
      const gp = app._context.config && app._context.config.globalProperties;
      if (gp) {
        result.globalPropKeys = Object.keys(gp).filter(k => !k.startsWith('_')).slice(0, 30);
        if (gp.$pinia) {
          result.hasPinia = true;
          const state = gp.$pinia.state.value;
          result.storeIds = Object.keys(state);
          for (const sid of Object.keys(state)) {
            const s = state[sid];
            const sKeys = Object.keys(s);
            // Check if this is plant store
            if (s.userPlants !== undefined || s.hasPlants !== undefined) {
              result.plantStoreId = sid;
              result.plantStoreKeys = sKeys.slice(0, 20);
              result.plantStoreHasPlants = s.hasPlants;
              result.plantStoreUserPlantsLen = s.userPlants ? s.userPlants.length : 0;
              if (s.userPlants && s.userPlants.length > 0) {
                const p = s.userPlants[0];
                result.firstPlantId = p.id;
                result.firstPlantName = p.displayName || p.canonicalName;
                result.firstPlantLastWatered = p.lastWatered;
                result.firstPlantNextWater = p.nextWater;
                result.firstPlantWateringEvents = p.wateringEvents ? JSON.stringify(p.wateringEvents).substring(0, 300) : null;
              }
            }
            // Check if this is planting store
            if (s.plans !== undefined) {
              result.plantingStoreId = sid;
              result.plantingStoreKeys = sKeys.slice(0, 20);
              result.plansCount = s.plans ? s.plans.length : 0;
              if (s.plans && s.plans.length > 0) {
                result.firstPlanKeys = Object.keys(s.plans[0]).slice(0, 15);
              }
            }
          }
        }
      }
    }
    
    // Also try direct globalThis
    if (globalThis.$pinia) {
      result.globalThisPinia = true;
    }
    
    return result;
  });
  console.log('[diag] r2_pinia_check=' + JSON.stringify(r2));

  // 3. Check setupState for plant-related items
  const r3 = await mp.evaluate(() => {
    const pages = getCurrentPages();
    const cp = pages[pages.length - 1];
    const inst = cp.$vm && cp.$vm.$;
    if (!inst || !inst.setupState) return { error: 'no_setupState' };
    const ss = inst.setupState;
    const result = { allKeys: Object.keys(ss) };
    // Check each key
    for (const k of Object.keys(ss)) {
      const v = ss[k];
      // Is it a ref?
      if (v && typeof v === 'object' && '__v_isRef' in v) {
        const val = v.value;
        if (val && typeof val === 'object' && 'userPlants' in val) {
          result[k + '_type'] = 'ref_to_store';
          result[k + '_userPlantsLen'] = val.userPlants ? val.userPlants.length : 0;
        } else {
          result[k + '_type'] = 'ref';
          result[k + '_val'] = String(val).substring(0, 80);
        }
      } else if (v && typeof v === 'object' && 'userPlants' in v) {
        result[k + '_type'] = 'store_direct';
        result[k + '_userPlantsLen'] = v.userPlants ? v.userPlants.length : 0;
        result[k + '_hasPlants'] = v.hasPlants;
        if (v.userPlants && v.userPlants[0]) {
          result[k + '_firstPlantId'] = v.userPlants[0].id;
        }
      } else if (typeof v === 'function') {
        result[k + '_type'] = 'function';
      }
    }
    return result;
  });
  console.log('[diag] r3_setupState=' + JSON.stringify(r3));

  // 4. Check what's rendered - try to find plant card DOM elements
  const r4 = await mp.evaluate(() => {
    // In mp-weixin, the page's data is what's bound to WXML
    const pages = getCurrentPages();
    const cp = pages[pages.length - 1];
    // cp.data might not exist as a function, but the data is accessible via __data__
    const d = cp.__data__ || cp.data;
    if (!d) return { error: 'no_data' };
    const keys = Object.keys(d);
    return { dataKeys: keys.slice(0, 50), hasPlants: 'plants' in d || 'userPlants' in d };
  });
  console.log('[diag] r4_page_data=' + JSON.stringify(r4));

  await mp.disconnect();
  console.log('[diag] Done.');
}

run().catch(e => { console.error('[diag] ERROR:', e.message); process.exit(1); });
