const axios = require('axios');
const cheerio = require('cheerio');

const URL = 'https://www.ruta1000.com.ar/index2008.php?Resultado=Quiniela_Nacional_Sorteos_Anteriores';

axios.get(URL, {
  headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
  timeout: 30000,
}).then(res => {
  const $ = cheerio.load(res.data);
  let count = 0;
  
  $('tr').each((i, tr) => {
    const cells = $(tr).find('td');
    if (cells.length < 22) return;
    
    const text = $(cells.eq(0)).text();
    if (!text.includes('18/04/2026')) return;
    
    const horaMatch = text.match(/(\d{2}):(\d{2})/);
    if (!horaMatch) return;
    
    const hora = parseInt(horaMatch[1]);
    let turno = '';
    if (hora === 10) turno = 'previa';
    else if (hora === 12) turno = 'primera';
    else if (hora === 15) turno = 'matutina';
    else if (hora === 18) turno = 'vespertina';
    else if (hora === 21) turno = 'nocturna';
    else return;
    
    const numeros = [];
    for (let j = 1; j <= 20; j++) {
      const n = $(cells.eq(j)).text().trim();
      if (/^\d{4}$/.test(n)) numeros.push(n);
    }
    
    if (numeros.length === 20) {
      count++;
      console.log(`${turno.toUpperCase()}: ${numeros.slice(0, 5).join(', ')}...`);
    }
  });
  
  console.log(`\nTotal sorteos for 18/04/2026: ${count}`);
}).catch(err => console.error('Error:', err.message));