import type { Metadata } from "next";
import { Geist, Geist_Mono, Sora, Lora } from "next/font/google";
import "./globals.css";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { SearchOverlay } from "@/components/search/SearchOverlay";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const sora = Sora({
  variable: "--font-sora",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  display: "swap",
});

const lora = Lora({
  variable: "--font-lora",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Statecraft Cyber",
    template: "%s | Statecraft Cyber",
  },
  description:
    "Plataforma de threat intelligence em PT-BR. CVEs, briefings operacionais, IOCs e notícias de segurança de fontes abertas e feeds especializados.",
  openGraph: {
    type: "website",
    locale: "pt_BR",
    siteName: "Statecraft Cyber",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${geistMono.variable} ${sora.variable} ${lora.variable} h-full antialiased`}
    >
      <body className="min-h-screen flex flex-col bg-canvas text-ink">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[100] focus:bg-brand focus:text-white focus:px-4 focus:py-2 focus:rounded-lg text-sm font-semibold"
        >
          Pular para conteúdo
        </a>
        <Header />
        <div id="main-content" className="flex-1 flex flex-col">{children}</div>
        <Footer />
        <SearchOverlay />
      </body>
    </html>
  );
}
