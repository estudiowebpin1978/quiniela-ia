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

### Realidad descubierta en producción (2026-10-15/16): el NroLoteria manda

El hallazgo decisivo del backfill masivo (2026-10-16): Poceada Federal se
organiza bajo **dos loterías miembro** — el listado oficial trae `Loteria`
(" Entre Ríos" o " Santa Fe") — y el endpoint `pdfpoceada` sólo **llena** el
extracto con el `NroLoteria` que organizó ese concurso:

| Lotería organizadora | NroLoteria del PDF | Sorteos listados 2021-2026 |
| --- | --- | --- |
| Entre Ríos | 1 | 1.160 |
| Santa Fe | 5 | 1.177 |

Con el número equivocado el PDF se devuelve como **formulario en blanco**
(misma cabecera, casillas vacías: verificado con los PDFs reales de 5358 y
5658). Esto explicaba los "PDFs ilegibles" de la primera corrida: NO es un
problema de antigüedad ni de fuentes sin ToUnicode (los PDFs de 2024
parsean perfecto con NroLoteria 1). `extraerExtractoPdfIAFAS` ahora:

1. prueba el `NroLoteria` preferido según `Loteria` del listado;
2. si no parsea, barre 1..6 (demás loterías miembro conocidas);
3. valida CADA intento contra concurso+fecha antes de aceptarlo (nunca se
   toma el extracto de otro sorteo);
4. si ninguna lotería lo tiene legible, queda como fallido con causa
   (`Sin extracto legible tras probar NroLoteria 1/2/3/4/5/6`).

Con esta vía el inventario oficial completo es **2.337 sorteos CONFIRMADOS**
(2021-06-22, concurso 3399 → 2026-10-15, concurso 5735; cero errores en 22
ventanas del listado) y el backfill local masivo reanudable los importa en
~1 min por ventana de 90 días (`zz-scratch-backfill-masivo`, borrado tras
su uso; la misma vía corre en el cron con `?historico=` y `limite=40`).

**Resultado final del backfill (2026-10-16): 2.337/2.337 importados y
validados** — 2.333 en la corrida masiva + los concursos **4127**
(2023-11-11), **4665** (2025-01-09), **5529** (2026-06-15) y **5544**
(2026-06-25), que habían fallado por errores transitorios de red (no por
ilegibilidad: re-verificados con el mismo flujo oficial y recuperados).
Estado en producción al cierre: **cero brechas >4 días, cero sorteos en
estado fallido/conflicto y cero filas fuera del listado oficial** (diff
listado↔DB = ∅ en ambas direcciones).

Otros hallazgos operativos siguen vigentes:

- Desde Vercel, `apps.loteriasantafe.gov.ar:8443` **no es alcanzable**
  (`fetch failed`): la sincronización usa IAFAS sola y lo reporta en su
  informe (`fuenteUsada: "iafas"`, sin corroboración). La ruta HTML de Santa Fe
  funciona en entornos donde el host sea accesible (verificado en local) y su
  selector sólo ofrece los últimos 3 meses.
- Runtime serverless: `pdf-parse`/`pdfjs` requieren `@napi-rs/canvas`
  (DOMMatrix), `serverExternalPackages` y el import literal del worker —
  correcciones aplicadas en `next.config.js` y `lib/poceada-federal/fuente.ts`.
- Lotes grandes (≥60 PDFs) pueden agotar los 300 s de la función (HTTP 500):
  usar `limite=40` (default) y reintentar; es reanudable. El backfill masivo
  completo (2.200+ sorteos) se corre en local/máquina con acceso a la red,
  no en serverless.

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
app/api/poceada-federal/combinaciones/route.ts     POST premium (snapshot +
                                                  objetivo confirmado) + GET
                                                  (evalúa pendientes)
app/poceada-federal/page.tsx                       UI premium con backtest
docs/sql/poceada-federal-stats.sql                 consultas SQL de apoyo
```

Estados: `pending | validated | conflict | failed`; incidentes de auditoría en
`poceada_federal_incidents`; predicciones append-only en
`poceada_federal_predictions`; RLS habilitada en las 3 tablas con política
sólo `service_role` (revocado `anon`/`authenticated`).

### Guardar y verificar contra el sorteo oficial

- **Guardado**: cada `POST /api/poceada-federal/combinaciones` registra una
  instantánea append-only con las 5 jugadas ANTES del sorteo. Si la fuente
  oficial (IAFAS) confirma el próximo concurso, se guarda
  `sorteo_objetivo_concurso` + `sorteo_objetivo_confirmado = true`; si no,
  queda `null/false` explícitamente (nunca se inventa el objetivo).
- **Verificación**: el `GET` de la misma ruta evalúa en modo perezoso las
  predicciones `pendiente` con `evaluarPrediccion()` — sólo contra sorteos ya
  **validados** en `poceada_federal_draws` y siempre de forma posterior al
  registro (mismo día permitido; día anterior jamás). Carga
  `estado = 'evaluada'`, `evaluacion` (concurso, fecha, números oficiales,
  aciertos 0–8 por jugada) y `evaluacion_draw_id`. Los motivos permanentes
  pasan a `no_evaluable`; los provisorios ("todavía no publicado") siguen
  `pendiente`. La UI lista estas jugadas y resalta los aciertos.
- Tests: `poceada-federal-api.test.ts` (evaluación en GET + objetivo
  confirmado en POST) y `poceada-federal-modelo.test.ts` (reglas de
  evaluación post-hoc).

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
  sólo se declara "ventaja demostrada" si el walk-forward (v1.1) la distingue
  del azar con las TRES condiciones: |diff| > 1.96·EE sobre la diferencia
  pareada por sorteo contra el **promedio de 5 conjuntos aleatorios de
  referencia** (semillas fijas; se informa su dispersión), **permutación
  pareada p < 0.05** (2000 sign-flips sembrados, contralor no paramétrico) y
  que el **período final reservado (holdout, ~20 % de las evaluaciones) NO la
  contradiga**. Aun así requiere confirmación con datos nuevos.
- El backtest también informa la **estabilidad** de la diferencia modelo−azar
  en 4 bloques cronológicos: una ventaja concentrada en un solo bloque se
  lee como inestable, no como descubrimiento.
- El backtest es **determinista** (semillas fijas): con el mismo historial
  validado y la misma versión se reproducen exactamente sus métricas, por lo
  que cada instantánea guardada puede auditar su backtest reconstruyéndolo
  desde `historial_huella` + versión (sin duplicar datos en la tabla).
- La probabilidad matemática de cada jugada (≥6/7/8 aciertos, hipergeométrica)
  es independiente del modelo y se muestra aparte en la UI.
- Un historial corto deja el estado en `experimental`; nunca se afirma que hay
  números "más probables".
- **Corrida de referencia v1.1 con el historial completo (2026-10-16):**
  walk-forward paso=1 con **2.273 evaluaciones** (2021-09-01 → 2026-10-15;
  60 sorteos iniciales de entrenamiento) arrojó dif. modelo−azar
  **+0,0328** aciertos/jugada (IC 95 % [0,0021, 0,0634]; EE 0,0156), memoria
  de **permutación p = 0,0445**, holdout de **455 evaluaciones**
  (2026-01-14 → 2026-10-15) con dif. **+0,0642** e IC [−0,0028, 0,1311]
  (no contradice) y bloques `−0,020 / +0,052 / +0,024 / +0,076`. El motor
  declara ventaja en las 3 condiciones, pero se lee con honestidad: es
  **marginal y fronteriza** — p e IC quedan justo en el filo de 0,05, el
  primer bloque (2021-2023) es negativo (ventaja inestable al inicio), el
  IC del holdout incluye 0 (no aporta evidencia positiva independiente), el
  tamaño práctico es ~2 % sobre el azar (+0,033 frente a 1,597 esperados)
  y las evaluaciones walk-forward son dependientes entre sí, lo que hace
  optimistas a los IC/p-valores. Veredicto: **evidencia débil y fronteriza
  a favor; NO es una ventaja probada — requiere confirmación prospectiva**
  con sorteos posteriores a la fecha del corte.
- La primera corrida del backtest con el historial parcial (1.000 filas por el
  tope de PostgREST) mostraba dif +0,003 (IC que incluía 0): el tope de 1000
  filas también afectaba a `/estado` y `historialValidado`; quedó corregido
  con paginación explícita y conteos `head+count`.
- **Generador determinista**: con el mismo historial validado devuelve
  siempre las mismas 5 jugadas (reproducible y auditable). Las jugadas
  CAMBIAN sólo cuando entran resultados oficiales nuevos — verificado
  empíricamente (102 → 104 sorteos alteró las 5 combinaciones). Pedidos
  repetidos sin un sorteo nuevo en el medio dan idénticos por diseño; la UI
  lo explica con la huella del historial ("sin cambios desde la última
  registrada").
