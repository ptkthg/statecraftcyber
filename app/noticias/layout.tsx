import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Notícias",
  description:
    "Notícias de cibersegurança agregadas de 20 fontes internacionais e brasileiras — CISA, Google Threat Intelligence, CERT.br, WeLiveSecurity Brasil e outras — em PT-BR.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
