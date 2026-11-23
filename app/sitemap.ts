import { MetadataRoute } from 'next';

/**
 * Sitemap — solo rutas existentes (commit D6).
 * Ninguna URL listada aquí puede devolver 404.
 */
const staticRoutes: MetadataRoute.Sitemap = [
  { url: 'https://quiniela-ia.httpsquiniela-ia-twovercelapp.workers.dev', lastModified: new Date(), changeFrequency: 'always', priority: 1.0 },
  { url: 'https://quiniela-ia.httpsquiniela-ia-twovercelapp.workers.dev/predictions', lastModified: new Date(), changeFrequency: 'hourly', priority: 0.9 },
  { url: 'https://quiniela-ia.httpsquiniela-ia-twovercelapp.workers.dev/rendimiento', lastModified: new Date(), changeFrequency: 'hourly', priority: 0.8 },
  { url: 'https://quiniela-ia.httpsquiniela-ia-twovercelapp.workers.dev/poceada', lastModified: new Date(), changeFrequency: 'hourly', priority: 0.8 },
  { url: 'https://quiniela-ia.httpsquiniela-ia-twovercelapp.workers.dev/poceada-federal', lastModified: new Date(), changeFrequency: 'weekly', priority: 0.7 },
  { url: 'https://quiniela-ia.httpsquiniela-ia-twovercelapp.workers.dev/brinco', lastModified: new Date(), changeFrequency: 'weekly', priority: 0.7 },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  return staticRoutes;
}

