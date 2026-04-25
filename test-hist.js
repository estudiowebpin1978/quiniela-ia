const axios = require('axios');
const cheerio = require('cheerio');

async function check(date) {
  try {
    const { data } = await axios.get(
      'https://www.nacionalloteria.com/argentina/quiniela-nacional.php?del-dia=' + date + '&periodo=primera',
      { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 10000 }
    );
    const $ = cheerio.load(data);
    const numbers = [];
    $('table tr').each((_, row) => {
      const cells = $(row).find('td');
      if (cells.length >= 2) {
        const pos = $(cells[0]).text().trim();
        const num = $(cells[1]).text().trim();
        if (/^\d{1,2}$/.test(pos) && /^\d{4}$/.test(num)) {
          numbers.push(num);
        }
      }
    });
    console.log(date, '- valid numbers:', numbers.length);
    if (numbers.length >= 20) {
      console.log('  First 5:', numbers.slice(0, 5));
    }
  } catch(e) {
    console.log(date, '- error:', e.message);
  }
}

(async () => {
  for (const date of ['2026-04-20', '2026-04-01', '2026-03-15', '2026-02-01', '2026-01-01', '2025-12-15', '2025-10-01', '2025-07-01']) {
    await check(date);
  }
})();