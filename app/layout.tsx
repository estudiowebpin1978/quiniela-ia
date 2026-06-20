import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://quiniela-ia-two.vercel.app"),
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
    images: [{ url: "/icon-512.png", width: 512, height: 512, alt: "Quiniela IA" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Quiniela IA - Análisis Estadístico con IA",
    description: "Análisis estadístico basado en datos reales y Machine Learning",
    images: ["/icon-512.png"],
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
        <meta name="robots" content="index, follow" />
        <meta property="og:url" content="https://quiniela-ia-two.vercel.app" />
        <meta name="theme-color" content="#ff3366" />
        {/* Meta Pixel */}
        <script dangerouslySetInnerHTML={{ __html: `
          !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
          n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
          n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
          t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
          document,'script','https://connect.facebook.net/en_US/fbevents.js');
          fbq('init', 'YOUR_PIXEL_ID');fbq('track', 'PageView');
        ` }} />
        {/* TikTok Pixel */}
        <script dangerouslySetInnerHTML={{ __html: `
          !function(w,d,t){w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page",
          "track","identify","instances","debug","on","off","once","ready","alias","group",
          "enableCookie","disableCookie","holdConsent","revokeConsent","grantConsent"];
          ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};
          for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);
          ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e};
          ttq.load=function(e,n){var r="https://analytics.tiktok.com/i18n/pixel/events.js";
          ttq._i=ttq._i||{};ttq._i[e]=[];ttq._i[e]._u=r;ttq._t=ttq._t||{};ttq._t[e]=+new Date;
          ttq._o=ttq._o||{};ttq._o[e]=n||{};
          var o=document.createElement("script");o.type="text/javascript";o.async=!0;o.src=r+"?sdkid="+e+"&lib="+t;
          var a=document.getElementsByTagName("script")[0];a.parentNode.insertBefore(o,a)};
          ttq.load('YOUR_TIKTOK_PIXEL_ID');ttq.page();
        ` }} />
      </head>
      <body>{children}</body>
    </html>
  );
}