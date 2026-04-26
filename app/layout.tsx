import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Quiniela IA — Predicciones Inteligentes con IA",
  description: "Sistema de predicción estadística para la Quiniela Nacional de Buenos Aires. Análisis de números calientes, fríos y ciclos. Predicciones gratis.",
  keywords: "quiniela, predictor, lotería, números, argentina, buenos aires, quiniela nacional, prefiero",
  authors: [{ name: "Quiniela IA" }],
openGraph: {
    title: "Quiniela IA - Predicciones Inteligentes",
    description: "Gana con estadísticas reales. Análisis de números calientes, fríos y ciclos.",
    type: "website",
    locale: "es_AR",
    siteName: "Quiniela IA",
  },
  twitter: {
    card: "summary_large_image",
    title: "Quiniela IA - Predicciones Inteligentes",
    description: "Gana con estadísticas reales",
  },
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#ff3366",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="icon" type="image/png" href="/favicon.png" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap"
          rel="stylesheet"
        />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      </head>
      <body>{children}</body>
    </html>
  );
}