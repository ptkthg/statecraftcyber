import type { Metadata } from "next";
import { Bodoni_Moda, IBM_Plex_Mono, IBM_Plex_Sans, Source_Serif_4 } from "next/font/google";
import "./globals.css";
import "./editorial.css";
import "./editorial-overrides.css";
import "./article.css";
import "./editorial-final.css";
import "./editorial-extensions.css";
import "./news-editorial.css";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { SearchOverlay } from "@/components/search/SearchOverlay";

const bodoni = Bodoni_Moda({ variable: "--font-bodoni", subsets: ["latin"], display: "swap" });
const plex = IBM_Plex_Sans({ variable: "--font-plex", subsets: ["latin"], display: "swap" });
const mono = IBM_Plex_Mono({ variable: "--font-plex-mono", subsets: ["latin"], weight: ["400", "500", "600"], display: "swap" });
const source = Source_Serif_4({ variable: "--font-source", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: { default: "Statecraft Cyber Intelligence", template: "%s | Statecraft Cyber Intelligence" },
  description: "Publicação independente de inteligência de ameaças, cibersegurança e análise de risco com contexto para o Brasil e a América Latina.",
  openGraph: { type: "website", locale: "pt_BR", siteName: "Statecraft Cyber Intelligence" },
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR" className={`${bodoni.variable} ${plex.variable} ${mono.variable} ${source.variable}`}><body><a href="#main-content" className="skip-link">Pular para conteúdo</a><Header /><div id="main-content">{children}</div><Footer /><SearchOverlay /></body></html>;
}
