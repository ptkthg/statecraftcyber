/** Accept whole sentences/paragraphs only. Substring matches can remove negations or qualifications. */
export function isVerbatimPassage(source: string, passage: string): boolean {
  const quote = passage.trim();
  if (!quote) return false;
  let from = 0;
  while (from <= source.length) {
    const at = source.indexOf(quote, from);
    if (at < 0) return false;
    const before = source.slice(0, at);
    const after = source.slice(at + quote.length);
    const startsPassage = at === 0 || /\n[ \t]*$/.test(before) || /[.!?][ \t]+$/.test(before);
    const endsPassage = after.length === 0 || /^[ \t]*\n/.test(after) || (/[.!?]$/.test(quote) && /^\s/.test(after));
    if (startsPassage && endsPassage) return true;
    from = at + 1;
  }
  return false;
}