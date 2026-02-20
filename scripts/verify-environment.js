#!/usr/bin/env node

/**
 * verify-environment.js
 * 
 * Script para verificar que el ambiente está correctamente configurado
 * para desarrollo o testing.
 * 
 * Uso:
 *   node scripts/verify-environment.js
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..')

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
  gear: '⚙️ ',
}

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`)
}

function check(name, condition, successMsg, failMsg) {
  if (condition) {
    log(`${icons.ok} ${name}: ${successMsg}`, 'green')
    return true
  } else {
    log(`${icons.error} ${name}: ${failMsg}`, 'red')
    return false
  }
}

async function verifyEnvironment() {
  log('\n🔧 Verificando Ambiente - Quiniela IA\n', 'cyan')

  let allPass = true

  // ============================================
  // 1. Variables de entorno
  // ============================================
  log('📋 Variables de Entorno', 'blue')
  log('─'.repeat(50))

  const envFiles = ['.env.local', '.env.test', '.env.example']
  let envConfig = {}

  for (const file of envFiles) {
    const filePath = path.join(projectRoot, file)
    const exists = fs.existsSync(filePath)

    if (exists && file !== '.env.example') {
      try {
        const content = fs.readFileSync(filePath, 'utf-8')
        const lines = content.split('\n').filter(l => l.trim() && !l.startsWith('#'))
        lines.forEach(line => {
          const [key, ...rest] = line.split('=')
          envConfig[key.trim()] = rest.join('=').trim()
        })
      } catch (e) {
        log(`${icons.warning} No se pudo leer ${file}`, 'yellow')
      }
    }

    check(
      `Archivo ${file}`,
      exists,
      'Existe',
      'No encontrado'
    )
  }

  log('') // Nueva línea

  // Verificar variables críticas
  const requiredVars = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
  ]

  for (const varName of requiredVars) {
    const value = envConfig[varName] || process.env[varName]
    allPass &= check(
      `Variable ${varName}`,
      !!value,
      'Configurada',
      'Falta configurar'
    )
  }

  // ============================================
  // 2. Dependencias Node.js
  // ============================================
  log('\n📦 Dependencias', 'blue')
  log('─'.repeat(50))

  const packageJsonPath = path.join(projectRoot, 'package.json')
  let packageJson = {}

  try {
    packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'))

    const requiredDeps = [
      '@supabase/supabase-js',
      '@playwright/test',
      'next',
      'react',
      'typescript',
    ]

    for (const dep of requiredDeps) {
      const isDep = packageJson.dependencies?.[dep] || packageJson.devDependencies?.[dep]
      allPass &= check(
        `Dependencia ${dep}`,
        !!isDep,
        isDep || 'instalada',
        'No instalada'
      )
    }
  } catch (e) {
    log(`${icons.error} No se pudo leer package.json: ${e.message}`, 'red')
    allPass = false
  }

  // ============================================
  // 3. Archivos de configuración
  // ============================================
  log('\n⚙️  Archivos de Configuración', 'blue')
  log('─'.repeat(50))

  const requiredFiles = [
    'playwright.config.ts',
    '.github/workflows/ci-cd.yml',
    'tsconfig.json',
    'next.config.ts',
  ]

  for (const file of requiredFiles) {
    const filePath = path.join(projectRoot, file)
    allPass &= check(
      `Archivo ${file}`,
      fs.existsSync(filePath),
      'Presente',
      'No encontrado'
    )
  }

  // ============================================
  // 4. Directorio de datos
  // ============================================
  log('\n💾 Base de Datos Local', 'blue')
  log('─'.repeat(50))

  const dataDir = path.join(projectRoot, 'data')
  check(
    'Directorio data/',
    fs.existsSync(dataDir),
    'Existe',
    'No existe (se creará al correr migrations)'
  )

  if (fs.existsSync(dataDir)) {
    const dbFile = path.join(dataDir, 'draws.db')
    const jsonlFile = path.join(dataDir, 'pending_draws.jsonl')

    check('Base SQLite (data/draws.db)', fs.existsSync(dbFile), 'Existe', 'No existe')
    check(
      'JSONL de pending (pending_draws.jsonl)',
      fs.existsSync(jsonlFile),
      'Existe',
      'No existe'
    )
  }

  // ============================================
  // 5. DirectorioE2E
  // ============================================
  log('\n🧪 Tests E2E', 'blue')
  log('─'.repeat(50))

  allPass &= check(
    'Directorio e2e/',
    fs.existsSync(path.join(projectRoot, 'e2e')),
    'Existe',
    'No existe'
  )

  allPass &= check(
    'Archivo e2e/full-flow.spec.ts',
    fs.existsSync(path.join(projectRoot, 'e2e/full-flow.spec.ts')),
    'Existe',
    'No existe'
  )

  // ============================================
  // 6. Scripts
  // ============================================
  log('\n🔧 Scripts Disponibles', 'blue')
  log('─'.repeat(50))

  const scripts = packageJson.scripts || {}
  const importantScripts = ['dev', 'build', 'lint', 'test:e2e']

  for (const script of importantScripts) {
    check(`Script "${script}"`, !!scripts[script], 'Disponible', 'No definido')
  }

  // ============================================
  // Resumen
  // ============================================
  log('\n' + '='.repeat(50), 'cyan')

  if (allPass) {
    log(`${icons.ok} ¡Ambiente listo! Puedes ejecutar:\n`, 'green')
    log('  Desarrollo:        npm run dev', 'cyan')
    log('  Tests E2E (local): npm run test:e2e', 'cyan')
    log('  Build producción:  npm run build', 'cyan')
    log('  Linting:           npm run lint', 'cyan')
  } else {
    log(
      `${icons.error} Faltan configuraciones. Revisa los errores arriba y consulta:\n`,
      'red'
    )
    log('  DIAGNOSTICO.md - Guía completa de troubleshooting', 'cyan')
    log('  .env.example - Template de variables', 'cyan')
  }

  log('='.repeat(50) + '\n', 'cyan')

  process.exit(allPass ? 0 : 1)
}

// Ejecutar
verifyEnvironment().catch(err => {
  console.error('Error en verificación:', err)
  process.exit(1)
})
