#!/usr/bin/env node

/**
 * verify-supabase.js
 * 
 * Verifica que Supabase está correctamente configurado y accesible.
 * 
 * Uso:
 *   node scripts/verify-supabase.js
 */

import fetch from 'node-fetch'
import { createClient } from '@supabase/supabase-js'

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
}

const icons = {
  ok: '✅',
  error: '❌',
  warning: '⚠️ ',
  info: 'ℹ️ ',
  loading: '⏳',
}

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`)
}

async function verifySupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  log('\n🔗 Verificando Conexión a Supabase\n', 'cyan')
  log('='.repeat(50))

  // ============================================
  // 1. Verificar configuración
  // ============================================
  log('\n📋 Configuración', 'blue')

  if (!supabaseUrl) {
    log(`${icons.error} NEXT_PUBLIC_SUPABASE_URL no configurada`, 'red')
    process.exit(1)
  }

  if (!anonKey) {
    log(`${icons.error} NEXT_PUBLIC_SUPABASE_ANON_KEY no configurada`, 'red')
    process.exit(1)
  }

  if (!serviceKey) {
    log(`${icons.error} SUPABASE_SERVICE_ROLE_KEY no configurada`, 'red')
    process.exit(1)
  }

  log(`${icons.ok} URL: ${supabaseUrl}`, 'green')
  log(`${icons.ok} Anon Key: ${anonKey.substring(0, 20)}...`, 'green')
  log(`${icons.ok} Service Key: ${serviceKey.substring(0, 20)}...`, 'green')

  // ============================================
  // 2. Verificar conectividad HTTP
  // ============================================
  log('\n🌐 Conectividad HTTP', 'blue')

  try {
    log(`${icons.loading} Conectando a ${supabaseUrl}...`)

    const response = await fetch(`${supabaseUrl}/rest/v1/`, {
      method: 'GET',
      headers: {
        'apikey': anonKey,
        'Authorization': `Bearer ${anonKey}`,
      },
      timeout: 5000,
    })

    if (response.ok) {
      log(`${icons.ok} Conectividad: OK (HTTP ${response.status})`, 'green')
    } else if (response.status === 401 || response.status === 403) {
      log(
        `${icons.error} Autenticación falló (HTTP ${response.status}). Verifica las keys.`,
        'red'
      )
      process.exit(1)
    } else {
      log(
        `${icons.warning} Respuesta inesperada (HTTP ${response.status})`,
        'yellow'
      )
    }
  } catch (error) {
    log(`${icons.error} Conexión fallida`, 'red')
    log(`  Error: ${error.message}`, 'red')

    if (error.message.includes('ECONNREFUSED')) {
      log('\n💡 Sugerencias:', 'cyan')
      log('  - Si usas Supabase local: npx supabase start', 'cyan')
      log('  - Si usas Supabase remota: Verifica que el proyecto no esté pausado', 'cyan')
    }

    if (error.message.includes('ENOTFOUND')) {
      log('\n💡 Sugerencias:', 'cyan')
      log('  - Verifica tu conexión a internet', 'cyan')
      log('  - Verifica que NEXT_PUBLIC_SUPABASE_URL sea correcto', 'cyan')
    }

    if (
      error.message.includes('unable to verify') ||
      error.message.includes('certificate verify')
    ) {
      log('\n💡 Sugerencias:', 'cyan')
      log('  - Para desarrollo local, añade a .env.local:', 'cyan')
      log('    NODE_TLS_REJECT_UNAUTHORIZED=0', 'cyan')
    }

    process.exit(1)
  }

  // ============================================
  // 3. Verificar cliente Supabase
  // ============================================
  log('\n🔐 Cliente Supabase', 'blue')

  try {
    const client = createClient(supabaseUrl, serviceKey)
    log(`${icons.ok} Cliente creado exitosamente`, 'green')
  } catch (error) {
    log(`${icons.error} Error creando cliente: ${error.message}`, 'red')
    process.exit(1)
  }

  // ============================================
  // 4. Verificar tabla 'draws'
  // ============================================
  log('\n📊 Base de Datos (tabla "draws")', 'blue')

  try {
    const client = createClient(supabaseUrl, serviceKey)
    log(`${icons.loading} Consultando tabla draws...`)

    const { data, error, count } = await client
      .from('draws')
      .select('*', { count: 'exact' })
      .limit(1)

    if (error) {
      if (error.message.includes('relation "public.draws" does not exist')) {
        log(`${icons.warning} Tabla "draws" no existe`, 'yellow')
        log('\n💡 Solución:', 'cyan')
        log('  1. Ejecuta: curl http://localhost:3000/api/init-db', 'cyan')
        log('  2. O copia y ejecuta SQL en Supabase Studio:', 'cyan')
        log('     Ver archivo: supabase-create-draws-table.sql', 'cyan')
      } else {
        log(`${icons.error} Error consultando tabla: ${error.message}`, 'red')
      }
    } else {
      log(`${icons.ok} Tabla "draws" existe`, 'green')
      log(`${icons.info} Total registros: ${count || 0}`, 'cyan')

      if (count === 0) {
        log(`${icons.warning} Tabla vacía`, 'yellow')
        log('\n💡 Solución: Ejecuta /api/init-db para poblar datos', 'cyan')
      } else {
        log(`${icons.ok} Datos presentes`, 'green')
      }
    }
  } catch (error) {
    log(`${icons.error} Error: ${error.message}`, 'red')
    process.exit(1)
  }

  // ============================================
  // Resumen
  // ============================================
  log('\n' + '='.repeat(50), 'cyan')
  log(`${icons.ok} ¡Verificación completada!\n`, 'green')

  process.exit(0)
}

// Ejecutar
verifySupabase().catch(err => {
  console.error('Error:', err)
  process.exit(1)
})
