import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
