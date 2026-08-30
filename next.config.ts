import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdfjs-dist ships a separate worker file (pdf.worker.mjs) that it
  // locates via a path relative to its own module at runtime. Leaving it
  // external (unbundled) keeps its real node_modules file layout intact
  // in the deployed function, so that relative lookup keeps working --
  // bundling it into a single Turbopack/webpack chunk breaks it (see
  // src/lib/vanguard/transactions-pdf.ts for the accompanying workerSrc
  // fallback fix).
  serverExternalPackages: ["pdfjs-dist"],
  async redirects() {
    // Aceste pagini au fost mutate sub /btc/* — redirect pentru orice
    // bookmark sau link vechi salvat la calea originală.
    return [
      { source: "/wallets", destination: "/btc/wallets", permanent: true },
      { source: "/history", destination: "/btc/history", permanent: true },
      { source: "/roi", destination: "/btc/roi", permanent: true },
      { source: "/analytics", destination: "/btc/analytics", permanent: true },
      { source: "/cycle", destination: "/btc/cycle", permanent: true },
    ];
  },
};

export default nextConfig;
