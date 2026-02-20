#!/usr/bin/env node

/**
 * check-api-endpoints.js
 * 
 * Verifica que todos los endpoints API estén respondiendo correctamente.
 * 
 * Uso:
 *   node scripts/check-api-endpoints.js
 * 
 * Requiere que npm run dev esté corriendo en otra terminal.
 */

import fetch from 'node-fetch'

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

const BASE_URL = 'http://localhost:3000'

const endpoints = [
  {
    name: 'GET /api/predictions',
    url: `${BASE_URL}/api/predictions?turno=Mañana&premium=0`,
    checks: {
      status: 200,
      hasProperty: ['two', 'three', 'four'],
      isArray: ['two', 'three', 'four'],
    },
  },
  {
    name: 'GET /api/pending',
    url: `${BASE_URL}/api/pending`,
    checks: {
      status: 200,
      isArray: [],
    },
  },
  {
    name: 'POST /api/init-db',
    url: `${BASE_URL}/api/init-db`,
    method: 'POST',
    checks: {
      status: 200,
    },
  },
]

async function checkEndpoint(endpoint) {
  const { name, url, method = 'GET', checks } = endpoint

  try {
    log(`${icons.loading} ${name}...`)

    const response = await fetch(url, { method, timeout: 5000 })
    const data = await response.json()

    // Check status
    if (response.status !== checks.status) {
      log(
        `  ${icons.error} Status: ${response.status} (esperado ${checks.status})`,
        'red'
      )
      return false
    }

    log(`  ${icons.ok} Status: ${response.status}`, 'green')

    // Check properties exist
    if (checks.hasProperty) {
      for (const prop of checks.hasProperty) {
        if (!(prop in data)) {
          log(`  ${icons.error} Propiedad faltante: "${prop}"`, 'red')
          return false
        }
      }
      log(`  ${icons.ok} Propiedades: ${checks.hasProperty.join(', ')}`, 'green')
    }

    // Check arrays
    if (checks.isArray) {
      for (const prop of checks.isArray) {
        if (!Array.isArray(data[prop])) {
          log(`  ${icons.error} "${prop}" no es un array`, 'red')
          return false
        }
      }
      log(`  ${icons.ok} Arrays válidos`, 'green')
    }

    return true
  } catch (error) {
    log(`  ${icons.error} Error: ${error.message}`, 'red')

    if (error.message.includes('ECONNREFUSED')) {
      log(`  💡 ¿Olvidaste ejecutar "npm run dev"?`, 'cyan')
    }

    return false
  }
}

async function checkAllEndpoints() {
  log('\n🚀 Verificando Endpoints API\n', 'cyan')
  log('='.repeat(50))
  log(`Base URL: ${BASE_URL}\n`, 'cyan')

  let passed = 0
  let failed = 0

  for (const endpoint of endpoints) {
    const result = await checkEndpoint(endpoint)
    if (result) {
      passed++
    } else {
      failed++
    }
    log('')
  }

  log('='.repeat(50))
  log(
    `\nResultado: ${icons.ok} ${passed} pasaron, ${icons.error} ${failed} fallaron\n`,
    passed === endpoints.length ? 'green' : 'red'
  )

  process.exit(failed === 0 ? 0 : 1)
}

// Ejecutar
checkAllEndpoints().catch(err => {
  console.error('Error:', err)
  process.exit(1)
})
