import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import NoPageZoom from "@/components/NoPageZoom";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Nestmap — homes on a map", template: "%s · Nestmap" },
  description: "Find homes on a map. Buy, rent, no noise.",
  manifest: "/manifest.json",
  icons: { icon: "/icons/favicon.png", apple: "/icons/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "Nestmap" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,       // the page itself never zooms; the map zooms on its own
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#ffffff",
};

// sets the saved light / dark choice before the first paint so the page never flashes
const themeScript = "try{var t=localStorage.getItem('theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}";

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeScript }} /></head>
      <body><NoPageZoom />{children}</body>
    </html>
  );
}
