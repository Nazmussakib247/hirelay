import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import App from "./App.jsx";

beforeEach(() => {
  sessionStorage.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({}),
      headers: { get: () => null },
    })),
  );
});

afterEach(() => vi.unstubAllGlobals());

describe("App (smoke)", () => {
  it("renders the login page when no token is stored", async () => {
    render(<App />);
    expect(
      await screen.findByText(/sign in to access the recruiting dashboard/i),
    ).toBeInTheDocument();
  });
});
