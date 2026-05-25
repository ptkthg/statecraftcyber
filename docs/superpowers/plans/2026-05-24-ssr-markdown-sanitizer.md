# SSR Markdown Sanitizer Compatibility Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore SSR detail pages in production by replacing the `jsdom`-dependent Markdown sanitization path with a server-compatible allowlist sanitizer.

**Architecture:** Keep `renderSafeMarkdown(content)` as the single public sanitization boundary used by briefing and news detail views. Convert Markdown with `marked`, then sanitize using `sanitize-html` configured to preserve the existing output contract and link hardening.

**Tech Stack:** Next.js 16 App Router, TypeScript, Vitest, `marked`, `sanitize-html`, Vercel.

---

### Task 1: Lock Down Unsafe Link Behavior

**Files:**
- Modify: `__tests__/sanitize-markdown.test.ts`

- [ ] **Step 1: Write the failing regression test**

Add the following test to the existing `renderSafeMarkdown` suite:

```ts
it("strips javascript link destinations", () => {
  const out = renderSafeMarkdown("[link](javascript:alert('xss'))");
  expect(out).not.toContain("javascript:");
  expect(out).not.toContain('href="');
});
```

- [ ] **Step 2: Run the targeted test file to verify RED**

Run:

```bash
npm test -- __tests__/sanitize-markdown.test.ts
```

Expected: the new test fails if the current sanitizer preserves a scriptable link target; if existing DOMPurify already handles this assertion, keep it as security coverage and use the production dependency failure reproduced by the Vercel log as the failing regression condition.

### Task 2: Replace the SSR-Incompatible Sanitizer

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `lib/security/sanitize-markdown.ts`

- [ ] **Step 1: Replace dependencies**

Run:

```bash
npm uninstall isomorphic-dompurify
npm install sanitize-html @types/sanitize-html
```

- [ ] **Step 2: Implement the allowlist sanitizer**

Update `lib/security/sanitize-markdown.ts` to import `sanitizeHtml` and sanitize the `marked` output with:

```ts
const ALLOWED_TAGS = [
  "h1", "h2", "h3", "h4", "p", "ul", "ol", "li",
  "strong", "em", "code", "pre", "blockquote",
  "a", "br", "hr", "table", "thead", "tbody", "tr", "th", "td",
];

const clean = sanitizeHtml(raw, {
  allowedTags: ALLOWED_TAGS,
  allowedAttributes: { a: ["href"] },
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
```

Allow `target` and `rel` in the configured attributes for transformed anchors so the hardened attributes survive sanitization.

- [ ] **Step 3: Run sanitizer tests to verify GREEN**

Run:

```bash
npm test -- __tests__/sanitize-markdown.test.ts
```

Expected: all sanitizer tests pass.

### Task 3: Validate and Release

**Files:**
- No additional source files

- [ ] **Step 1: Run the full local verification**

Run:

```bash
npm test
npm run build
```

Expected: both commands exit with code 0.

- [ ] **Step 2: Deploy production**

Run:

```bash
vercel --prod
```

Expected: `statecraftcyber.vercel.app` is aliased to the successful deployment.

- [ ] **Step 3: Validate the original production symptom**

Request:

```text
https://statecraftcyber.vercel.app/threat-briefings/cve-2020-3950-exploracao-ativa-em-vmware-multiple-products-privilege-escalation-vulnerability
```

Expected: HTTP 200, not the `jsdom` module loading error.

Also request an existing `/noticias/<slug>` URL previously present in Vercel 500 logs.

Expected: HTTP 200, demonstrating the shared sanitization path is fixed.

