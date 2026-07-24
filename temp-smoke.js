const https = require('https');

function check(path, headers = {}) {
  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'quiniela-ia-two.vercel.app',
      path,
      method: 'GET',
      headers,
      timeout: 30000
    }, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        let parsed;
        try { parsed = JSON.parse(body); } catch { parsed = body.substring(0, 300); }
        resolve({ path, status: res.statusCode, body: parsed });
      });
    });
    req.on('error', e => resolve({ path, status: 0, error: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ path, status: 0, error: 'timeout' }); });
    req.end();
  });
}

(async () => {
  // Test 1: Bearer header
  const r1 = await check('/api/cron-scrape', {
    'Authorization': 'Bearer MDM2ZDVjOGItMzk4Yi00Mjk2LTlmNmYtYjA1OTJkNWQwNGFm'
  });
  console.log(`[Bearer header] Status: ${r1.status} | ${JSON.stringify(r1.body).substring(0,100)}`);

  // Test 2: query param
  const r2 = await check('/api/cron-scrape?secret=MDM2ZDVjOGItMzk4Yi00Mjk2LTlmNmYtYjA1OTJkNWQwNGFm');
  console.log(`[Query param]   Status: ${r2.status} | ${JSON.stringify(r2.body).substring(0,100)}`);

  // Test 3: .env.local value via query
  const r3 = await check('/api/cron-scrape?secret=quiniela_ia_cron_2024_seguro');
  console.log(`[env.local val] Status: ${r3.status} | ${JSON.stringify(r3.body).substring(0,100)}`);

  // Test 4: .env.local value via Bearer
  const r4 = await check('/api/cron-scrape', {
    'Authorization': 'Bearer quiniela_ia_cron_2024_seguro'
  });
  console.log(`[env Bearer]    Status: ${r4.status} | ${JSON.stringify(r4.body).substring(0,100)}`);
})();
