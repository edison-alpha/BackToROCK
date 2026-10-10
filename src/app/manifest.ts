import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "BackToRock",
    short_name: "BackToRock",
    description: "Pemutar tablature Guitar Pro untuk latihan gitar, bass, piano, dan drum.",
    lang: "id",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#141414",
    theme_color: "#141414",
    categories: ["music", "education"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
