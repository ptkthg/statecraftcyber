import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Threat Briefings",
  description:
    "Briefings operacionais de threat intelligence gerados por IA a cada hora. Análise de APTs, ransomware, vulnerabilidades e IOCs em PT-BR.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
