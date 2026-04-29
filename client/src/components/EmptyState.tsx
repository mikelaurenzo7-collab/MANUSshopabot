/**
 * EmptyState.tsx — standardised empty-state layout.
 *
 * Item 13 of the cross-app polish proposal. Several pages still ship
 * plain "No data" / "No * available" text; this component gives them a
 * consistent illustration + headline + description + single primary
 * action shape. Built on the existing `.empty-state` CSS classes from
 * `index.css` so it slots in without new design tokens.
 */
import { ReactNode } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowRight, Sparkles } from "lucide-react";

interface EmptyStateProps {
  icon?: ReactNode;
  /** Short headline — what's missing or what to do next. */
  title: string;
  /** Optional supporting copy. */
  description?: string;
  /** Optional primary call-to-action. Provide `href` OR `onClick`. */
  action?: {
    label: string;
    href?: string;
    onClick?: () => void;
  };
  /** Optional className on the outer wrapper for one-off spacing tweaks. */
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div className={`empty-state ${className ?? ""}`.trim()}>
      <div className="empty-state-icon" aria-hidden="true">
        {icon ?? <Sparkles className="w-5 h-5 text-white/40" />}
      </div>
      <h3 className="empty-state-text">{title}</h3>
      {description && (
        <p className="empty-state-description">
          {description}
        </p>
      )}
      {action &&
        (action.href ? (
          <Link
            href={action.href}
            className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-sky-500/15 border border-sky-500/30 text-xs font-semibold text-sky-200 hover:bg-sky-500/25 hover:border-sky-400/40 transition-standard hover:shadow-premium-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/50"
          >
            {action.label}
            <ArrowRight className="w-3 h-3" aria-hidden="true" />
          </Link>
        ) : (
          <Button
            type="button"
            size="sm"
            className="mt-4 gap-1.5"
            onClick={action.onClick}
          >
            {action.label}
            <ArrowRight className="w-3 h-3" aria-hidden="true" />
          </Button>
        ))}
    </div>
  );
}
