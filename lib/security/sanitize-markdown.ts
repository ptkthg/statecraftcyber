import { marked } from "marked";
import DOMPurify from "isomorphic-dompurify";

marked.setOptions({ breaks: true, gfm: true });

export function renderSafeMarkdown(content: string): string {
  const raw = marked.parse(content) as string;
  const clean = DOMPurify.sanitize(raw, {
    ALLOWED_TAGS: [
      "h1", "h2", "h3", "h4",
      "p", "ul", "ol", "li",
      "strong", "em", "code", "pre", "blockquote",
      "a", "br", "hr",
      "table", "thead", "tbody", "tr", "th", "td",
    ],
    ALLOWED_ATTR: ["href"],
    ALLOW_DATA_ATTR: false,
    FORCE_BODY: false,
    FORBID_TAGS: ["script", "iframe", "object", "embed", "form", "input", "style"],
    FORBID_ATTR: ["onerror", "onload", "onclick", "onmouseover", "style", "target", "rel", "class"],
  });

  // Force safe attributes on every link — overrides anything the source may have set
  return clean.replace(/<a(\s[^>]*)>/gi, (_, attrs) => {
    const stripped = attrs.replace(/\s(?:target|rel)="[^"]*"/gi, "");
    return `<a${stripped} target="_blank" rel="noopener noreferrer nofollow">`;
  });
}
