import type { Metadata, Viewport } from "next";
import { Figtree, Geist_Mono } from "next/font/google";
import { Providers } from "@/components/Providers";
import { PwaRegister } from "@/components/PwaRegister";
import { Splash } from "@/components/Splash";
import "./globals.css";

// Figtree: rounded geometric forms match the rounded UI, and its tabular figures keep fret numbers legible.
const figtree = Figtree({ variable: "--font-figtree", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "BackToRock",
  description: "Pemutar tablature Guitar Pro untuk latihan gitar, bass, piano, dan drum.",
  applicationName: "BackToRock",
  appleWebApp: { capable: true, title: "BackToRock", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#141414",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" className={`${figtree.variable} ${geistMono.variable} dark h-full`}>
      <body>
        <Providers>{children}</Providers>
        <Splash />
        <PwaRegister />
      </body>
    </html>
  );
}
