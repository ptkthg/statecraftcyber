import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Notícias",
  description:
    "Notícias de cibersegurança agregadas de 19 fontes globais — CISA, Krebs, The Hacker News, CERT.br, SANS ISC e outras — em PT-BR.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
