const axios = require('axios');
const cheerio = require('cheerio');
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://wazkylxgqckjfkcmfotl.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indhemt5bHhncWNramZrY21mb3RsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjI0Nzc1NSwiZXhwIjoyMDg3ODIzNzU1fQ.IiksS0WwZZVlx9XJCzLhswJzSeeWnNS0dp3Z5uZiCSs';
const supabase = createClient(supabaseUrl, supabaseKey);

const URL = 'https://www.ruta1000.com.ar/index2008.php?Resultado=Quiniela_Nacional_Sorteos_Anteriores';

async function scrape() {
  console.log('Fetching:', URL);
  const { data } = await axios.get(URL, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    timeout: 30000,
  });
  
  const $ = cheerio.load(data);
  const sorteos = {};
  
  $('tr').each((_, tr) => {
    const cells = $(tr).find('td');
    if (cells.length < 22) return;
    
    const text = cells.eq(0).text();
    if (!text.includes('/') || text.includes('Fecha')) return;
    
    const fechaMatch = text.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    if (!fechaMatch) return;
    
    const day = fechaMatch[1];
    const month = fechaMatch[2];
    const year = fechaMatch[3];
    const fechaStr = `${year}-${month}-${day}`;
    
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
    for (let i = 1; i <= 20; i++) {
      const n = cells.eq(i).text().trim();
      if (/^\d{4}$/.test(n)) numeros.push(n);
    }
    
    if (numeros.length === 20 && turno && !sorteos[turno]) {
      sorteos[turno] = { fecha: fechaStr, numeros };
    }
  });
  
  console.log('Found sorteos:', Object.keys(sorteos));
  return sorteos;
}

async function save(sorteos, fecha) {
  let guardados = 0;
  for (const [turno, data] of Object.entries(sorteos)) {
    console.log(`Saving ${turno} for ${fecha}...`);
    const { error } = await supabase
      .from('quiniela_nacional')
      .upsert({
        fecha,
        turno,
        resultados: data.numeros.map((n, i) => ({ posicion: i + 1, numero: n })),
        updated_at: new Date(),
      }, { onConflict: 'fecha,turno' });
    
    if (error) {
      console.error(`Error saving ${turno}:`, error.message);
    } else {
      guardados++;
      console.log(`Saved ${turno}: ${data.numeros.slice(0, 3).join(', ')}...`);
    }
  }
  console.log(`Total guardados: ${guardados}`);
}

scrape().then(sorteos => {
  const fecha = '2026-04-18';
  if (sorteos && Object.keys(sorteos).length > 0) {
    return save(sorteos, fecha);
  }
}).catch(err => console.error('Error:', err.message));