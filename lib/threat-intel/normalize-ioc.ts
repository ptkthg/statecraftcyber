export function normalizeIoc(type: string, value: string): string {
  const v = value.trim().toLowerCase();
  switch (type) {
    case "ip":
      return v;
    case "domain":
      return v.replace(/^www\./, "");
    case "url":
      try {
        return new URL(v).hostname;
      } catch {
        return v;
      }
    case "hash":
      return v.replace(/\s/g, "");
    case "email":
      return v;
    default:
      return v;
  }
}
