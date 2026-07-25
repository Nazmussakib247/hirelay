/**
 * Top-level error boundary.
 *
 * Without one, a single unhandled render exception anywhere in the tree unmounts
 * the whole application and leaves a blank white page with no recovery path —
 * the worst possible failure mode during a live demo. React provides no hook
 * equivalent for `componentDidCatch`, so this stays a class component.
 *
 * Deliberate choices:
 *  - The error message is shown, not hidden. This is an internal HR tool; a
 *    recruiter who can quote the message to whoever maintains the system is
 *    more useful than a generic "something went wrong".
 *  - "Try again" resets the boundary state so a transient failure (a bad API
 *    response that has since been fixed) recovers without a full reload.
 */
import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** Optional custom fallback; receives the error and a reset callback. */
  fallback?: (error: Error, reset: () => void) => ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Keep the component stack in the console for debugging; it is far more
    // useful than the message alone when the failure is deep in the tree.
    console.error("Unhandled render error:", error, info.componentStack);
  }

  private reset = (): void => this.setState({ error: null });

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (this.props.fallback) return this.props.fallback(error, this.reset);

    return (
      <div
        role="alert"
        style={{
          maxWidth: 640,
          margin: "4rem auto",
          padding: "2rem",
          fontFamily: "system-ui, sans-serif",
          border: "1px solid #e5e7eb",
          borderRadius: 12,
          background: "#fff",
        }}
      >
        <h1 style={{ margin: "0 0 .5rem", fontSize: "1.25rem", color: "#b91c1c" }}>
          Something went wrong
        </h1>
        <p style={{ margin: "0 0 1rem", color: "#4b5563", lineHeight: 1.5 }}>
          The page failed to render. Your data has not been affected — this is a
          display error.
        </p>
        <pre
          style={{
            margin: "0 0 1.5rem",
            padding: ".75rem",
            background: "#f9fafb",
            borderRadius: 8,
            fontSize: ".8125rem",
            color: "#374151",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {error.message || String(error)}
        </pre>
        <div style={{ display: "flex", gap: ".75rem" }}>
          <button
            onClick={this.reset}
            style={{
              padding: ".5rem 1rem",
              border: "none",
              borderRadius: 8,
              background: "#2563eb",
              color: "#fff",
              cursor: "pointer",
              fontSize: ".875rem",
            }}
          >
            Try again
          </button>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: ".5rem 1rem",
              border: "1px solid #d1d5db",
              borderRadius: 8,
              background: "#fff",
              color: "#374151",
              cursor: "pointer",
              fontSize: ".875rem",
            }}
          >
            Reload page
          </button>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
