import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin", "/api/", "/eliminar-cuenta"],
      },
    ],
    sitemap: "https://quiniela-ia-two.vercel.app/sitemap.xml",
  };
}
