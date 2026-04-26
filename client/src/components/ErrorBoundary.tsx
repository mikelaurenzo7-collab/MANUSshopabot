import { cn } from "@/lib/utils";
import { AlertTriangle, RotateCcw, RefreshCw, Bot } from "lucide-react";
import { Component, ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** Inline mode: renders a compact error card instead of full-page overlay */
  inline?: boolean;
  /** Label shown in console logs for easier debugging */
  label?: string;
  /** Custom fallback UI */
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error(`[ErrorBoundary:${this.props.label ?? "unknown"}]`, error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      // ── Inline compact error card ──────────────────────────────────────
      if (this.props.inline) {
        return (
          <div className="flex flex-col items-center justify-center gap-3 p-6 rounded-xl border border-red-500/20 bg-red-500/5 text-center">
            <div className="h-10 w-10 rounded-xl bg-red-500/10 flex items-center justify-center">
              <AlertTriangle className="h-5 w-5 text-red-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Something went wrong</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-xs">
                {this.state.error?.message ?? "An unexpected error occurred in this section."}
              </p>
            </div>
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium",
                "bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20 cursor-pointer transition-colors"
              )}
            >
              <RefreshCw size={12} />
              Try Again
            </button>
          </div>
        );
      }

      // ── Full-page error screen ─────────────────────────────────────────
      return (
        <div className="flex items-center justify-center min-h-screen p-8 bg-background relative overflow-hidden">
          {/* Background ambient glow */}
          <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 h-96 w-96 rounded-full bg-red-500/5 blur-3xl pointer-events-none" />

          <div className="relative flex flex-col items-center w-full max-w-md text-center">
            {/* Bot illustration with error state */}
            <div className="relative mb-6">
              <div className="h-20 w-20 rounded-2xl bg-gradient-to-br from-red-500/20 to-orange-500/10 border border-red-500/20 flex items-center justify-center mx-auto">
                <Bot className="h-10 w-10 text-red-400" />
              </div>
              <div className="absolute -top-1 -right-1 h-6 w-6 rounded-full bg-red-500 flex items-center justify-center shadow-lg shadow-red-500/30">
                <AlertTriangle className="h-3 w-3 text-white" />
              </div>
            </div>

            {/* Headline */}
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-500/10 border border-red-500/20 mb-4">
              <span className="text-[10px] font-semibold text-red-400 uppercase tracking-wider">Bot Error</span>
            </div>

            <h2 className="text-xl font-bold text-foreground mb-2">Bot circuit misfired</h2>
            <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
              One of my processors glitched while rendering this module. Your data is 100% safe — this is purely a UI hiccup. Running self-diagnostics now.
            </p>

            {/* Error details (collapsible) */}
            {this.state.error?.message && (
              <div className="w-full p-3 rounded-xl bg-red-500/5 border border-red-500/15 mb-6 text-left">
                <p className="text-[11px] font-mono text-red-400/80 break-all">
                  {this.state.error.message}
                </p>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3 w-full">
              <button
                onClick={() => this.setState({ hasError: false, error: null })}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium",
                  "bg-white/[0.05] text-foreground border border-white/[0.08] hover:bg-white/[0.08] cursor-pointer transition-colors"
                )}
              >
                <RefreshCw size={14} />
                Try Again
              </button>
              <button
                onClick={() => window.location.reload()}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold",
                  "bg-gradient-to-r from-sky-500 to-blue-600 text-white hover:from-sky-400 hover:to-blue-500 cursor-pointer transition-all shadow-lg shadow-sky-500/20"
                )}
              >
                <RotateCcw size={14} />
                Reload Page
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export { ErrorBoundary };
export default ErrorBoundary;
