import catalog from "../data/mitre-enterprise.json";
/** Canonical official Enterprise ATT&CK names; aliases must never redefine IDs. */
export const MITRE_NAMES: Record<string,string> = Object.fromEntries(Object.entries(catalog.techniques).filter(([,t]) => !t.revoked && !t.deprecated).map(([id,t]) => [id,t.name]));
