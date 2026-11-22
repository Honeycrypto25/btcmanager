import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep visited pages in the browser for 5 minutes: going back and forth between pages reuses them instead
  // of asking the server again (Vercel Active CPU). Refresh buttons and every save still load fresh data.
  experimental: {
    staleTimes: { dynamic: 300 },
  },
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
