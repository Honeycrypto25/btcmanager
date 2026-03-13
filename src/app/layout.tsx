import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/components/providers/AuthProvider";
import { PwaProvider } from "@/components/pwa/PwaProvider";

export const metadata: Metadata = {
  title: "BTC Manager | Premium Portfolio Tracking",
  description: "Advanced Bitcoin DCA and Portfolio Management Dashboard",
  manifest: "/manifest.webmanifest",
  applicationName: "BTC Manager",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "BTC Manager",
  },
  formatDetection: {
    telephone: false,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[var(--background)] text-[var(--foreground)] antialiased">
        <AuthProvider>
          <PwaProvider />
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
