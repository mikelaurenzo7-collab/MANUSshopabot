import { cn } from "@/lib/utils";
import { AlertTriangle, RotateCcw, RefreshCw } from "lucide-react";
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

      if (this.props.inline) {
        return (
          <div className="flex flex-col items-center justify-center gap-3 p-6 rounded-xl border border-destructive/30 bg-destructive/5 text-center">
            <AlertTriangle className="h-7 w-7 text-destructive/70" />
            <div>
              <p className="text-sm font-semibold text-foreground">Something went wrong</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-xs">
                {this.state.error?.message ?? "An unexpected error occurred in this section."}
              </p>
            </div>
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs",
                "bg-secondary text-secondary-foreground hover:bg-secondary/80 cursor-pointer"
              )}
            >
              <RefreshCw size={12} />
              Try Again
            </button>
          </div>
        );
      }

      return (
        <div className="flex items-center justify-center min-h-screen p-8 bg-background">
          <div className="flex flex-col items-center w-full max-w-2xl p-8">
            <AlertTriangle
              size={48}
              className="text-destructive mb-6 flex-shrink-0"
            />

            <h2 className="text-xl mb-4">An unexpected error occurred.</h2>

            <div className="p-4 w-full rounded bg-muted overflow-auto mb-6">
              <pre className="text-sm text-muted-foreground whitespace-break-spaces">
                {this.state.error?.stack}
              </pre>
            </div>

            <button
              onClick={() => window.location.reload()}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg",
                "bg-primary text-primary-foreground",
                "hover:opacity-90 cursor-pointer"
              )}
            >
              <RotateCcw size={16} />
              Reload Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export { ErrorBoundary };
export default ErrorBoundary;
