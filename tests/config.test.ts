import { afterEach, describe, expect, it, vi } from "vitest";

const originalEnv = { ...process.env };

describe("config", () => {
  afterEach(() => {
    process.env = { ...originalEnv };
    vi.resetModules();
  });

  it("reads app url and proxy configuration from environment", async () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://example.com/";
    process.env.OUTBOUND_PROXY_MODE = "required";
    process.env.OUTBOUND_PROXY_URLS = "http://user:pass@proxy-one:8000, http://proxy-two:8000";
    process.env.DEBUG_LOGS = "false";

    const config = await import("../src/lib/config");

    expect(config.appBaseUrl).toBe("https://example.com");
    expect(config.proxyMode).toBe("required");
    expect(config.proxyUrls).toEqual(["http://user:pass@proxy-one:8000", "http://proxy-two:8000"]);
    expect(config.debugLogs).toBe(false);
  });

  it("falls back to localhost and optional proxy mode", async () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.APP_BASE_URL;
    delete process.env.OUTBOUND_PROXY_MODE;
    delete process.env.OUTBOUND_PROXY_URLS;

    const config = await import("../src/lib/config");

    expect(config.appBaseUrl).toBe("http://localhost:3000");
    expect(config.proxyMode).toBe("optional");
    expect(config.proxyUrls).toEqual([]);
  });
});
