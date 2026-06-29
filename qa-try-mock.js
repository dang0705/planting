const automator = require('miniprogram-automator');
const WS = 'ws://127.0.0.1:9420';

async function run() {
  const mp = await automator.connect({ wsEndpoint: WS });
  console.log('Connected.');

  // Try mockWxMethod - it might save and use internal original
  try {
    await mp.mockWxMethod('request', (options) => {
      globalThis.__qaMockReqs = globalThis.__qaMockReqs || [];
      globalThis.__qaMockReqs.push({ url: options.url, method: options.method });
      // Try callWxMethod to call original
      return mp.callWxMethod('request', options);
    });
    console.log('mockWxMethod installed');
  } catch(e) {
    console.log('mockWxMethod failed:', e.message);
  }

  // Test if requests work now
  let testResult = await mp.evaluate(() => {
    return new Promise((resolve) => {
      try {
        globalThis.__qaMockReqs = [];
        wx.request({
          url: 'http://192.168.50.135:3010/__local_functions__/health',
          method: 'GET',
          success: (res) => resolve('REQUEST_OK: ' + res.statusCode),
          fail: (err) => resolve('REQUEST_FAIL: ' + JSON.stringify(err).substring(0, 200)),
          complete: () => {}
        });
        setTimeout(() => resolve('REQUEST_TIMEOUT'), 8000);
      } catch(e) {
        resolve('REQUEST_EXCEPTION: ' + e.message);
      }
    });
  });
  console.log('Test result:', testResult);

  let mockReqs = await mp.evaluate(() => JSON.stringify(globalThis.__qaMockReqs || []));
  console.log('Mock reqs captured:', mockReqs);

  // Restore
  try {
    await mp.restoreWxMethod('request');
    console.log('Restored wx.request');
    // Test again
    let testResult2 = await mp.evaluate(() => {
      return new Promise((resolve) => {
        try {
          wx.request({
            url: 'http://192.168.50.135:3010/__local_functions__/health',
            method: 'GET',
            success: (res) => resolve('RESTORED_OK: ' + res.statusCode),
            fail: (err) => resolve('RESTORED_FAIL: ' + JSON.stringify(err).substring(0, 200)),
            complete: () => {}
          });
          setTimeout(() => resolve('RESTORED_TIMEOUT'), 8000);
        } catch(e) {
          resolve('RESTORED_EXCEPTION: ' + e.message);
        }
      });
    });
    console.log('Restored test:', testResult2);
  } catch(e) {
    console.log('Restore failed:', e.message);
  }

  await mp.disconnect();
  console.log('Done.');
}
run().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
