import { MetadataRoute } from 'next';
import { getAppBaseUrl } from "@/lib/app-url";

/**
 * Sitemap — solo rutas existentes (commit D6).
 * Ninguna URL listada aquí puede devolver 404.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = getAppBaseUrl()
  const lastModified = new Date()
  return [
    { url: baseUrl, lastModified, changeFrequency: 'always', priority: 1.0 },
    { url: `${baseUrl}/predictions`, lastModified, changeFrequency: 'hourly', priority: 0.9 },
    { url: `${baseUrl}/rendimiento`, lastModified, changeFrequency: 'hourly', priority: 0.8 },
  ]
}

