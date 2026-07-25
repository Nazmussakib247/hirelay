import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, apiDownload } from "./client";
import { getToken, setToken } from "../auth/token";

const okJson = (body: unknown, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
  headers: { get: () => null },
});

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  sessionStorage.clear();
});

describe("api()", () => {
  it("injects the bearer token and JSON content type", async () => {
    setToken("tok-123");
    fetchMock.mockResolvedValue(okJson({ ok: true }));
    await api("/stats");
    const [url, opts] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/stats");
    expect(opts.headers.Authorization).toBe("Bearer tok-123");
    expect(opts.headers["Content-Type"]).toBe("application/json");
  });

  it("does NOT set Content-Type for FormData bodies (browser sets boundary)", async () => {
    fetchMock.mockResolvedValue(okJson({}));
    await api("/upload-cv", { method: "POST", body: new FormData() });
    const [, opts] = fetchMock.mock.calls[0];
    expect(opts.headers["Content-Type"]).toBeUndefined();
  });

  it("clears the token and calls onUnauthorized on 401", async () => {
    setToken("expired");
    fetchMock.mockResolvedValue(okJson({}, 401));
    const onUnauthorized = vi.fn();
    await expect(api("/stats", {}, onUnauthorized)).rejects.toThrow(/session expired/i);
    expect(onUnauthorized).toHaveBeenCalledOnce();
    expect(getToken()).toBeNull();
  });

  it("surfaces the backend error envelope message", async () => {
    fetchMock.mockResolvedValue(
      okJson({ error: { code: "validation_error", message: "File too large" } }, 422),
    );
    await expect(api("/upload-cv")).rejects.toThrow("File too large");
  });

  it("falls back to a generic message when the error body is empty", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => {
        throw new Error("not json");
      },
      headers: { get: () => null },
    });
    await expect(api("/stats")).rejects.toThrow("Request failed (502)");
  });

  it("returns undefined for 204 No Content", async () => {
    fetchMock.mockResolvedValue({ ...okJson({}), status: 204 });
    await expect(api("/x")).resolves.toBeUndefined();
  });
});

describe("apiDownload()", () => {
  it("downloads a blob using the server-provided filename", async () => {
    setToken("tok");
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => 'attachment; filename="cv_original.pdf"' },
      blob: async () => new Blob(["%PDF-1.4"]),
      json: async () => ({}),
    });
    const createObjectURL = vi.fn(() => "blob:fake");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });

    const clicks: string[] = [];
    const origClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
      clicks.push(this.download);
    };
    try {
      await apiDownload("/candidates/1/cv", "fallback.pdf");
    } finally {
      HTMLAnchorElement.prototype.click = origClick;
    }

    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("Bearer tok");
    expect(clicks).toEqual(["cv_original.pdf"]);
    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledOnce();
  });

  it("throws the backend message when the download fails", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 404,
      headers: { get: () => null },
      json: async () => ({ error: { message: "No stored CV file for this candidate" } }),
    });
    await expect(apiDownload("/candidates/1/cv")).rejects.toThrow(/no stored cv/i);
  });
});
