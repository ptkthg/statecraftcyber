import type { ElementType } from "react";

interface Props {
  icon: ElementType;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export function EmptyState({ icon: Icon, title, description, action }: Props) {
  return (
    <div className="text-center py-20 border border-white/[0.06] rounded-xl">
      <Icon size={32} className="text-[#333] mx-auto mb-3" aria-hidden />
      <p className="text-sm font-bold text-[#666] mb-1">{title}</p>
      {description && <p className="text-xs text-[#444] mb-4 max-w-xs mx-auto leading-relaxed">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
