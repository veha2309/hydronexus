import type { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.HYDRONEXUS_PUBLIC_URL;
  if (!base) return [];
  return [{ url: new URL('/', base).toString(), changeFrequency: 'daily' }];
}
