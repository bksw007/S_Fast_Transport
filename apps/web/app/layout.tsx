import type { Metadata, Viewport } from "next";
import "leaflet/dist/leaflet.css";
import "./styles.css";
import "./theme.css";
import "./admin-theme.css";
import "./public-theme.css";
import DatePickerBehavior from "./components/DatePickerBehavior";
import { siteFont } from "./site-font";

export const metadata: Metadata = {
  title: "S Fast Transport",
  description: "Real-time transport tracking and proof of delivery platform",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "S Fast"
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" }
    ],
    shortcut: "/icons/icon-192.png",
    apple: "/apple-touch-icon.png"
  }
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#20383b" },
    { media: "(prefers-color-scheme: dark)", color: "#172222" }
  ],
  width: "device-width",
  initialScale: 1
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <body className={siteFont.variable}><DatePickerBehavior />{children}</body>
    </html>
  );
}
