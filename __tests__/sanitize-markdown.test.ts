import { describe, it, expect } from "vitest";
import { renderSafeMarkdown } from "../lib/security/sanitize-markdown";

describe("renderSafeMarkdown — XSS prevention", () => {
  it("renders bold and italic markdown", () => {
    const out = renderSafeMarkdown("**bold** and _italic_");
    expect(out).toContain("<strong>bold</strong>");
    expect(out).toContain("<em>italic</em>");
  });

  it("strips <script> tags completely", () => {
    const out = renderSafeMarkdown('<script>alert("xss")</script>');
    expect(out).not.toContain("<script>");
    expect(out).not.toContain("alert(");
  });

  it("strips inline event handlers (onclick, onerror, onload)", () => {
    const out = renderSafeMarkdown('<a href="http://x.com" onclick="evil()">click</a>');
    expect(out).not.toContain("onclick");
  });

  it("strips onerror on img tags", () => {
    const out = renderSafeMarkdown('<img src="x" onerror="evil()">');
    expect(out).not.toContain("onerror");
  });

  it("strips style attributes", () => {
    const out = renderSafeMarkdown('<p style="color:red;background:url(evil)">text</p>');
    expect(out).not.toContain("style=");
  });

  it("strips <iframe> tags", () => {
    const out = renderSafeMarkdown('<iframe src="https://evil.com"></iframe>');
    expect(out).not.toContain("<iframe>");
  });

  it("strips <object> and <embed> tags", () => {
    const out = renderSafeMarkdown('<object data="evil.swf"></object><embed src="evil.swf">');
    expect(out).not.toContain("<object>");
    expect(out).not.toContain("<embed>");
  });

  it("forces target=_blank on all links", () => {
    const out = renderSafeMarkdown("[link](https://example.com)");
    expect(out).toContain('target="_blank"');
  });

  it("forces rel=noopener noreferrer nofollow on all links", () => {
    const out = renderSafeMarkdown("[link](https://example.com)");
    expect(out).toContain('rel="noopener noreferrer nofollow"');
  });

  it("overrides target on links that already have one", () => {
    const out = renderSafeMarkdown('<a href="https://x.com" target="_self">x</a>');
    expect(out).toContain('target="_blank"');
    expect(out).not.toContain('target="_self"');
  });

  it("preserves allowed tags: h1-h4, p, ul, ol, li, code, pre, blockquote", () => {
    const md = "# H1\n## H2\n- item\n\n`code`\n\n> quote";
    const out = renderSafeMarkdown(md);
    expect(out).toContain("<h1>");
    expect(out).toContain("<h2>");
    expect(out).toContain("<li>");
    expect(out).toContain("<code>");
    expect(out).toContain("<blockquote>");
  });

  it("strips data-* attributes", () => {
    const out = renderSafeMarkdown('<p data-secret="leak">text</p>');
    expect(out).not.toContain("data-secret");
  });
});
