# SSR Markdown Sanitizer Compatibility Fix

## Problem

Rendered briefing and news detail pages return HTTP 500 in production. Vercel runtime logs show that `isomorphic-dompurify` loads `jsdom`, whose CommonJS dependency chain attempts to `require()` the ESM module `@exodus/bytes/encoding-lite.js`.

The failure occurs during server module loading, before content-specific rendering. It affects both existing and newly generated records because both page types import `lib/security/sanitize-markdown.ts`.

## Chosen Approach

Replace `isomorphic-dompurify` with `sanitize-html` inside `renderSafeMarkdown`. `sanitize-html` is server-native and supports an explicit allowlist without requiring a browser DOM or `jsdom`.

The output contract remains unchanged:

- Markdown is converted to HTML with `marked`.
- Only the existing safe tags are retained.
- Only safe link `href` attributes are retained.
- Every rendered link receives `target="_blank"` and `rel="noopener noreferrer nofollow"`.
- Scriptable HTML, event handlers, styles, data attributes, and unsafe URL schemes are removed.

## Scope

Modified production surface:

- `lib/security/sanitize-markdown.ts`
- `package.json`
- `package-lock.json`

Modified test surface:

- `__tests__/sanitize-markdown.test.ts`

No database, cron, content-generation, or layout behavior changes are included.

## Validation

1. Add a regression assertion that `javascript:` links do not survive sanitization.
2. Replace the sanitization dependency and keep all XSS tests passing.
3. Run the full test suite and production build.
4. Deploy to Vercel production.
5. Request a briefing detail URL and a news detail URL that currently return 500; both must return a normal HTML response after deployment.

