import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import ButtonFeedback from "@/components/ButtonFeedback";
import NoPageZoom from "@/components/NoPageZoom";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Nexovo — homes on a map", template: "%s · Nexovo" },
  description: "Find homes on a map. Buy, rent, no noise.",
  manifest: "/manifest.json",
  icons: { icon: "/icons/favicon.png", apple: "/icons/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "Nexovo" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,       // the page itself never zooms; the map zooms on its own
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#ffffff",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" data-theme="light" className={inter.variable} suppressHydrationWarning>
      <body><NoPageZoom /><ButtonFeedback />{children}</body>
    </html>
  );
}
