import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Threat Briefings",
  description:
    "Briefings operacionais com análise de APTs, ransomware, vulnerabilidades e IOCs em português, a partir de fontes documentadas.",
  alternates: { canonical: "/threat-briefings" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
