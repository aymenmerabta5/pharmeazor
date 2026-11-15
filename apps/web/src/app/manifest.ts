import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "pharmeazor",
    short_name: "pharmeazor",
    description: "Verified answers for your pharmacy",
    start_url: "/",
    display: "standalone",
    background_color: "#f7f5f0",
    theme_color: "#1f4d42",
    icons: [
      { src: "/favicon.ico", sizes: "any", type: "image/x-icon" },
      { src: "/icon.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
