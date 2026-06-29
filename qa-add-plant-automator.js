const automator = require('miniprogram-automator');
const fs = require('fs');

const WS = 'ws://127.0.0.1:9420';
const LOG = '/tmp/qa-add-plant-automator.log';
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

  // Step 1: Override wx.request to capture all request URLs
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

  // Step 2: reLaunch to add-plant (non-edit mode) — first screen test
  log('reLaunch to /pages/add-plant/add-plant (non-edit)...');
  globalThis.__qaRequests = []; // reset via evaluate below
  await miniProgram.evaluate(() => { globalThis.__qaRequests = []; });
  await miniProgram.reLaunch('/pages/add-plant/add-plant');
  log('Waiting 6s for onMounted to complete...');
  await sleep(6000);

  // Step 3: Read captured requests
  const firstScreenReqs = await miniProgram.evaluate(() => JSON.parse(JSON.stringify(globalThis.__qaRequests || [])));
  log('FIRST_SCREEN_REQUESTS: ' + JSON.stringify(firstScreenReqs));

  const firstUrls = firstScreenReqs.map(r => r.url);
  const hasCatalog = firstUrls.some(u => u.includes('plant-catalog') || u.includes('catalog/plants') || u.includes('catalog'));
  const hasHotCities = firstUrls.some(u => u.includes('hot-cities'));
  const hasHotCitiesResolve = firstUrls.some(u => u.includes('hot-cities/resolve'));
  const hasAuthUser = firstUrls.some(u => u.includes('auth-user') || u.includes('auth/user'));
  const hasUserPlants = firstUrls.some(u => u.includes('user-plants') || u.includes('plant-user'));

  log('POINT1_CHECK: hasCatalog=' + hasCatalog + ' hasHotCities=' + hasHotCities + ' hasHotCitiesResolve=' + hasHotCitiesResolve + ' hasAuthUser=' + hasAuthUser + ' hasUserPlants=' + hasUserPlants);
  log('POINT1_RESULT: ' + (hasCatalog && !hasHotCities && !hasHotCitiesResolve && !hasAuthUser && !hasUserPlants ? 'PASS' : 'FAIL'));

  // Step 4: Check next button disabled state + class
  const page = await miniProgram.currentPage();
  log('CURRENT_PAGE: ' + page.path);

  let nextBtnInfo = null;
  try {
    const nextBtn = await page.$('#add-plant-next-button');
    if (nextBtn) {
      nextBtnInfo = {
        found: true,
        disabled: await nextBtn.attribute('disabled'),
        className: await nextBtn.attribute('class')
      };
    } else {
      nextBtnInfo = { found: false };
    }
  } catch(e) {
    nextBtnInfo = { found: false, error: String(e) };
  }
  log('NEXT_BUTTON_INFO: ' + JSON.stringify(nextBtnInfo));

  // Check if after_cborder-0 class is present
  const hasAfterBorder0 = nextBtnInfo && nextBtnInfo.className && nextBtnInfo.className.includes('after_cborder-0');
  log('POINT4_CHECK: after_cborder-0_present=' + hasAfterBorder0 + ' disabled=' + (nextBtnInfo ? nextBtnInfo.disabled : 'N/A'));
  log('POINT4_RESULT: ' + (hasAfterBorder0 ? 'PASS' : 'FAIL'));

  // Step 5: Try to select a plant and advance to step 1
  log('Attempting to select a plant card...');
  let plantSelected = false;
  try {
    // Try finding plant-card component
    const plantCard = await page.$('plant-card');
    if (plantCard) {
      log('Found plant-card component, tapping...');
      await plantCard.tap();
      await sleep(2000);
      plantSelected = true;
    } else {
      log('No plant-card found via page.$(plant-card)');
    }
  } catch(e) {
    log('plant-card tap error: ' + String(e));
  }

  if (!plantSelected) {
    // Try finding via the selection step component
    try {
      const selectionStep = await page.$('#add-plant-selection-step');
      if (selectionStep) {
        log('Found selection step, looking for plant-card inside...');
        const card = await selectionStep.$('plant-card');
        if (card) {
          log('Found plant-card inside selection step, tapping...');
          await card.tap();
          await sleep(2000);
          plantSelected = true;
        }
      }
    } catch(e) {
      log('selection step plant-card error: ' + String(e));
    }
  }

  log('PLANT_SELECTED: ' + plantSelected);

  // Check if next button is now enabled
  if (plantSelected) {
    let nextBtnInfo2 = null;
    try {
      const nextBtn2 = await page.$('#add-plant-next-button');
      if (nextBtn2) {
        nextBtnInfo2 = {
          disabled: await nextBtn2.attribute('disabled'),
          className: await nextBtn2.attribute('class')
        };
      }
    } catch(e) {}
    log('NEXT_BUTTON_AFTER_SELECT: ' + JSON.stringify(nextBtnInfo2));

    // Tap next button to advance to step 1
    if (nextBtnInfo2 && nextBtnInfo2.disabled !== 'true' && nextBtnInfo2.disabled !== true) {
      log('Next button enabled, tapping to advance to step 1...');
      try {
        const nextBtn3 = await page.$('#add-plant-next-button');
        await nextBtn3.tap();
        await sleep(5000); // wait for weather initialization
        log('Advanced to step 1, waiting for weather requests...');
      } catch(e) {
        log('next button tap error: ' + String(e));
      }
    } else {
      log('Next button still disabled after plant select, trying evaluate to advance...');
      // Try to advance via evaluate
      try {
        await miniProgram.evaluate(() => {
          // Try to find the Vue component and set activeStep
          const pages = getCurrentPages();
          const currentPage = pages[pages.length - 1];
          if (currentPage && currentPage.$vm) {
            const vm = currentPage.$vm;
            if (vm.activeStep !== undefined) {
              vm.activeStep = 1;
            }
          }
        });
        await sleep(5000);
        log('Tried to advance via evaluate.');
      } catch(e) {
        log('evaluate advance error: ' + String(e));
      }
    }

    // Read all captured requests after step transition
    const allReqs = await miniProgram.evaluate(() => JSON.parse(JSON.stringify(globalThis.__qaRequests || [])));
    log('ALL_REQUESTS_AFTER_STEP: ' + JSON.stringify(allReqs));

    const allUrls = allReqs.map(r => r.url);
    const hasHotCitiesAfter = allUrls.some(u => u.includes('hot-cities'));
    const hasHotCitiesResolveAfter = allUrls.some(u => u.includes('hot-cities/resolve'));
    log('POINT2_CHECK: hasHotCities=' + hasHotCitiesAfter + ' hasHotCitiesResolve=' + hasHotCitiesResolveAfter);
    log('POINT2_RESULT: ' + (hasHotCitiesAfter ? 'PASS' : 'PENDING_OR_FAIL'));
  } else {
    log('POINT2_RESULT: SKIPPED (could not select plant)');
  }

  // Step 6: Test edit mode
  log('Testing edit mode...');
  await miniProgram.evaluate(() => { globalThis.__qaRequests = []; });
  
  // We need a valid plant ID for edit mode. Try to get one from user-plants or catalog.
  let editResult = 'SKIPPED';
  try {
    // reLaunch with a fake edit mode to see if user-plants is requested
    await miniProgram.reLaunch('/pages/add-plant/add-plant?id=test-plant-id&mode=edit');
    await sleep(6000);
    const editReqs = await miniProgram.evaluate(() => JSON.parse(JSON.stringify(globalThis.__qaRequests || [])));
    log('EDIT_MODE_REQUESTS: ' + JSON.stringify(editReqs));
    const editUrls = editReqs.map(r => r.url);
    const hasUserPlantsEdit = editUrls.some(u => u.includes('user-plants') || u.includes('plant-user'));
    const hasCatalogEdit = editUrls.some(u => u.includes('plant-catalog') || u.includes('catalog'));
    log('EDIT_CHECK: hasUserPlants=' + hasUserPlantsEdit + ' hasCatalog=' + hasCatalogEdit);
    editResult = hasUserPlantsEdit ? 'PASS' : 'FAIL_OR_NO_USER_PLANTS';
  } catch(e) {
    log('edit mode error: ' + String(e));
    editResult = 'ERROR: ' + String(e);
  }
  log('POINT2_EDIT_RESULT: ' + editResult);

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
