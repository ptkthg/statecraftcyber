import type { Metadata } from "next";
import { Geist, Geist_Mono, JetBrains_Mono, Playfair_Display, Lora } from "next/font/google";
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

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  display: "swap",
});

const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
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
      className={`${geistSans.variable} ${geistMono.variable} ${jetbrainsMono.variable} ${playfair.variable} ${lora.variable} h-full antialiased`}
    >
      <body className="min-h-screen flex flex-col" style={{ backgroundColor: "#050505", color: "#F5F5F5" }}>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[100] focus:bg-red-600 focus:text-white focus:px-4 focus:py-2 focus:rounded-lg text-sm font-semibold"
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
