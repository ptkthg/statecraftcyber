import { writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const repo = "mitre-attack/attack-stix-data";
const response = await fetch("https://api.github.com/repos/" + repo + "/commits/master");
if (!response.ok) throw new Error("Cannot resolve official MITRE revision: " + response.status);
const { sha } = await response.json();
const url = "https://raw.githubusercontent.com/" + repo + "/" + sha + "/enterprise-attack/enterprise-attack.json";
const download = await fetch(url);
if (!download.ok) throw new Error("MITRE download failed: " + download.status);
const raw = await download.text();
const bundle = JSON.parse(raw);
const techniques = {};
for (const o of bundle.objects) {
  if (o.type !== "attack-pattern") continue;
  const ref = o.external_references?.find(r => r.source_name === "mitre-attack");
  if (!ref?.external_id) continue;
  techniques[ref.external_id] = { name: o.name, url: ref.url, revoked: o.revoked === true, deprecated: o.x_mitre_deprecated === true, version: o.x_mitre_version, modified: o.modified };
}
if (Object.keys(techniques).length < 500) throw new Error("Incomplete MITRE bundle");
const output = { domain: "enterprise-attack", commit: sha, url, sha256: createHash("sha256").update(raw).digest("hex"), retrievedAt: new Date().toISOString(), techniques };
await writeFile("data/mitre-enterprise.json", JSON.stringify(output, null, 2) + "\n");
console.log(JSON.stringify({ commit: sha, count: Object.keys(techniques).length, sha256: output.sha256 }));