import { MetadataRoute } from 'next';

/**
 * Sitemap — solo rutas existentes (commit D6).
 * Ninguna URL listada aquí puede devolver 404.
 */
const staticRoutes: MetadataRoute.Sitemap = [
  { url: 'https://quiniela-ia-two.vercel.app', lastModified: new Date(), changeFrequency: 'always', priority: 1.0 },
  { url: 'https://quiniela-ia-two.vercel.app/predictions', lastModified: new Date(), changeFrequency: 'hourly', priority: 0.9 },
  { url: 'https://quiniela-ia-two.vercel.app/rendimiento', lastModified: new Date(), changeFrequency: 'hourly', priority: 0.8 },
  { url: 'https://quiniela-ia-two.vercel.app/poceada', lastModified: new Date(), changeFrequency: 'hourly', priority: 0.8 },
  { url: 'https://quiniela-ia-two.vercel.app/poceada-federal', lastModified: new Date(), changeFrequency: 'weekly', priority: 0.7 },
  { url: 'https://quiniela-ia-two.vercel.app/brinco', lastModified: new Date(), changeFrequency: 'weekly', priority: 0.7 },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  return staticRoutes;
}
