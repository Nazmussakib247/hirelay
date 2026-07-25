import { render, screen, fireEvent } from "@testing-library/react";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

import { ErrorBoundary } from "./ErrorBoundary";

function Boom({ shouldThrow = true }: { shouldThrow?: boolean }) {
  if (shouldThrow) throw new Error("kaboom from render");
  return <p>recovered content</p>;
}

describe("ErrorBoundary", () => {
  beforeEach(() => {
    // React logs caught render errors; silence it so test output stays readable.
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it("renders children when nothing throws", () => {
    render(
      <ErrorBoundary>
        <p>all good</p>
      </ErrorBoundary>,
    );
    expect(screen.getByText("all good")).toBeInTheDocument();
  });

  it("catches a render error instead of unmounting the tree", () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
  });

  it("surfaces the error message so it can be reported", () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByText(/kaboom from render/)).toBeInTheDocument();
  });

  it("offers recovery actions", () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /reload page/i })).toBeInTheDocument();
  });

  it("clears the error state when 'Try again' is pressed", () => {
    function Flaky() {
      // Throws on first render only; the retry should then succeed.
      if (!(globalThis as Record<string, unknown>).__recovered) {
        (globalThis as Record<string, unknown>).__recovered = true;
        throw new Error("transient");
      }
      return <p>recovered content</p>;
    }
    delete (globalThis as Record<string, unknown>).__recovered;

    render(
      <ErrorBoundary>
        <Flaky />
      </ErrorBoundary>,
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(screen.getByText("recovered content")).toBeInTheDocument();
  });

  it("uses a custom fallback when one is supplied", () => {
    render(
      <ErrorBoundary fallback={(err) => <p>custom: {err.message}</p>}>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByText(/custom: kaboom from render/)).toBeInTheDocument();
  });
});
