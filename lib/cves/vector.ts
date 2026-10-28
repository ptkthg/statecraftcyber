export function vectorConditions(vector: string | null | undefined) {
  if (!vector) return [];
  const names: Record<string, string> = {
    AV: "Vetor de ataque",
    AC: "Complexidade",
    AT: "Requisitos de ataque",
    PR: "Privilégios necessários",
    UI: "Interação do usuário",
    Au: "Autenticação",
    S: "Escopo",
    C: "Confidencialidade",
    I: "Integridade",
    A: "Disponibilidade",
    VC: "Confidencialidade no sistema vulnerável",
    VI: "Integridade no sistema vulnerável",
    VA: "Disponibilidade no sistema vulnerável",
    SC: "Confidencialidade subsequente",
    SI: "Integridade subsequente",
    SA: "Disponibilidade subsequente",
  };
  const common: Record<string, Record<string, string>> = {
    AV: { N: "Rede", A: "Rede adjacente", L: "Local", P: "Físico" },
    AC: { L: "Baixa", H: "Alta", M: "Média" },
    AT: { N: "Nenhum", P: "Presentes" },
    PR: { N: "Nenhum", L: "Baixos", H: "Altos" },
    Au: { N: "Nenhuma", S: "Única", M: "Múltipla" },
    S: { U: "Inalterado", C: "Alterado" },
  };
  return vector
    .replace(/^CVSS:[^/]+\//, "")
    .split("/")
    .flatMap((part) => {
      const [key, value] = part.split(":");
      if (!names[key] || !value) return [];
      let label = common[key]?.[value];
      if (key === "UI")
        label = (
          { N: "Nenhuma", R: "Necessária", P: "Passiva", A: "Ativa" } as Record<
            string,
            string
          >
        )[value];
      if (["C", "I", "A", "VC", "VI", "VA", "SC", "SI", "SA"].includes(key))
        label = (
          {
            N: "Nenhum",
            L: "Baixo",
            H: "Alto",
            P: "Parcial",
            C: "Completo",
          } as Record<string, string>
        )[value];
      return [{ key, label: names[key], value: label ?? value }];
    });
}
