const automator = require('miniprogram-automator');
const WS = 'ws://127.0.0.1:9420';

async function run() {
  const mp = await automator.connect({ wsEndpoint: WS });
  console.log('Connected.');

  // Check if uni.request still works (might have captured original wx.request)
  let result = await mp.evaluate(() => {
    return new Promise((resolve) => {
      const info = {
        wxRequestType: typeof wx.request,
        uniRequestType: typeof (typeof uni !== 'undefined' ? uni.request : undefined),
        uniType: typeof uni
      };
      
      if (typeof uni !== 'undefined' && typeof uni.request === 'function') {
        try {
          uni.request({
            url: 'http://192.168.50.135:3010/__local_functions__/health',
            method: 'GET',
            success: (res) => resolve(JSON.stringify({...info, result: 'UNI_OK: ' + res.statusCode})),
            fail: (err) => resolve(JSON.stringify({...info, result: 'UNI_FAIL: ' + JSON.stringify(err).substring(0, 200)})),
            complete: () => {}
          });
          setTimeout(() => resolve(JSON.stringify({...info, result: 'UNI_TIMEOUT'})), 8000);
        } catch(e) {
          resolve(JSON.stringify({...info, result: 'UNI_EXCEPTION: ' + e.message}));
        }
      } else {
        resolve(JSON.stringify({...info, result: 'NO_UNI_REQUEST'}));
      }
    });
  });
  console.log('Result:', result);

  await mp.disconnect();
}
run().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
