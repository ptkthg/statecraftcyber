import type { ReactNode, AnchorHTMLAttributes } from "react";
import { ExternalLink as ExternalLinkIcon } from "lucide-react";

interface Props extends AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string;
  children: ReactNode;
  showIcon?: boolean;
}

export function ExternalLink({ href, children, showIcon = true, className = "", ...rest }: Props) {
  const isSafe = href.startsWith("https://") || href.startsWith("http://") || href.startsWith("/");
  if (!isSafe) return <span className={className}>{children}</span>;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className={`inline-flex items-center gap-1 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand rounded ${className}`}
      {...rest}
    >
      {children}
      {showIcon && <ExternalLinkIcon size={11} className="flex-shrink-0 opacity-60" aria-hidden />}
    </a>
  );
}
