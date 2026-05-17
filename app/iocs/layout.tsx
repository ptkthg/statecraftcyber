import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Busca de IOCs",
  description:
    "Pesquise indicadores de comprometimento (IPs, domínios, hashes, URLs) extraídos automaticamente dos briefings de threat intelligence.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
