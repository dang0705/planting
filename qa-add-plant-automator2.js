const automator = require('miniprogram-automator');
const fs = require('fs');

const WS = 'ws://127.0.0.1:9420';
const LOG = '/tmp/qa-add-plant-automator2.log';
const out = [];

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  out.push(line);
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function run() {
  log('Connecting to automator...');
  const miniProgram = await automator.connect({ wsEndpoint: WS });
  log('Connected.');

  // Install wx.request interceptor
  log('Installing wx.request interceptor...');
  await miniProgram.evaluate(() => {
    globalThis.__qaRequests = [];
    globalThis.__qaOriginalRequest = wx.request;
    wx.request = function(opts) {
      try {
        globalThis.__qaRequests.push({
          url: opts.url || '',
          method: opts.method || 'GET',
          time: Date.now()
        });
      } catch(e) {}
      return globalThis.__qaOriginalRequest.call(wx, opts);
    };
  });
  log('Interceptor installed.');

  // === POINT 1: First screen requests (non-edit) ===
  log('=== POINT 1: First screen (non-edit) ===');
  await miniProgram.evaluate(() => { globalThis.__qaRequests = []; });
  await miniProgram.reLaunch('/pages/add-plant/add-plant');
  log('Waiting 7s for onMounted...');
  await sleep(7000);

  const firstScreenReqs = await miniProgram.evaluate(() => JSON.parse(JSON.stringify(globalThis.__qaRequests || [])));
  log('FIRST_SCREEN_REQUESTS: ' + JSON.stringify(firstScreenReqs));

  const firstUrls = firstScreenReqs.map(r => r.url);
  const p1_hasCatalog = firstUrls.some(u => u.includes('plant-catalog') || u.includes('catalog/plants'));
  const p1_hasHotCities = firstUrls.some(u => u.includes('hot-cities'));
  const p1_hasResolve = firstUrls.some(u => u.includes('hot-cities/resolve'));
  const p1_hasAuthUser = firstUrls.some(u => u.includes('auth-user') || u.includes('auth/user'));
  const p1_hasUserPlants = firstUrls.some(u => u.includes('user-plants') || u.includes('plant-user'));

  log('POINT1_CHECK: catalog=' + p1_hasCatalog + ' hotCities=' + p1_hasHotCities + ' resolve=' + p1_hasResolve + ' auth=' + p1_hasAuthUser + ' userPlants=' + p1_hasUserPlants);
  log('POINT1_RESULT: ' + (p1_hasCatalog && !p1_hasHotCities && !p1_hasResolve && !p1_hasAuthUser && !p1_hasUserPlants ? 'PASS' : 'FAIL'));

  // === POINT 4: Button disabled state + after_cborder-0 ===
  log('=== POINT 4: Button check ===');
  const page = await miniProgram.currentPage();
  log('CURRENT_PAGE: ' + page.path);

  // Find plant-selection-step component, then button inside it
  let nextBtnInfo = null;
  try {
    const selStep = await page.$('plant-selection-step');
    if (selStep) {
      log('Found plant-selection-step component');
      const nextBtn = await selStep.$('#add-plant-next-button');
      if (nextBtn) {
        const cls = await nextBtn.attribute('class');
        const dis = await nextBtn.attribute('disabled');
        nextBtnInfo = { found: true, disabled: dis, className: cls };
      } else {
        log('Button not found inside plant-selection-step, trying data:');
        const btnData = await selStep.data();
        log('selStep data keys: ' + Object.keys(btnData || {}).join(','));
      }
    } else {
      log('plant-selection-step not found via page.$()');
      // Try page.$$ to list all elements
      const allBtns = await page.$$('button');
      log('Found ' + allBtns.length + ' buttons on page');
      for (const b of allBtns) {
        const id = await b.attribute('id');
        log('  button id=' + id);
        if (id === 'add-plant-next-button') {
          const cls = await b.attribute('class');
          const dis = await b.attribute('disabled');
          nextBtnInfo = { found: true, disabled: dis, className: cls };
        }
      }
    }
  } catch(e) {
    nextBtnInfo = { found: false, error: String(e) };
  }
  log('NEXT_BUTTON_INFO: ' + JSON.stringify(nextBtnInfo));

  // Also check AI identify button
  let aiBtnInfo = null;
  try {
    const selStep2 = await page.$('plant-selection-step');
    if (selStep2) {
      const aiBtn = await selStep2.$('#add-plant-ai-identify-button');
      if (aiBtn) {
        aiBtnInfo = { found: true, className: await aiBtn.attribute('class') };
      }
    }
  } catch(e) {
    aiBtnInfo = { found: false, error: String(e) };
  }
  log('AI_BUTTON_INFO: ' + JSON.stringify(aiBtnInfo));

  // Check after_cborder-0 on both buttons
  const nextHasBorder0 = nextBtnInfo && nextBtnInfo.className && String(nextBtnInfo.className).includes('after_cborder-0');
  const aiHasBorder0 = aiBtnInfo && aiBtnInfo.className && String(aiBtnInfo.className).includes('after_cborder-0');
  log('POINT4_CHECK: nextBtn_after_cborder-0=' + nextHasBorder0 + ' aiBtn_after_cborder-0=' + aiHasBorder0);
  log('POINT4_RESULT: ' + (nextHasBorder0 && aiHasBorder0 ? 'PASS' : (nextHasBorder0 ? 'PARTIAL' : 'FAIL')));

  // === POINT 2: Step transition triggers weather ===
  log('=== POINT 2: Step transition ===');

  // Tap a plant-card to select it
  log('Tapping a plant-card to select...');
  let plantSelected = false;
  try {
    const selStep3 = await page.$('plant-selection-step');
    if (selStep3) {
      const card = await selStep3.$('plant-card');
      if (card) {
        await card.tap();
        await sleep(2000);
        plantSelected = true;
        log('Plant card tapped');
      }
    }
  } catch(e) {
    log('plant-card tap error: ' + String(e));
  }
  log('PLANT_SELECTED: ' + plantSelected);

  // Check button enabled state after selection
  if (plantSelected) {
    let nextBtnAfter = null;
    try {
      const selStep4 = await page.$('plant-selection-step');
      const nb = await selStep4.$('#add-plant-next-button');
      if (nb) {
        nextBtnAfter = { disabled: await nb.attribute('disabled'), className: await nb.attribute('class') };
      }
    } catch(e) {}
    log('NEXT_BUTTON_AFTER_SELECT: ' + JSON.stringify(nextBtnAfter));

    // Tap next button to advance to step 1
    const isDisabled = nextBtnAfter && (nextBtnAfter.disabled === 'true' || nextBtnAfter.disabled === true);
    if (!isDisabled) {
      log('Next button enabled, tapping to advance...');
      try {
        const selStep5 = await page.$('plant-selection-step');
        const nb2 = await selStep5.$('#add-plant-next-button');
        await nb2.tap();
        log('Next button tapped, waiting 8s for weather init...');
        await sleep(8000);
      } catch(e) {
        log('next button tap error: ' + String(e));
      }
    } else {
      log('Next button still disabled. Trying evaluate to set activeStep=1...');
      try {
        await miniProgram.evaluate(() => {
          const pages = getCurrentPages();
          const cp = pages[pages.length - 1];
          if (cp && cp.$vm) {
            cp.$vm.activeStep = 1;
          }
        });
        await sleep(8000);
        log('Set activeStep=1 via evaluate');
      } catch(e) {
        log('evaluate error: ' + String(e));
      }
    }

    // Read all requests after step transition
    const allReqs = await miniProgram.evaluate(() => JSON.parse(JSON.stringify(globalThis.__qaRequests || [])));
    log('ALL_REQUESTS_AFTER_STEP: ' + JSON.stringify(allReqs));

    const allUrls = allReqs.map(r => r.url);
    const p2_hasHotCities = allUrls.some(u => u.includes('hot-cities'));
    const p2_hasResolve = allUrls.some(u => u.includes('hot-cities/resolve'));
    log('POINT2_CHECK: hasHotCities=' + p2_hasHotCities + ' hasResolve=' + p2_hasResolve);
    log('POINT2_RESULT: ' + (p2_hasHotCities ? 'PASS' : 'PENDING_OR_FAIL'));
  } else {
    log('POINT2_RESULT: SKIPPED (could not select plant)');
  }

  // === POINT 2 (edit): Edit mode fetches user-plants ===
  log('=== POINT 2 (edit): Edit mode ===');
  await miniProgram.evaluate(() => { globalThis.__qaRequests = []; });
  await miniProgram.reLaunch('/pages/add-plant/add-plant?id=test-edit-id&mode=edit');
  log('Waiting 7s for edit mode onMounted...');
  await sleep(7000);

  const editReqs = await miniProgram.evaluate(() => JSON.parse(JSON.stringify(globalThis.__qaRequests || [])));
  log('EDIT_MODE_REQUESTS: ' + JSON.stringify(editReqs));

  const editUrls = editReqs.map(r => r.url);
  const p2e_hasUserPlants = editUrls.some(u => u.includes('user-plants') || u.includes('plant-user'));
  log('POINT2_EDIT_CHECK: hasUserPlants=' + p2e_hasUserPlants);
  log('POINT2_EDIT_RESULT: ' + (p2e_hasUserPlants ? 'PASS' : 'FAIL'));

  // Cleanup
  log('Disconnecting...');
  await miniProgram.disconnect();
  log('Done.');
  fs.writeFileSync(LOG, out.join('\n'));
}

run().catch(e => {
  log('FATAL: ' + String(e));
  fs.writeFileSync(LOG, out.join('\n'));
  process.exit(1);
});
