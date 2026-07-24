$ErrorActionPreference = 'Stop'

if (-not (Test-Path '.env.local')) {
  Write-Host 'Creating .env.local from .env.example' -ForegroundColor Yellow
  Copy-Item '.env.example' '.env.local'
}

npm ci
npm run build

Write-Host ''
Write-Host 'Listo para desplegar en Vercel.' -ForegroundColor Green
Write-Host 'Ejecuta: vercel --prod' -ForegroundColor Cyan
