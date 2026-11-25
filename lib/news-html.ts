import { Parser } from 'htmlparser2';

/** Accepts sanitized HTML and changes only text outside existing links. */
export function linkifyCves(html: string): string {
  let position = 0;
  let protectedDepth = 0;
  let output = '';
  const protectedTags = new Set(['a', 'script', 'style', 'code', 'pre']);
  const parser = new Parser({
    onopentag(name) { if (protectedTags.has(name)) protectedDepth++; },
    onclosetag(name) { if (protectedTags.has(name)) protectedDepth = Math.max(0, protectedDepth - 1); },
    ontext() {
      if (protectedDepth) return;
      const start = parser.startIndex;
      const end = parser.endIndex + 1;
      output += html.slice(position, start);
      output += html.slice(start, end).replace(/\b(CVE-\d{4}-\d{4,7})\b/gi, (cve) =>
        `<a href="https://nvd.nist.gov/vuln/detail/${cve.toUpperCase()}" target="_blank" rel="noopener noreferrer">${cve}</a>`);
      position = end;
    },
  }, { decodeEntities: false });
  parser.end(html);
  return output + html.slice(position);
}
