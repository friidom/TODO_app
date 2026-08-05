import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** Replaces the default panel. Receives a reset that clears the error. */
  fallback?: (error: Error, reset: () => void) => ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Catches a render throw from its subtree.
 *
 * Without one of these anywhere, a single card that throws blanks the whole
 * application — React unmounts the entire tree when nothing catches. Wrapped
 * around each column's card list, the rest of the board survives.
 *
 * No logging here: React 19 already reports caught errors with a component
 * stack, and a second copy would say nothing new.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;

    if (!error) return this.props.children;

    if (this.props.fallback) return this.props.fallback(error, this.reset);

    return <ErrorPanel error={error} onRetry={this.reset} />;
  }
}

function ErrorPanel({ error, onRetry }: { error: Error; onRetry: () => void }) {
  return (
    <div className="border-destructive/40 bg-destructive/5 rounded-lg border p-3">
      <p className="text-destructive text-sm font-medium">
        Something broke here.
      </p>

      <p className="text-muted-foreground mt-1 text-xs wrap-break-word">
        {error.message}
      </p>

      <button
        type="button"
        onClick={onRetry}
        className="border-destructive/40 text-destructive hover:bg-destructive/10 mt-3 cursor-pointer rounded border px-2 py-1 text-xs font-medium transition"
      >
        Try again
      </button>
    </div>
  );
}
