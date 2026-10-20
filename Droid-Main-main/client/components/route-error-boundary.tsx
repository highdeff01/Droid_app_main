import type { ErrorInfo, ReactNode } from "react";
import { Component } from "react";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";

interface RouteErrorBoundaryProps {
  children: ReactNode;
}

interface RouteErrorBoundaryState {
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class RouteErrorBoundary extends Component<
  RouteErrorBoundaryProps,
  RouteErrorBoundaryState
> {
  state: RouteErrorBoundaryState = { error: null, errorInfo: null };

  static getDerivedStateFromError(error: Error): Partial<RouteErrorBoundaryState> {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Route Error Boundary caught an error:", error, errorInfo);
    this.setState({ errorInfo });
  }

  handleReset = () => {
    this.setState({ error: null, errorInfo: null });
    try {
      window.location.href = "/dashboard";
    } catch {
      window.location.reload();
    }
  };

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-slate-950 px-6 text-center text-slate-100">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400 shadow-2xl">
            <AlertTriangle className="h-8 w-8 animate-pulse" />
          </div>

          <div className="max-w-md space-y-2">
            <h1 className="text-xl font-bold tracking-tight text-white">
              AI Studio Workspace Recovered
            </h1>
            <p className="text-sm text-slate-400">
              An unexpected render issue occurred. You can restore the session or return to the main dashboard.
            </p>
            {this.state.error.message && (
              <div className="mt-3 p-3 rounded-lg bg-slate-900 border border-slate-800 text-left font-mono text-xs text-rose-300 max-h-32 overflow-auto">
                {this.state.error.message}
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              className="flex items-center gap-2 rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white shadow-lg hover:bg-cyan-500 transition-colors"
              onClick={this.handleReset}
            >
              <RefreshCw className="w-4 h-4" />
              Reset & Reload Dashboard
            </button>
            <button
              type="button"
              className="flex items-center gap-2 rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-200 border border-slate-700 hover:bg-slate-700 transition-colors"
              onClick={() => {
                localStorage.clear();
                window.location.href = "/dashboard";
              }}
            >
              <Home className="w-4 h-4" />
              Clear Cache & Launch
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
