import type { MetadataRoute } from "next";
import { env } from "@repo/config/next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = env.NEXT_PUBLIC_APP_URL;
  return [
    { url: `${base}/`, changeFrequency: "daily", priority: 1 },
    { url: `${base}/dashboard`, changeFrequency: "daily", priority: 0.8 },
    { url: `${base}/billing`, changeFrequency: "weekly", priority: 0.5 },
    { url: `${base}/settings`, changeFrequency: "weekly", priority: 0.4 },
  ];
}
