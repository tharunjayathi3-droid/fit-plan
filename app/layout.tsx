import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FitPlan — Your fitness plan, built around you",
  description: "A thoughtful home for your training, nutrition, and progress.",
  applicationName: "FitPlan",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "FitPlan", statusBarStyle: "default" },
  icons: { icon: "/fitplan-icon.svg", apple: "/apple-touch-icon.png" },
};

export const viewport: Viewport = { themeColor: "#70865b", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
