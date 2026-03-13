import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "BTC Manager",
    short_name: "BTC Manager",
    description: "Premium Bitcoin portfolio tracking and cycle intelligence dashboard.",
    start_url: "/",
    display: "standalone",
    background_color: "#12100d",
    theme_color: "#12100d",
    orientation: "portrait",
    lang: "en",
    icons: [
      {
        src: "/icon?size=192",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icon?size=512",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/apple-icon",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  };
}
