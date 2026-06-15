import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Quiniela IA — Análisis Estadístico Avanzado con IA",
  description: "Herramienta de análisis estadístico para la Quiniela Nacional de Buenos Aires. Motor de 30 factores, Monte Carlo, Machine Learning. Solo entretenimiento y análisis de datos.",
  keywords: "análisis estadístico, quiniela nacional, números, argentina, buenos aires, machine learning, datos, tendencias",
  authors: [{ name: "Quiniela IA" }],
openGraph: {
    title: "Quiniela IA - Análisis Estadístico con IA",
    description: "Herramienta de análisis estadístico basada en 30 factores y Machine Learning.",
    type: "website",
    locale: "es_AR",
    siteName: "Quiniela IA",
  },
  twitter: {
    card: "summary_large_image",
    title: "Quiniela IA - Análisis Estadístico con IA",
    description: "Análisis estadístico basado en datos reales y Machine Learning",
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
        <meta name="google-site-verification" content="hsfnbzfUMXiB4O5cws0PAELXfPGudmtCmS9hNkbtTIk" />
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