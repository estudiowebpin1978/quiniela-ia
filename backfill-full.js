const axios = require('axios');
const cheerio = require('cheerio');
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://wazkylxgqckjfkcmfotl.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indhemt5bHhncWNramZrY21mb3RsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjI0Nzc1NSwiZXhwIjoyMDg3ODIzNzU1fQ.IiksS0WwZZVlx9XJCzLhswJzSeeWnNS0dp3Z5uZiCSs';
const supabase = createClient(supabaseUrl, supabaseKey);

const URL = 'https://www.ruta1000.com.ar/index2008.php?Resultado=Quiniela_Nacional_Sorteos_Anteriores';

const DAYS_BACK = 100;
const DELAY_MS = 2000;

async function fetchAll() {
  console.log('Fetching:', URL);
  const { data } = await axios.get(URL, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    timeout: 30000,
  });
  
  const $ = cheerio.load(data);
  const sorteosByFecha = {};
  
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
    
    if (numeros.length === 20 && turno) {
      if (!sorteosByFecha[fechaStr]) sorteosByFecha[fechaStr] = {};
      if (!sorteosByFecha[fechaStr][turno]) {
        sorteosByFecha[fechaStr][turno] = numeros;
      }
    }
  });
  
  console.log(`Found ${Object.keys(sorteosByFecha).length} fechas`);
  return sorteosByFecha;
}

async function saveAll(sorteosByFecha, minDaysBack = 0) {
  const now = new Date();
  let guardados = 0;
  let saltados = 0;
  
  for (const [fecha, turnos] of Object.entries(sorteosByFecha)) {
    const fechaDate = new Date(fecha);
    const daysDiff = Math.floor((now - fechaDate) / (1000 * 60 * 60 * 24));
    
    if (daysDiff > minDaysBack) {
      saltados++;
      continue;
    }
    
    for (const [turno, numeros] of Object.entries(turnos)) {
      const { error } = await supabase
        .from('quiniela_nacional')
        .upsert({
          fecha,
          turno,
          resultados: numeros.map((n, i) => ({ posicion: i + 1, numero: n })),
          updated_at: new Date(),
        }, { onConflict: 'fecha,turno' });
      
      if (!error) guardados++;
      await new Promise(r => setTimeout(r, 100));
    }
    
    console.log(`Saved ${fecha}: ${Object.keys(turnos).join(', ')}`);
    await new Promise(r => setTimeout(r, DELAY_MS));
  }
  
  console.log(`Total guardados: ${guardados}, saltados: ${saltados}`);
}

(async () => {
  try {
    const sorteosByFecha = await fetchAll();
    if (sorteosByFecha && Object.keys(sorteosByFecha).length > 0) {
      await saveAll(sorteosByFecha, DAYS_BACK);
    }
    console.log('Done!');
  } catch (err) {
    console.error('Error:', err.message);
  }
})();