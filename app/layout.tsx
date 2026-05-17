import type { Metadata } from "next";
import { Geist, Geist_Mono, Playfair_Display, Lora } from "next/font/google";
import "./globals.css";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
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
    "Plataforma de threat intelligence em PT-BR. CVEs, briefings operacionais, IOCs e notícias de segurança atualizados em tempo real.",
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
      className={`${geistSans.variable} ${geistMono.variable} ${playfair.variable} ${lora.variable} h-full antialiased`}
    >
      <body className="min-h-screen flex flex-col" style={{ backgroundColor: "#050505", color: "#F5F5F5" }}>
        <Header />
        <div className="flex-1 flex flex-col">{children}</div>
        <Footer />
      </body>
    </html>
  );
}
