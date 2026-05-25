import { marked } from "marked";
import sanitizeHtml from "sanitize-html";

marked.setOptions({ breaks: true, gfm: true });

const ALLOWED_TAGS = [
  "h1", "h2", "h3", "h4",
  "p", "ul", "ol", "li",
  "strong", "em", "code", "pre", "blockquote",
  "a", "br", "hr",
  "table", "thead", "tbody", "tr", "th", "td",
];

export function renderSafeMarkdown(content: string): string {
  const raw = marked.parse(content) as string;

  return sanitizeHtml(raw, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {
      a: ["href", "target", "rel"],
    },
    allowedSchemes: ["http", "https", "mailto"],
    transformTags: {
      a: (_tagName, attribs) => ({
        tagName: "a",
        attribs: {
          ...(attribs.href ? { href: attribs.href } : {}),
          target: "_blank",
          rel: "noopener noreferrer nofollow",
        },
      }),
    },
  });
}
