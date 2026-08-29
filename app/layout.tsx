import type { Metadata, Viewport } from "next";
import "./globals.css";
import Providers from "@/components/Providers";

const BASE_URL = "https://quiniela-ia-two.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),
  title: {
    default: "Quiniela IA | Pronósticos Estadísticos y Cálculos Matemáticos",
    template: "%s | Quiniela IA",
  },
  description:
    "Predicciones inteligentes y análisis de 30 factores estadísticos en tiempo real para la Quiniela Nacional y Ciudad de Buenos Aires. Números probables para 2, 3 y 4 cifras.",
  keywords: [
    // Principales / Alto Volumen
    "pronostico quiniela nacional",
    "numeros para la quiniela de hoy",
    "datos quiniela nacional",
    "quiniela ciudad de hoy",
    "predicciones quiniela nacional",
    "resultado quiniela nacional hoy",
    // Long-tail / Matemáticas e IA
    "calculo matematico quiniela argentina",
    "numeros mas atrasados quiniela nacional",
    "inteligencia artificial para la quiniela",
    "como saber que numero va a salir en la quiniela",
    "algoritmo pronostico quiniela de hoy",
    "estadisticas quiniela nacional 2 3 y 4 cifras",
    // Búsquedas por Turno
    "quiniela previa nacional pronosticos",
    "quiniela primera nacional pronostico",
    "quiniela matutina datos de hoy",
    "quiniela vespertina numeros recomendados",
    "quiniela nocturna nacional pronostico",
    "quiniela ia",
  ],
  authors: [{ name: "Quiniela IA Team" }],
  creator: "Quiniela IA",
  publisher: "Quiniela IA",
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "Quiniela IA | Pronósticos Inteligentes de la Quiniela Argentina",
    description:
      "Descubrí los números con mayor probabilidad estadística para la Quiniela Nacional y Ciudad usando Inteligencia Artificial y análisis probabilístico.",
    url: BASE_URL,
    siteName: "Quiniela IA",
    locale: "es_AR",
    type: "website",
    images: [
      {
        url: "/icon-512.png",
        width: 512,
        height: 512,
        alt: "Quiniela IA - Pronósticos y Predicciones Estadísticas",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Quiniela IA | Pronósticos y Cálculos Matemáticos",
    description:
      "Algoritmo predictivo de 30 factores estadísticos para la Quiniela Nacional de Buenos Aires.",
    images: [`${BASE_URL}/icon-512.png`],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#0a0a12",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className="dark" style={{ background: "#030307" }}>
      <head>
        <meta name="google-site-verification" content="mpFSw0SQRIk4wqUcbPB04-F3UTHZ9c_9yAoe0Yfr_t0" />
        <style dangerouslySetInnerHTML={{ __html: `
          html, body { background: #030307 !important; color: #f8fafc !important; }
          body { min-height: 100vh; }
        ` }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="icon" type="image/png" href="/favicon.png" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="theme-color" content="#0a0a12" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "SoftwareApplication",
              name: "Quiniela IA",
              operatingSystem: "Web",
              applicationCategory: "UtilitiesApplication",
              description:
                "Motor de cálculo y análisis estadístico en tiempo real para predicciones de Quiniela Nacional. Algoritmo de 30 factores con Monte Carlo y análisis probabilístico.",
              url: BASE_URL,
              offers: {
                "@type": "Offer",
                price: "0",
                priceCurrency: "ARS",
                availability: "https://schema.org/InStock",
              },
              author: {
                "@type": "Organization",
                name: "Quiniela IA",
                url: BASE_URL,
              },
              featureList: [
                "Análisis de 30 factores estadísticos",
                "Simulaciones Monte Carlo (5000+ iteraciones)",
                "Predicciones 2, 3 y 4 cifras",
                "5 turnos: Previa, Primera, Matutina, Vespertina, Nocturna",
                "Historial de resultados oficiales",
                "Analizador de números personal",
              ],
            }),
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "Dataset",
              name: "Quiniela Nacional - Datos Históricos y Predicciones",
              description:
                "Base de datos de resultados históricos y predicciones estadísticas para la Quiniela Nacional (Ciudad y Provincia de Buenos Aires). Incluye 5 turnos diarios con 20 números cada uno.",
              url: BASE_URL,
              creator: {
                "@type": "Organization",
                name: "Quiniela IA",
              },
              keywords: [
                "quiniela",
                "nacional",
                "buenos aires",
                "predicciones",
                "estadisticas",
                "resultados",
              ],
              temporalCoverage: "2024/2025",
              spatialCoverage: {
                "@type": "Place",
                name: "Argentina, Ciudad de Buenos Aires y Provincia de Buenos Aires",
              },
              distribution: [
                {
                  "@type": "DataDownload",
                  encodingFormat: "text/html",
                  contentUrl: BASE_URL + "/resultados",
                },
                {
                  "@type": "DataDownload",
                  encodingFormat: "text/html",
                  contentUrl: BASE_URL + "/pronosticos",
                },
              ],
            }),
          }}
        />
      </head>
      <body><Providers>{children}</Providers></body>
    </html>
  );
}