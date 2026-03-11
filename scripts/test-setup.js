#!/usr/bin/env node
// scripts/test-setup.js — Valida que el proyecto esté correctamente configurado
const https = require("https");
const fs = require("fs");
const path = require("path");

console.log("\n🔍 Validando configuración de Quiniela IA...\n");

const checks = [];

// 1. .env.local existe
const envPath = path.join(__dirname, "..", ".env.local");
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, "utf8");
  const hasUrl = content.includes("NEXT_PUBLIC_SUPABASE_URL=https://");
  const hasAnon = content.includes("NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ");
  const hasService = content.includes("SUPABASE_SERVICE_ROLE_KEY=eyJ");
  checks.push({ ok: hasUrl, msg: "NEXT_PUBLIC_SUPABASE_URL configurada" });
  checks.push({ ok: hasAnon, msg: "NEXT_PUBLIC_SUPABASE_ANON_KEY configurada" });
  checks.push({ ok: hasService, msg: "SUPABASE_SERVICE_ROLE_KEY configurada" });
} else {
  checks.push({ ok: false, msg: ".env.local no encontrado — Copiar .env.example a .env.local" });
}

// 2. node_modules existe
checks.push({
  ok: fs.existsSync(path.join(__dirname, "..", "node_modules")),
  msg: "node_modules instalado (npm install)"
});

// 3. Archivos clave existen
const keyFiles = [
  "app/layout.tsx", "app/predictions/page.tsx",
  "app/api/predictions/route.ts", "app/api/pending/route.ts",
  "lib/supabase.ts", "scripts/ingest_ruta1000.py"
];
for (const f of keyFiles) {
  checks.push({ ok: fs.existsSync(path.join(__dirname, "..", f)), msg: `Archivo: ${f}` });
}

// Mostrar resultados
let allOk = true;
for (const c of checks) {
  const icon = c.ok ? "✅" : "❌";
  if (!c.ok) allOk = false;
  console.log(`  ${icon}  ${c.msg}`);
}

console.log();
if (allOk) {
  console.log("✨ Todo listo. Corré: npm run dev\n");
} else {
  console.log("⚠️  Hay problemas por resolver. Revisá los ❌ arriba.\n");
  process.exit(1);
}
