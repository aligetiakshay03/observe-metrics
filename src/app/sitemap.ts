import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = (process.env.APP_URL ?? "http://localhost:3100").replace(/\/+$/, "");
  const now = new Date();
  const pages: [string, number][] = [
    ["/", 1],
    ["/docs", 0.8],
    ["/docs/quickstart", 0.8],
    ["/docs/providers", 0.7],
    ["/docs/sdk", 0.7],
    ["/docs/security", 0.7],
    ["/signup", 0.5],
    ["/signin", 0.3],
  ];
  return pages.map(([p, priority]) => ({ url: `${base}${p}`, lastModified: now, changeFrequency: "weekly", priority }));
}
