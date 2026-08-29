# ARCHITECTURE.md — Quiniela IA

## Stack
- **Framework**: Next.js 16+ (App Router)
- **UI**: React 19, TailwindCSS, shadcn/ui
- **Language**: TypeScript Strict
- **Database**: Supabase (PostgreSQL)
- **Hosting**: Vercel (Edge/Serverless)
- **Auth**: Supabase Auth
- **Payments**: Ualá Bis webhook
- **Cron**: cron-job.org + Vercel Cron

## Estructura de Directorios
```
app/
├── api/                    # Route Handlers
│   ├── predictions/        # API de predicciones
│   ├── cron-scrape/        # Scraping de resultados
│   ├── webhook-uala/       # Webhook de pagos
│   └── ...
├── pronostico/             # Páginas SSG de pronósticos
├── resultado/              # Páginas SSG de resultados
├── predictions/            # Página principal de predicciones
├── login/                  # Autenticación
├── admin/                  # Panel admin
└── layout.tsx              # Layout raíz con SEO

lib/
├── analisis/               # Motores de análisis estadístico
├── ai/                     # Integración con LLMs
├── ml/                     # Machine Learning (Markov, RF, Neural)
├── scrapers/               # Scraping pipeline
├── auth/                   # Autenticación y tiers
├── prediction/             # Lógica de predicciones
├── seo/                    # Generación de texto SEO
├── infrastructure/         # Repositorios Supabase
├── domain/                 # Value objects y servicios
└── config.ts               # Configuración centralizada

supabase/
├── migrations/             # Migraciones SQL
├── rate-limiter.sql        # Tabla + RPC rate limiting
└── verification-queue.sql  # Cola de verificación

components/
├── ui/                     # Componentes shadcn/ui
├── seo/                    # Componentes SEO
└── predictions/            # Componentes de predicciones
```

## Principios
1. **Server First**: Lógica en Route Handlers, no en cliente
2. **Database First**: Cálculos pesados en PostgreSQL (RPC)
3. **Edge First**: Middleware para seguridad, Route Handlers para lógica
4. **Feature First**: Organización por funcionalidad
5. **Composition**: Componentes compuestos, no herencia
