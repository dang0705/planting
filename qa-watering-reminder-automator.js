const automator = require('miniprogram-automator');
const fs = require('fs');

const WS = 'ws://127.0.0.1:9420';
const LOG = '/tmp/qa-watering-reminder-automator.log';
const out = [];

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  out.push(line);
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// Hardened screenshot with timeout + retry (per memory: miniProgram.screenshot can hang)
async function safeScreenshot(miniProgram, label) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const buf = await Promise.race([
        miniProgram.screenshot(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('screenshot_timeout')), 8000))
      ]);
      if (buf) {
        const path = `/tmp/qa-watering-screenshot-${label}-${attempt}.png`;
        fs.writeFileSync(path, buf);
        log(`SCREENSHOT_SAVED: ${path}`);
        return path;
      }
    } catch (e) {
      log(`SCREENSHOT_ATTEMPT_${attempt}_FAILED: ${String(e)}`);
    }
  }
  log('SCREENSHOT_ALL_FAILED (non-blocking)');
  return null;
}

async function run() {
  log('=== QA Watering Reminder E2E Start ===');
  log('Connecting to automator ws://127.0.0.1:9420...');

  let miniProgram;
  try {
    miniProgram = await automator.connect({ wsEndpoint: WS });
    log('Connected to automator.');
  } catch (e) {
    log('CONNECT_ERROR: ' + String(e));
    fs.writeFileSync(LOG, out.join('\n'));
    process.exit(1);
  }

  try {
    // === Install wx.request interceptor to capture full request/response ===
    log('Installing wx.request interceptor...');
    await miniProgram.evaluate(() => {
      globalThis.__qaRequests = [];
      globalThis.__qaOriginalRequest = wx.request;
      wx.request = function(opts) {
        const captured = {
          url: opts.url || '',
          method: opts.method || 'GET',
          data: opts.data || null,
          header: opts.header || {},
          time: Date.now()
        };
        const origSuccess = opts.success;
        const origFail = opts.fail;
        opts.success = function(res) {
          captured.response = {
            statusCode: res.statusCode,
            data: res.data
          };
          try {
            globalThis.__qaRequests.push(captured);
          } catch(e) {}
          if (origSuccess) return origSuccess(res);
        };
        opts.fail = function(err) {
          captured.error = String(err?.errMsg || err);
          try {
            globalThis.__qaRequests.push(captured);
          } catch(e) {}
          if (origFail) return origFail(err);
        };
        return globalThis.__qaOriginalRequest.call(wx, opts);
      };
    });
    log('Interceptor installed.');

    // === Step 1: reLaunch to homepage ===
    log('=== STEP 1: reLaunch homepage ===');
    await miniProgram.evaluate(() => { globalThis.__qaRequests = []; });
    await miniProgram.reLaunch('/pages/index/index');
    log('Waiting 8s for page load + plant list...');
    await sleep(8000);

    const page = await miniProgram.currentPage();
    log('CURRENT_PAGE: ' + page.path);

    // === Step 2: Check if plants exist ===
    log('=== STEP 2: Check plant data ===');
    const plantData = await miniProgram.evaluate(() => {
      const pages = getCurrentPages();
      const cp = pages[pages.length - 1];
      const vm = cp && cp.$vm;
      const store = vm && vm.plantStore;
      if (!store) return { hasStore: false };
      return {
        hasStore: true,
        hasPlants: store.hasPlants,
        plantsCount: store.userPlants ? store.userPlants.length : 0,
        firstPlantId: store.userPlants && store.userPlants[0] ? store.userPlants[0].id : null,
        firstPlantName: store.userPlants && store.userPlants[0] ? (store.userPlants[0].displayName || store.userPlants[0].canonicalName) : null,
        firstPlantWateringEvents: store.userPlants && store.userPlants[0] ? store.userPlants[0].wateringEvents : null,
        firstPlantLastWatered: store.userPlants && store.userPlants[0] ? store.userPlants[0].lastWatered : null,
        plantsNeedWaterCount: store.plantsNeedWater ? store.plantsNeedWater.length : 0
      };
    });
    log('PLANT_DATA: ' + JSON.stringify(plantData));

    if (!plantData.hasStore || !plantData.hasPlants || plantData.plantsCount === 0) {
      log('BLOCKER: No plants on homepage. Cannot test watering reminder flow.');
      await safeScreenshot(miniProgram, 'no-plants');
      // Try to read what's on screen
      const pageText = await miniProgram.evaluate(() => {
        const pages = getCurrentPages();
        const cp = pages[pages.length - 1];
        const vm = cp && cp.$vm;
        return {
          hasPlants: vm && vm.plantStore ? vm.plantStore.hasPlants : 'unknown',
          route: cp ? cp.route : 'unknown'
        };
      });
      log('PAGE_STATE: ' + JSON.stringify(pageText));
      fs.writeFileSync(LOG, out.join('\n'));
      await miniProgram.disconnect();
      return;
    }

    // === Step 3: Find and tap water reminder icon on plant card ===
    log('=== STEP 3: Tap water reminder icon ===');

    // The water button has no stable ID. Try DOM approach first, fallback to evaluate.
    let tappedWater = false;
    try {
      // Find all buttons on the page
      const allBtns = await page.$$('button');
      log('Found ' + allBtns.length + ' buttons on page');

      // The water reminder button is in the right rail of PlantCard, first in v-for
      // It doesn't have an ID. Let's try to find buttons without IDs (diagnose/history have IDs)
      let waterBtn = null;
      for (const btn of allBtns) {
        const id = await btn.attribute('id');
        const cls = await btn.attribute('class') || '';
        // Water/fertilize buttons are size-8 rounded-full in right rail, no ID
        if (!id && cls.includes('size-8') && cls.includes('rounded-full')) {
          waterBtn = btn;
          log('Found water button (no ID, size-8 rounded-full)');
          break;
        }
      }

      if (waterBtn) {
        await waterBtn.tap();
        tappedWater = true;
        log('Water button tapped via DOM');
      }
    } catch (e) {
      log('DOM tap attempt error: ' + String(e));
    }

    // Fallback: use evaluate to call openReminder directly
    if (!tappedWater) {
      log('Trying evaluate fallback: call openReminder({plant, type:"water"})...');
      try {
        const result = await miniProgram.evaluate(() => {
          const pages = getCurrentPages();
          const cp = pages[pages.length - 1];
          const vm = cp && cp.$vm;
          if (!vm || !vm.plantStore || !vm.plantStore.userPlants || !vm.plantStore.userPlants[0]) {
            return { success: false, error: 'no_plant' };
          }
          const plant = vm.plantStore.userPlants[0];
          // Call the page's openReminder method
          if (typeof vm.openReminder === 'function') {
            vm.openReminder({ plant, type: 'water' });
            return { success: true, plantId: plant.id, plantName: plant.displayName };
          }
          // Fallback: directly open the sheet
          if (vm.wateringReminderRef && vm.wateringReminderRef.value) {
            vm.currentReminderPlant = plant;
            vm.wateringReminderRef.value.open();
            return { success: true, plantId: plant.id, plantName: plant.displayName, method: 'direct_ref' };
          }
          return { success: false, error: 'no_openReminder_method' };
        });
        log('EVAL_OPEN_REMINDER: ' + JSON.stringify(result));
        if (result && result.success) {
          tappedWater = true;
        }
      } catch (e) {
        log('Evaluate fallback error: ' + String(e));
      }
    }

    if (!tappedWater) {
      log('BLOCKER: Could not tap water reminder icon or trigger openReminder');
      await safeScreenshot(miniProgram, 'tap-failed');
      fs.writeFileSync(LOG, out.join('\n'));
      await miniProgram.disconnect();
      return;
    }

    await sleep(2000);

    // === Step 4: Verify bottom sheet opened (NOT calendar navigation) ===
    log('=== STEP 4: Verify bottom sheet opened ===');
    const afterTapPage = await miniProgram.currentPage();
    log('AFTER_TAP_PAGE: ' + afterTapPage.path);
    const isStillHomepage = afterTapPage.path === 'pages/index/index' || afterTapPage.path === 'pages/index/index/index';
    log('STILL_ON_HOMEPAGE: ' + isStillHomepage);

    if (!isStillHomepage) {
      log('FAIL: Tapping water icon navigated away from homepage (expected bottom sheet)');
      await safeScreenshot(miniProgram, 'navigated-away');
      fs.writeFileSync(LOG, out.join('\n'));
      await miniProgram.disconnect();
      return;
    }

    // Check for sheet content via evaluate
    const sheetCheck = await miniProgram.evaluate(() => {
      const pages = getCurrentPages();
      const cp = pages[pages.length - 1];
      const vm = cp && cp.$vm;
      // Check if wateringReminderRef is open
      const sheetRef = vm && vm.wateringReminderRef && vm.wateringReminderRef.value;
      return {
        hasSheetRef: !!sheetRef,
        currentReminderPlantId: vm && vm.currentReminderPlant ? vm.currentReminderPlant.id : null,
        sheetPlant: sheetRef && sheetRef.props ? (sheetRef.props.plant ? sheetRef.props.plant.id : null) : null,
        sheetLoading: sheetRef ? sheetRef.loading : null,
        sheetPlannerResult: sheetRef ? JSON.stringify(sheetRef.plannerResult) : null,
        sheetSelectedWateringEvents: sheetRef ? JSON.stringify(sheetRef.selectedWateringEvents) : null
      };
    });
    log('SHEET_STATE: ' + JSON.stringify(sheetCheck));

    await safeScreenshot(miniProgram, 'sheet-opened');

    // Verify sheet UI text by reading page data
    const sheetTextCheck = await miniProgram.evaluate(() => {
      // Use WXML query to find text in the popup
      const pages = getCurrentPages();
      const cp = pages[pages.length - 1];
      // Try to get element text
      return {
        route: cp.route,
        hasWateringReminderSheet: !!(cp.$vm && cp.$vm.wateringReminderRef)
      };
    });
    log('SHEET_TEXT_CHECK: ' + JSON.stringify(sheetTextCheck));

    // === Step 5: Tap "上次浇水" entry to open date picker ===
    log('=== STEP 5: Open date picker ===');
    await sleep(1000);

    // Try to find and tap the "上次浇水" entry
    let datePickerOpened = false;

    // Try DOM approach - find the watering-reminder-sheet element
    try {
      const sheetEl = await page.$('.watering-reminder-sheet');
      if (sheetEl) {
        log('Found .watering-reminder-sheet element');
        // Find clickable views inside (上次浇水 entry)
        const entries = await sheetEl.$$('view');
        log('Found ' + entries.length + ' views in sheet');
        // The 上次浇水 entry has @click="openLastWateringPicker"
        // Try tapping by text content - in mp-weixin, we can't easily get text
        // Let's try evaluate to call the method directly
      }
    } catch (e) {
      log('DOM sheet search error: ' + String(e));
    }

    // Use evaluate to call openLastWateringPicker directly
    if (!datePickerOpened) {
      log('Trying evaluate: call openLastWateringPicker...');
      try {
        await miniProgram.evaluate(() => {
          const pages = getCurrentPages();
          const cp = pages[pages.length - 1];
          const vm = cp && cp.$vm;
          const sheetRef = vm && vm.wateringReminderRef && vm.wateringReminderRef.value;
          if (sheetRef && typeof sheetRef.openLastWateringPicker === 'function') {
            sheetRef.openLastWateringPicker();
            return true;
          }
          return false;
        });
        datePickerOpened = true;
        log('openLastWateringPicker called via evaluate');
      } catch (e) {
        log('Evaluate openLastWateringPicker error: ' + String(e));
      }
    }

    await sleep(2000);

    // === Step 6: Verify date picker opened ===
    log('=== STEP 6: Verify date picker ===');
    const datePickerCheck = await miniProgram.evaluate(() => {
      const pages = getCurrentPages();
      const cp = pages[pages.length - 1];
      const vm = cp && cp.$vm;
      const sheetRef = vm && vm.wateringReminderRef && vm.wateringReminderRef.value;
      return {
        hasSheetRef: !!sheetRef,
        sheetSelectedWateringEvents: sheetRef ? JSON.stringify(sheetRef.selectedWateringEvents) : null,
        sheetInitialWateringEvents: sheetRef ? JSON.stringify(sheetRef.initialWateringEvents) : null,
        sheetTimelineInput: sheetRef ? JSON.stringify(sheetRef.timelineInput) : null
      };
    });
    log('DATE_PICKER_STATE: ' + JSON.stringify(datePickerCheck));

    await safeScreenshot(miniProgram, 'date-picker-opened');

    // === Step 7: Tap 1-2 past date cells ===
    log('=== STEP 7: Tap past date cells ===');

    // Calculate past dates to tap (yesterday and 3 days ago)
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const threeDaysAgo = new Date(today);
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

    const fmtDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const date1 = fmtDate(yesterday);
    const date2 = fmtDate(threeDaysAgo);
    log('Target dates: ' + date1 + ', ' + date2);

    let tappedDates = 0;

    // Try to find and tap date cells by ID
    for (const dateStr of [date1, date2]) {
      const cellId = `home-watering-care-behavior-date-${dateStr}`;
      try {
        const cell = await page.$('#' + cellId);
        if (cell) {
          log('Found date cell: ' + cellId);
          await cell.tap();
          tappedDates++;
          log('Tapped date cell: ' + dateStr);
          await sleep(1000);
        } else {
          log('Date cell not found: ' + cellId + ' (may be out of range)');
        }
      } catch (e) {
        log('Tap date cell ' + dateStr + ' error: ' + String(e));
      }
    }

    if (tappedDates === 0) {
      // Fallback: try tapping any selectable date cell
      log('No specific dates tapped, trying to find any selectable date cell...');
      try {
        // Find all elements with id starting with home-watering-care-behavior-date-
        const allCells = await page.$$('view');
        let found = 0;
        for (const el of allCells) {
          const id = await el.attribute('id');
          if (id && String(id).startsWith('home-watering-care-behavior-date-')) {
            const dateStr = String(id).replace('home-watering-care-behavior-date-', '');
            // Skip today and future dates
            if (dateStr < fmtDate(today)) {
              log('Found selectable past date cell: ' + dateStr);
              await el.tap();
              tappedDates++;
              found++;
              await sleep(1000);
              if (found >= 2) break;
            }
          }
        }
      } catch (e) {
        log('Fallback date cell search error: ' + String(e));
      }
    }

    log('TAPPED_DATES_COUNT: ' + tappedDates);

    // Verify watering events were selected
    const afterSelection = await miniProgram.evaluate(() => {
      const pages = getCurrentPages();
      const cp = pages[pages.length - 1];
      const vm = cp && cp.$vm;
      const sheetRef = vm && vm.wateringReminderRef && vm.wateringReminderRef.value;
      return {
        selectedWateringEvents: sheetRef ? JSON.stringify(sheetRef.selectedWateringEvents) : null,
        selectedWateringEventsForPlanner: sheetRef ? JSON.stringify(sheetRef.selectedWateringEventsForPlanner) : null
      };
    });
    log('AFTER_SELECTION: ' + JSON.stringify(afterSelection));

    await safeScreenshot(miniProgram, 'dates-selected');

    // === Step 8: Tap "确认" to confirm and trigger planner request ===
    log('=== STEP 8: Confirm date selection ===');

    // Clear captured requests before confirming
    await miniProgram.evaluate(() => { globalThis.__qaRequests = []; });

    // Find and tap "确认" button
    let confirmed = false;
    try {
      const datePickerEl = await page.$('.watering-date-picker');
      if (datePickerEl) {
        log('Found .watering-date-picker element');
        const btns = await datePickerEl.$$('button');
        log('Found ' + btns.length + ' buttons in date picker');
        for (const btn of btns) {
          // The "确认" button is the green one (bg-[#2d7a4f])
          const cls = await btn.attribute('class') || '';
          if (cls.includes('2d7a4f') && !cls.includes('border')) {
            await btn.tap();
            confirmed = true;
            log('Confirmed (tapped green 确认 button)');
            break;
          }
        }
      }
    } catch (e) {
      log('DOM confirm error: ' + String(e));
    }

    // Fallback: use evaluate to call confirmDatePicker
    if (!confirmed) {
      log('Trying evaluate: call confirmDatePicker...');
      try {
        await miniProgram.evaluate(() => {
          const pages = getCurrentPages();
          const cp = pages[pages.length - 1];
          const vm = cp && cp.$vm;
          const sheetRef = vm && vm.wateringReminderRef && vm.wateringReminderRef.value;
          if (sheetRef && typeof sheetRef.confirmDatePicker === 'function') {
            sheetRef.confirmDatePicker();
            return true;
          }
          return false;
        });
        confirmed = true;
        log('confirmDatePicker called via evaluate');
      } catch (e) {
        log('Evaluate confirmDatePicker error: ' + String(e));
      }
    }

    // Wait for planner request
    log('Waiting 8s for planner request...');
    await sleep(8000);

    // === Step 9: Check captured planner request ===
    log('=== STEP 9: Check planner request ===');
    const capturedReqs = await miniProgram.evaluate(() => JSON.parse(JSON.stringify(globalThis.__qaRequests || [])));
    log('CAPTURED_REQUESTS_COUNT: ' + capturedReqs.length);
    log('CAPTURED_REQUESTS: ' + JSON.stringify(capturedReqs));

    // Find watering-planner request
    const plannerReq = capturedReqs.find(r => r.url && r.url.includes('watering-planner'));
    if (plannerReq) {
      log('PLANNER_REQUEST_FOUND: YES');
      log('PLANNER_REQUEST_URL: ' + plannerReq.url);
      log('PLANNER_REQUEST_METHOD: ' + plannerReq.method);

      // Parse request data
      let reqData = plannerReq.data;
      if (typeof reqData === 'string') {
        try { reqData = JSON.parse(reqData); } catch(e) {}
      }
      log('PLANNER_REQUEST_DATA: ' + JSON.stringify(reqData));

      // Verify payload fields
      const hasPlantId = reqData && reqData.plantId;
      const hasWateringEvents = reqData && Array.isArray(reqData.wateringEvents);
      const hasReferenceDate = reqData && reqData.referenceDate;
      const hasWeatherDays = reqData && Array.isArray(reqData.weatherDays);
      log('PLANNER_PAYLOAD_CHECK: plantId=' + hasPlantId + ' wateringEvents=' + hasWateringEvents + ' referenceDate=' + hasReferenceDate + ' weatherDays=' + hasWeatherDays);
      log('PLANNER_PAYLOAD_RESULT: ' + (hasPlantId && hasWateringEvents && hasReferenceDate && hasWeatherDays ? 'PASS' : 'FAIL'));

      // Check response
      if (plannerReq.response) {
        log('PLANNER_RESPONSE_STATUS: ' + plannerReq.response.statusCode);
        log('PLANNER_RESPONSE_DATA: ' + JSON.stringify(plannerReq.response.data));

        const respData = plannerReq.response.data;
        const respPayload = respData && respData.data ? respData.data : respData;
        const hasNextWaterDate = respPayload && respPayload.nextWaterDate !== undefined;
        const hasNextWaterWindow = respPayload && respPayload.nextWaterWindow !== undefined;
        const hasNextWaterReason = respPayload && respPayload.nextWaterReason !== undefined;
        log('PLANNER_RESPONSE_CHECK: nextWaterDate=' + hasNextWaterDate + ' nextWaterWindow=' + hasNextWaterWindow + ' nextWaterReason=' + hasNextWaterReason);
        log('PLANNER_RESPONSE_RESULT: ' + (hasNextWaterDate && hasNextWaterWindow && hasNextWaterReason ? 'PASS' : (hasNextWaterDate ? 'PARTIAL' : 'FAIL')));
      } else if (plannerReq.error) {
        log('PLANNER_REQUEST_ERROR: ' + plannerReq.error);
      } else {
        log('PLANNER_RESPONSE: NOT_CAPTURED (may still be pending)');
      }
    } else {
      log('PLANNER_REQUEST_FOUND: NO');
      log('ALL_URLS: ' + JSON.stringify(capturedReqs.map(r => r.url)));
    }

    // === Step 10: Verify Summary updated ===
    log('=== STEP 10: Verify Summary ===');
    const summaryCheck = await miniProgram.evaluate(() => {
      const pages = getCurrentPages();
      const cp = pages[pages.length - 1];
      const vm = cp && cp.$vm;
      const sheetRef = vm && vm.wateringReminderRef && vm.wateringReminderRef.value;
      if (!sheetRef) return { hasSheetRef: false };
      return {
        hasSheetRef: true,
        loading: sheetRef.loading,
        plannerResult: sheetRef.plannerResult ? JSON.stringify(sheetRef.plannerResult) : null,
        nextWaterDisplay: sheetRef.nextWaterDisplay ? (typeof sheetRef.nextWaterDisplay === 'string' ? sheetRef.nextWaterDisplay : sheetRef.nextWaterDisplay.value) : null,
        canAddToCalendar: sheetRef.canAddToCalendar ? (typeof sheetRef.canAddToCalendar === 'boolean' ? sheetRef.canAddToCalendar : sheetRef.canAddToCalendar.value) : null,
        hasWeatherRef: sheetRef.hasWeatherRef ? (typeof sheetRef.hasWeatherRef === 'boolean' ? sheetRef.hasWeatherRef : sheetRef.hasWeatherRef.value) : null,
        selectedWateringEventsForPlanner: sheetRef.selectedWateringEventsForPlanner ? JSON.stringify(sheetRef.selectedWateringEventsForPlanner) : null
      };
    });
    log('SUMMARY_STATE: ' + JSON.stringify(summaryCheck));

    await safeScreenshot(miniProgram, 'summary-updated');

    // === Step 11: Tap "添加至日历" ===
    log('=== STEP 11: Tap 添加至日历 ===');

    // Clear captured requests before adding to calendar
    await miniProgram.evaluate(() => { globalThis.__qaRequests = []; });

    let addedToCalendar = false;
    try {
      const sheetEl = await page.$('.watering-reminder-sheet');
      if (sheetEl) {
        const btns = await sheetEl.$$('button');
        for (const btn of btns) {
          const cls = await btn.attribute('class') || '';
          const disabled = await btn.attribute('disabled');
          if (cls.includes('2d7a4f') && cls.includes('w-full')) {
            log('Found 添加至日历 button, disabled=' + disabled);
            if (disabled !== 'true' && disabled !== true) {
              await btn.tap();
              addedToCalendar = true;
              log('Tapped 添加至日历 button');
            } else {
              log('添加至日历 button is disabled');
            }
            break;
          }
        }
      }
    } catch (e) {
      log('DOM addToCalendar error: ' + String(e));
    }

    // Fallback: use evaluate
    if (!addedToCalendar) {
      log('Trying evaluate: call addToCalendar...');
      try {
        const canAdd = await miniProgram.evaluate(() => {
          const pages = getCurrentPages();
          const cp = pages[pages.length - 1];
          const vm = cp && cp.$vm;
          const sheetRef = vm && vm.wateringReminderRef && vm.wateringReminderRef.value;
          if (!sheetRef) return { canAdd: false };
          const canAddVal = typeof sheetRef.canAddToCalendar === 'object' ? sheetRef.canAddToCalendar.value : sheetRef.canAddToCalendar;
          if (canAddVal && typeof sheetRef.addToCalendar === 'function') {
            sheetRef.addToCalendar();
            return { canAdd: true };
          }
          return { canAdd: false, plannerResult: sheetRef.plannerResult ? JSON.stringify(sheetRef.plannerResult) : null };
        });
        log('EVAL_ADD_TO_CALENDAR: ' + JSON.stringify(canAdd));
        if (canAdd && canAdd.canAdd) {
          addedToCalendar = true;
        }
      } catch (e) {
        log('Evaluate addToCalendar error: ' + String(e));
      }
    }

    // Wait for store updates
    log('Waiting 4s for store updates...');
    await sleep(4000);

    // === Step 12: Verify store state ===
    log('=== STEP 12: Verify store state ===');
    const storeCheck = await miniProgram.evaluate(() => {
      const pages = getCurrentPages();
      const cp = pages[pages.length - 1];
      const vm = cp && cp.$vm;
      const plantStore = vm && vm.plantStore;
      const plantingStore = vm && vm.plantingStore;

      if (!plantStore) return { hasPlantStore: false };

      const firstPlant = plantStore.userPlants && plantStore.userPlants[0];
      const result = {
        hasPlantStore: true,
        hasPlantingStore: !!plantingStore,
        firstPlantId: firstPlant ? firstPlant.id : null,
        firstPlantLastWatered: firstPlant ? firstPlant.lastWatered : null,
        firstPlantNextWater: firstPlant ? firstPlant.nextWater : null,
        firstPlantWateringEvents: firstPlant ? JSON.stringify(firstPlant.wateringEvents) : null,
      };

      if (plantingStore) {
        result.plantingPlansCount = plantingStore.plans ? plantingStore.plans.length : 0;
        if (plantingStore.plans && plantingStore.plans.length > 0) {
          const firstPlan = plantingStore.plans[0];
          result.firstPlanPlantId = firstPlan.plantId;
          result.firstPlanReminders = firstPlan.reminders ? JSON.stringify(firstPlan.reminders) : null;
          const waterReminder = firstPlan.reminders ? firstPlan.reminders.find(r => r.type === 'water') : null;
          result.hasWaterReminder = !!waterReminder;
          result.waterReminderNextTime = waterReminder ? waterReminder.nextTime : null;
          result.waterReminderIntervalDays = waterReminder ? waterReminder.intervalDays : null;
        }
      }

      return result;
    });
    log('STORE_STATE: ' + JSON.stringify(storeCheck));

    // Check captured requests after addToCalendar
    const afterAddReqs = await miniProgram.evaluate(() => JSON.parse(JSON.stringify(globalThis.__qaRequests || [])));
    log('AFTER_ADD_REQUESTS: ' + JSON.stringify(afterAddReqs.map(r => ({ url: r.url, method: r.method }))));

    await safeScreenshot(miniProgram, 'after-add-to-calendar');

    // === Summary ===
    log('=== QA SUMMARY ===');
    log('STILL_ON_HOMEPAGE: ' + isStillHomepage);
    log('PLANTS_COUNT: ' + (plantData.plantsCount || 0));
    log('SHEET_OPENED: ' + (sheetCheck.hasSheetRef ? 'YES' : 'NO'));
    log('DATES_TAPPED: ' + tappedDates);
    log('PLANNER_REQUEST_FOUND: ' + (plannerReq ? 'YES' : 'NO'));
    log('STORE_UPDATED: ' + (storeCheck.firstPlantLastWatered ? 'YES' : 'UNKNOWN'));
    log('WATER_REMINDER_CREATED: ' + (storeCheck.hasWaterReminder ? 'YES' : (storeCheck.hasPlantingStore ? 'NO' : 'UNKNOWN')));

    fs.writeFileSync(LOG, out.join('\n'));
    log('Log written to ' + LOG);

  } catch (e) {
    log('FATAL_ERROR: ' + String(e));
    log('STACK: ' + (e.stack || ''));
    try { await safeScreenshot(miniProgram, 'fatal-error'); } catch(e2) {}
    fs.writeFileSync(LOG, out.join('\n'));
  } finally {
    try {
      // Restore original wx.request
      await miniProgram.evaluate(() => {
        if (globalThis.__qaOriginalRequest) {
          wx.request = globalThis.__qaOriginalRequest;
        }
      });
    } catch (e) {}
    try { await miniProgram.disconnect(); } catch (e) {}
    log('Disconnected.');
  }
}

run().catch(e => {
  log('UNCAUGHT_ERROR: ' + String(e));
  fs.writeFileSync(LOG, out.join('\n'));
});
