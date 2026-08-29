import { MetadataRoute } from 'next';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = 'https://quiniela-ia-two.vercel.app';

  // Loterías y Turnos para generación programática de URLs (pSEO)
  const loterias = ['ciudad', 'provincia', 'santa-fe', 'cordoba'];
  const turnos = ['previa', 'primera', 'matutina', 'vespertina', 'nocturna'];

  // 1. Rutas estáticas principales
  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: 'always',
      priority: 1.0,
    },
    {
      url: `${baseUrl}/pronosticos`,
      lastModified: new Date(),
      changeFrequency: 'hourly',
      priority: 0.9,
    },
    {
      url: `${baseUrl}/resultados`,
      lastModified: new Date(),
      changeFrequency: 'hourly',
      priority: 0.8,
    },
    {
      url: `${baseUrl}/estadisticas`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.7,
    },
  ];

  // 2. Rutas dinámicas por Lotería y Turno (ej: /pronosticos/ciudad/nocturna)
  const dynamicTurnoRoutes: MetadataRoute.Sitemap = loterias.flatMap((loteria) =>
    turnos.map((turno) => ({
      url: `${baseUrl}/pronosticos/${loteria}/${turno}`,
      lastModified: new Date(),
      changeFrequency: 'hourly' as const,
      priority: 0.8,
    }))
  );

  return [...staticRoutes, ...dynamicTurnoRoutes];
}