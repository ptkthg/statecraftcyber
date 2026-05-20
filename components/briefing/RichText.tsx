import { renderSafeMarkdown } from "@/lib/security/sanitize-markdown";

interface Props {
  text: string;
  className?: string;
}

export function RichText({ text, className = "" }: Props) {
  return (
    <div
      className={`briefing-prose ${className}`}
      dangerouslySetInnerHTML={{ __html: renderSafeMarkdown(text) }}
    />
  );
}
