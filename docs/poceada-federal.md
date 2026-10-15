# Poceada Federal — módulo oficial de resultados, análisis y combinaciones

Módulo **independiente** de `quiniela-ia`: obtiene, valida y almacena los
resultados **oficiales históricos** de la Poceada Federal (Lotería de Santa Fe
/ IAFAS), genera **5 combinaciones de 8 números** con backtesting walk-forward y
guarda **instantáneas pre-sorteo**. No toca Quiniela, Poceada Ciudad, Brinco ni
OMEGA V6.

## 1. Fuentes oficiales verificadas (2026-10-14/15)

| Fuente | URL / endpoint | Qué aporta |
| --- | --- | --- |
| Extractos Lotería de Santa Fe (PrimeFaces/JSF) | `https://apps.loteriasantafe.gov.ar:8443/Extractos/paginas/mostrarPoceadaFederal.xhtml?display=0` | Últimos 3 meses: 20 números, concurso (`selected="selected"`), tabla de premios, PDF por sorteo, ViewState para navegar |
| IAFAS — listado oficial | `POST https://servicios.iafas.gov.ar/ServicioExtracto/Sorteos` con `{"fechaDesde","fechaHasta","Modalidad":"30","estado":""}` | Concursos, fechas, horas y estado `CONFIRMADO` de Poceada Federal (idJuego/idModalidad 30) |
| IAFAS — PDF del extracto | `POST https://servicios.iafas.gov.ar/serviciopdf/Extractos/pdfpoceada` con `{"Modalidad":30,"NroLoteria":1,"Sorteo":NROSorteo,"FechaSorteo":"YYYY-MM-DD"}` | PDF oficial por sorteo (`application/pdf`, `%PDF-1.3`) con cabecera `dd/mm/yyyy CONCURSO HH:MMhs` y los 20 números |
| IAFAS — extracto reciente | `POST https://servicios.iafas.gov.ar/ServicioExtracto/ultimoExtracto` `{}` | Últimos sorteos con `NROSorteo`, `OrdenSalida` 1..20 y `Valor` 0..99 (corroboración estructurada) |

- Auth IAFAS: `Authorization: Bearer <JWT>` que el **SPA oficial público** sirve
  en su propio bundle (`main.fdd969fe.js`); se **extrae en runtime** (nunca se
  almacena ni se comitea el token).
- CORS/SSL: las llamadas son server-side (rutas/cron), nunca desde el navegador.
- Prohibido terceros: el módulo sólo acepta hosts de `*.loteriasantafe.gov.ar` y
  `servicios.iafas.gov.ar` (allowlist en `lib/poceada-federal/validador.ts`).

### Verificaciones hechas contra los sitios reales

- HTML:20 números en `.cuadradoPo`, selects `form:mesSeleccionado_input` /
  `form:sorteoSeleccionado_input`, premios `td.tdpremios/tdganadores/tdimportes`,
  PDF `param_ID_sor=<UUID>`. **Navegación JSF verificada**: POST de formulario
  completo con ViewState fresco cambia de mes y de sorteo (la atribución segura
  usa `selected="selected"`; en la página por defecto se usa la primera opción y
  la atribución se resuelve por igualdad de conjuntos contra IAFAS).
- IAFAS: `Sorteos` con `Modalidad:"30"` filtra sólo Poceada; **tope de 500
  filas** por consulta → el listado pagina por ventanas (división automática).
- PDF: descarga + `pdf-parse` probado sobre el documento real del concurso
  5710 (20 números extraídos: `01 07 10 11 14 / 29 33 41 44 48 / …`).
- Corroboración: los 20 números del HTML de Santa Fe se comparan por **igualdad
  de conjuntos** con los de IAFAS (5732/5733); discrepancia → `conflict` +
  incidente, nunca se guarda un resultado "adivinado".

## 2. Cobertura histórica real (consultada el 2026-10-15, `Modalidad:"30"`)

| Año | Sorteos listados | Rango observado |
| --- | --- | --- |
| 2021 | 162 | 2021-06-22 → 2021-12-30 |
| 2022 | 302 | 2022-01-03 → 2022-12-30 |
| 2023 | 305 | 2023-01-02 → 2023-12-30 |
| 2024 | 484 | 2024-01-02 → 2024-12-31 |
| 2025 | 500 (tope) | 2025-01-02 → 2025-10-27 *(resto de 2025 requiere subdividir la ventana)* |
| 2026 | 476 | 2026-01-02 → 2026-10-14 |

- Consulta `2021-01-01 → 2021-06-21` devuelve **0 filas**: los datos oficiales
  de IAFAS **comienzan el 2021-06-22**; antes no hay historial consultable (no
  se rellena con datos de terceros ni estimaciones).
- Total recuperable estimado: **≥ 2.279 sorteos oficiales** (el remanente de
  nov/dic 2025 se obtiene subdividiendo la ventana por el tope de 500).
- Lote típico del backfill:40 sorteos/corrida (cada PDF pesa ~500 KB).

### Realidad descubierta en producción (2026-10-15, tras backfill real)

La extracción de texto de los PDFs oficiales **no funciona para toda la
historia**: los PDFs de épocas antiguas dibujan los números con una fuente CID
sin ToUnicode, y `pdfjs` sólo extrae los textos con mapa (nombres). Medido en
prod con lotes reales:

| Ventana | Importados / procesados |
| --- | --- |
| 2024 completo | 0 / 40 |
| 2026 ene–jul (reintentos) | 48 / ~200 |
| 2026-08 | 52 / 100 |
| 2026-08-31 → 2026-10-14 | ~51 (casi completa) |

- **102 sorteos validados en prod** (2026-02-02 → 2026-10-14) con brechas
  reales declaradas vía `/api/poceada-federal/estado`
  (`brechasMayores4Dias`: feb→ago y ago→oct).
- Los PDFs no extraíbles quedan como **fallidos con causa auditada**
  (`PDF sin cabecera dd/mm/yyyy CONCURSO HH:MMhs`), nunca como validados; se
  reintentan solos en cada corrida del cron (el lote se recalcula).
- Desde Vercel, `apps.loteriasantafe.gov.ar:8443` **no es alcanzable**
  (`fetch failed`): la sincronización usa IAFAS sola y lo reporta en su
  informe (`fuenteUsada: "iafas"`, sin corroboración). La ruta HTML de Santa Fe
  funciona en entornos donde el host sea accesible (verificado en local).
- Runtime serverless: `pdf-parse`/`pdfjs` requieren `@napi-rs/canvas`
  (DOMMatrix), `serverExternalPackages` y el import literal del worker —
  correcciones aplicadas en `next.config.js` y `lib/poceada-federal/fuente.ts`.
- Lotes grandes (≥60 PDFs) pueden agotar los 300 s de la función (HTTP 500):
  usar `limite=40` (default) y reintentar; es reanudable.

## 3. Arquitectura del módulo

```
supabase/migrations/20261015060000_poceada_federal_module.sql  (aditiva)
lib/poceada-federal/
  tipos.ts          interfaces del dominio
  parser.ts         parsers PUROS (HTML Santa Fe, texto PDF IAFAS, fechas)
  validador.ts      8 reglas de auditoría + allowlist de hosts + hash
  fuente.ts         red: HTML (ViewState/POST) + IAFAS (JWT runtime, PDF)
  repositorio.ts    Supabase service_role (insert ignorando duplicados)
  actualizar.ts     sincronización incremental con corroboración cruzada
  backfill.ts       importación histórica por lotes, reanudable, dry-run
  estadisticas.ts   motor descriptivo 00-99 (frecuencias, recencia, evolución,
                    coocurrencias regularizadas, incertidumbre, teórica 20%)
  combinaciones.ts  5 estrategias + ensemble OOS + penalización de solapamiento
  backtest.ts       walk-forward cronológico vs baseline aleatorio sembrado
  evaluacion.ts     evaluación post-hoc sólo con sorteos posteriores
app/api/cron-poceada-federal/route.ts              cron (auth CRON_SECRET)
app/api/poceada-federal/draws/route.ts             lectura pública paginada
app/api/poceada-federal/estado/route.ts            cobertura + conteos
app/api/poceada-federal/combinaciones/route.ts     POST premium (snapshot) + GET
app/poceada-federal/page.tsx                       UI premium con backtest
docs/sql/poceada-federal-stats.sql                 consultas SQL de apoyo
```

Estados: `pending | validated | conflict | failed`; incidentes de auditoría en
`poceada_federal_incidents`; predicciones append-only en
`poceada_federal_predictions`; RLS habilitada en las 3 tablas con política
sólo `service_role` (revocado `anon`/`authenticated`).

## 4. Operación

### Cron (cron-job.org — no modifica los crons existentes)

```
GET  https://<app>/api/cron-poceada-federal
Header: Authorization: Bearer <CRON_SECRET>
```

- Frecuencia sugerida: cada 30–60 min (los sorteos son lun–sáb, 15:00 y 21:00).
- Backfill histórico (un lote reanudable por corrida):
  `GET /api/poceada-federal/backfill?…` → no: se hace con
  `/api/cron-poceada-federal?historico=2021-06-22,2021-12-31&limite=40`
  (repetir ventanas hasta cubrir; idempotente: sólo inserta concursos nuevos).

### Variables de entorno

- `CRON_SECRET` — ya existente en el proyecto (se reutiliza; timing-safe).
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY` — ya existentes.
- No se agregan claves nuevas ni se exponen en el navegador.

### Comandos de validación

```bash
npm run lint && npm run typecheck && npm test && npm run build
# extracción en vivo (opt-in, usa la red de las fuentes oficiales):
POCEADA_FEDERAL_LIVE=1 npx vitest run lib/__tests__/poceada-federal-integracion.live.test.ts
```

## 5. Pasos de despliegue

1. **Migración**: `supabase/migrations/20261015060000_poceada_federal_module.sql`
   — **ya aplicada en prod** (verificado 2026-10-15: las rutas responden y la
   tabla existe; ROLLBACK documentado dentro del archivo).
2. Configurar la tarea en cron-job.org con el header de `CRON_SECRET`
   (frecuencia cada 30–60 min; opcional backfill por ventanas con
   `?historico=desde,hasta&limite=40`).
3. Backfill: hecho un primer pase (102 validados); las corridas posteriores
   reintentan los pendientes automáticamente (es reanudable).
4. Verificar `GET /api/poceada-federal/estado` → `conteoPorEstado.validated`.

## 6. Notas de honestidad

- Las combinaciones son **selecciones heurísticas basadas en el historial**;
  sólo se declara "ventaja demostrada" si el walk-forward la distingue del
  azar (|diff| > 1.96·EE) y aun así requiere confirmación con datos nuevos.
- La probabilidad matemática de cada jugada (≥6/7/8 aciertos, hipergeométrica)
  es independiente del modelo y se muestra aparte en la UI.
- Un historial corto deja el estado en `experimental`; nunca se afirma que hay
  números "más probables".
