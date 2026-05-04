const axios = require('axios');
const cheerio = require('cheerio');
const { createClient } = require('@supabase/supabase-js');
const { format, subDays, isBefore } = require('date-fns');

// Configuración de Supabase
const supabase = createClient(
  'TU_SUPABASE_URL',
  'TU_SUPABASE_SERVICE_ROLE_KEY' // Importante usar el Service Role para escritura masiva
);

// Función para pausar y no saturar el servidor origen (evita ban de IP)
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function extraerDia(fechaStr) {
  // ADAPTAR ESTA URL A LA WEB QUE ELIJAS
  const url = `https://tu-sitio-elegido.com/resultados?fecha=${fechaStr}`; 
  
  try {
    const { data } = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    
    const $ = cheerio.load(data);
    let sorteosDelDia = [];

    // --- LÓGICA DE SCRAPING (Adaptar selectores CSS) ---
    // Ejemplo hipotético de cómo podrías armar el objeto
    // $('div.tabla-sorteo').each((index, element) => {
    //   const loteria = 'Nacional'; // Extraer del DOM
    //   const turno = 'Matutina';   // Extraer del DOM
    //   let numeros = [];
    //   $(element).find('td.numero').each((i, el) => numeros.push(parseInt($(el).text())));
    //   
    //   sorteosDelDia.push({
    //     fecha: fechaStr,
    //     loteria,
    //     turno,
    //     numeros
    //   });
    // });
    // ---------------------------------------------------

    if (sorteosDelDia.length > 0) {
      // Guardar masivamente en Supabase
      const { error } = await supabase
        .from('sorteos_quiniela')
        .upsert(sorteosDelDia, { onConflict: 'fecha,loteria,turno' });
      
      if (error) console.error(`Error en Supabase [${fechaStr}]:`, error.message);
      else console.log(`✅ Guardado: ${fechaStr} (${sorteosDelDia.length} sorteos)`);
    } else {
      console.log(`⚠️ Sin datos para: ${fechaStr} (¿Feriado/Domingo?)`);
    }

  } catch (error) {
    console.error(`❌ Error scrapeando [${fechaStr}]:`, error.message);
  }
}

async function iniciarBackfill() {
  const DIAS_A_EXTRAER = 730; // 2 años = 730 días
  const fechaFin = new Date(); // Hoy
  let fechaActual = subDays(fechaFin, DIAS_A_EXTRAER); 

  console.log('Iniciando extracción histórica...');

  while (isBefore(fechaActual, fechaFin)) {
    const fechaStr = format(fechaActual, 'yyyy-MM-dd'); // Formato: 2023-01-25
    
    await extraerDia(fechaStr);
    
    // Pausa crucial de 2 a 3 segundos entre peticiones para que no bloqueen tu IP
    await sleep(2500); 
    
    fechaActual = subDays(fechaActual, -1); // Sumar un día
  }

  console.log('🎉 Extracción histórica completada.');
}

iniciarBackfill();