const automator = require('miniprogram-automator');
const WS = 'ws://127.0.0.1:9420';

async function run() {
  const mp = await automator.connect({ wsEndpoint: WS });
  console.log('Connected.');

  // Try to recover wx.request from prototype
  let result = await mp.evaluate(() => {
    // Method 1: Try prototype
    const proto = Object.getPrototypeOf(wx);
    if (proto && typeof proto.request === 'function') {
      const origRequest = proto.request.bind(wx);
      wx.request = origRequest;
      // Test it works by checking type
      return 'recovered_from_proto: ' + (typeof wx.request);
    }
    // Method 2: Delete override
    try {
      delete wx.request;
      if (typeof wx.request === 'function') {
        return 'recovered_from_delete: ' + (typeof wx.request);
      }
      return 'delete_ok_but_not_function: ' + (typeof wx.request);
    } catch(e) {
      return 'delete_failed: ' + e.message;
    }
  });
  console.log('Recovery result:', result);

  // Now test if wx.request actually works by making a simple request
  let testResult = await mp.evaluate(() => {
    return new Promise((resolve) => {
      try {
        wx.request({
          url: 'http://192.168.50.135:3010/__local_functions__/health',
          method: 'GET',
          success: (res) => resolve('REQUEST_OK: ' + res.statusCode),
          fail: (err) => resolve('REQUEST_FAIL: ' + JSON.stringify(err)),
          complete: () => {}
        });
        setTimeout(() => resolve('REQUEST_TIMEOUT'), 5000);
      } catch(e) {
        resolve('REQUEST_EXCEPTION: ' + e.message);
      }
    });
  });
  console.log('Test request result:', testResult);

  await mp.disconnect();
  console.log('Done.');
}
run().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
