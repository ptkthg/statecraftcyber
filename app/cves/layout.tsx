import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "CVEs",
  description:
    "Vulnerabilidades recentes com CVSS, EPSS e indicador CISA KEV. Monitore CVEs críticos das últimas 72h classificados por tipo de impacto.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
