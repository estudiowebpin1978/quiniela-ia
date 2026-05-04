const { createClient } = require('@supabase/supabase-js')

const SB_URL = 'https://wazkylxgqckjfkomfotl.supabase.co'
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indhemt5bHhncWNramZrY21mb3JIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyNDc3NTUsImV4cCI6MjA4NzgyMzc1NX0.t_P2iF1eqEo1cqBXt3R4GQV2_XzVQ0VIq_2f6VS_Q2Y'

const supabase = createClient(SB_URL, SB_KEY)

const FERIADOS = [
  '2024-01-01', '2024-02-12', '2024-02-13', '2024-03-24', '2024-03-29', '2024-03-30',
  '2024-04-02', '2024-05-01', '2024-05-25', '2024-06-20', '2024-07-09', 
  '2024-12-08', '2024-12-25',
  '2025-01-01', '2025-02-03', '2025-02-04', '2025-03-24', '2025-04-02', '2025-04-03', '2025-04-04',
  '2025-05-01', '2025-05-25', '2025-06-20', '2025-07-09',
  '2025-12-08', '2025-12-25',
  '2026-01-01', '2026-02-16', '2026-02-17', '2026-03-24', '2026-04-02', '2026-04-03',
  '2026-05-01', '2026-05-25', '2026-06-20', '2026-07-09',
  '2026-12-08', '2026-12-25'
]

const TURNOS = ['Previa', 'Primera', 'Matutina', 'Vespertina', 'Nocturna']

// Scraper corregido
const scrapeRuta1000 = async (fecha) => {
  try {
    const parts = fecha.split('-')
    const fechaParam = `${parts[0]}_${parts[1]}_${parts[2]}`
    const url = `https://m.ruta1000.com.ar/index2008.php?FechaAlMinuto=${fechaParam}&Resultados=Nacional`
    
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    })
    
    if (!response.ok) {
      console.log(`  ❌ ${fecha}: Error ${response.status}`)
      return null
    }
    
    const html = await response.text()
    
    // Verificar si hay datos
    if (!html.includes('QUINIELA DE LA CIUDAD') && !html.includes('Nacional')) {
      console.log(`  ⚠️  ${fecha}: Sin datos de Nacional`)
      return null
    }
    
    // Extraer TODOS los números de 4 cifras
    const todosNumeros = []
    const regex = /\b(\d{4})\b/g
    let match
    
    while ((match = regex.exec(html)) !== null) {
      const num = parseInt(match[1])
      if (num >= 0 && num <= 9999) {
        todosNumeros.push(num)
      }
    }
    
    console.log(`  📊 ${fecha}: ${todosNumeros.length} números encontrados`)
    
    // Deben haber 100 números (5 sorteos × 20)
    if (todosNumeros.length >= 100) {
      return {
        'Previa': todosNumeros.slice(80, 100),
        'Primera': todosNumeros.slice(60, 80),
        'Matutina': todosNumeros.slice(40, 60),
        'Vespertina': todosNumeros.slice(20, 40),
        'Nocturna': todosNumeros.slice(0, 20)
      }
    }
    
    console.log(`  ⚠️  ${fecha}: Solo ${todosNumeros.length} números`)
    return null
  } catch (error) {
    console.error(`  ❌ Error en ${fecha}: ${error.message}`)
    return null
  }
}

// Función principal
const cargarHistorico = async (fechaInicio, fechaFin) => {
  console.log(`\n🎯 CARGA HISTÓRICA: ${fechaInicio} a ${fechaFin}`)
  
  const start = new Date(fechaInicio)
  const end = new Date(fechaFin)
  
  let fechaActual = new Date(start)
  let totalCargados = 0
  let fechasOmitidas = 0
  
  while (fechaActual <= end) {
    const fecha = fechaActual.toISOString().split('T')[0]
    const diaSemana = fechaActual.getDay()
    
    // Omitir domingos (0) y feriados
    if (diaSemana === 0 || FERIADOS.includes(fecha)) {
      console.log(`⏭  ${fecha}: Domingo/Feriado - Omitido`)
      fechaActual.setDate(fechaActual.getDate() + 1)
      fechasOmitidas++
      continue
    }
    
    console.log(`\n📅 Procesando: ${fecha}`)
    
    // Verificar si ya existe en BD
    const { data: existentes } = await supabase
      .from('draws_historicos')
      .select('sorteo')
      .eq('fecha', fecha)
      .limit(1)
    
    if (existentes && existentes.length > 0) {
      console.log(`  ⚠️  ${fecha} ya existe en BD`)
      fechaActual.setDate(fechaActual.getDate() + 1)
      await new Promise(resolve => setTimeout(resolve, 500))
      continue
    }
    
    // Scrapear
    const datos = await scrapeRuta1000(fecha)
    
    if (!datos) {
      console.log(`  ❌ ${fecha}: Sin datos`)
      fechaActual.setDate(fechaActual.getDate() + 1)
      await new Promise(resolve => setTimeout(resolve, 1000))
      continue
    }
    
    // Guardar en formato: {fecha, sorteo, posicion, numero}
    let registros = []
    
    for (const [sorteo, numeros] of Object.entries(datos)) {
      for (let i = 0; i < numeros.length; i++) {
        registros.push({
          fecha: fecha,
          sorteo: sorteo,
          posicion: i + 1,
          numero: numeros[i]
        })
      }
    }
    
    // Insertar en Supabase
    const { error } = await supabase
      .from('draws_historicos')
      .insert(registros)
    
    if (error) {
      console.error(`  ❌ Error insertando ${fecha}: ${error.message}`)
    } else {
      console.log(`  ✅ ${fecha}: ${registros.length} registros guardados`)
      totalCargados += registros.length
    }
    
    // Pausa para no saturar
    await new Promise(resolve => setTimeout(resolve, 2000))
    
    fechaActual.setDate(fechaActual.getDate() + 1)
  }
  
  console.log(`\n✅ CARGA COMPLETA:`)
  console.log(`   Total cargados: ${totalCargados}`)
  console.log(`   Fechas omitidas: ${fechasOmitidas}`)
}

// Ejecutar
const args = process.argv.slice(2)
const fechaInicio = args[0] || '2024-01-01'
const fechaFin = args[1] || new Date().toISOString().split('T')[0]

cargarHistorico(fechaInicio, fechaFin)
  .then(() => {
    console.log('\n🎉 PROCESO FINALIZADO')
    process.exit(0)
  })
  .catch(error => {
    console.error('Error fatal:', error)
    process.exit(1)
  })