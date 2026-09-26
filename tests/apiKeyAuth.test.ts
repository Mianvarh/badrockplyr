import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  extractApiKeyFromHeaders,
  matchesAllowedDomain,
  validateApiKey,
} from "../src/lib/apiKeyAuth";
import { prisma } from "../src/lib/prisma";

describe("apiKeyAuth", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("extracts API key from X-Badrock-Key header", () => {
    const headers = new Headers();
    headers.set("X-Badrock-Key", "bdrk_live_12345");
    expect(extractApiKeyFromHeaders(headers)).toBe("bdrk_live_12345");
  });

  it("extracts API key from Authorization: Bearer header", () => {
    const headers = new Headers();
    headers.set("Authorization", "Bearer bdrk_live_67890");
    expect(extractApiKeyFromHeaders(headers)).toBe("bdrk_live_67890");
  });

  it("returns null if no key is present in headers", () => {
    const headers = new Headers();
    expect(extractApiKeyFromHeaders(headers)).toBeNull();
  });

  it("matches allowed domains correctly with subdomains and wildcards", () => {
    expect(matchesAllowedDomain("https://mywebsite.com", "mywebsite.com, other.com")).toBe(true);
    expect(matchesAllowedDomain("https://app.mywebsite.com", "mywebsite.com")).toBe(true);
    expect(matchesAllowedDomain("https://evil.com", "mywebsite.com")).toBe(false);
    expect(matchesAllowedDomain("https://anywhere.org", "*")).toBe(true);
    expect(matchesAllowedDomain("https://anywhere.org", "")).toBe(true);
  });

  it("fails validation if key is missing or blank", async () => {
    const res = await validateApiKey("");
    expect(res.valid).toBe(false);
    expect(res.error).toContain("requerida");
  });

  it("fails validation if key is not found in database", async () => {
    vi.spyOn(prisma.apiKey, "findUnique").mockResolvedValue(null as any);

    const res = await validateApiKey("bdrk_live_nonexistent");
    expect(res.valid).toBe(false);
    expect(res.error).toContain("inválida");
  });

  it("fails validation if key is inactive/revoked", async () => {
    vi.spyOn(prisma.apiKey, "findUnique").mockResolvedValue({
      id: "key-1",
      key: "bdrk_live_revoked",
      name: "Revoked Key",
      allowedDomains: null,
      rateLimitPerMinute: 60,
      requestCount: 0,
      lastUsedAt: null,
      active: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);

    const res = await validateApiKey("bdrk_live_revoked");
    expect(res.valid).toBe(false);
    expect(res.error).toContain("inactiva");
  });

  it("validates successfully an active key and increments requestCount", async () => {
    vi.spyOn(prisma.apiKey, "findUnique").mockResolvedValue({
      id: "key-valid",
      key: "bdrk_live_valid",
      name: "Valid Key",
      allowedDomains: null,
      rateLimitPerMinute: 60,
      requestCount: 10,
      lastUsedAt: null,
      active: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);

    const updateSpy = vi.spyOn(prisma.apiKey, "update").mockResolvedValue({} as any);

    const res = await validateApiKey("bdrk_live_valid");
    expect(res.valid).toBe(true);
    expect(res.apiKey?.id).toBe("key-valid");
    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "key-valid" },
        data: expect.objectContaining({ requestCount: { increment: 1 } }),
      })
    );
  });
});
