import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  getWebsharePool,
  getNextProxyFromPool,
  resolveGoogleDriveStreamUrl,
} from "../src/services/proxyService";

describe("proxyService (Webshare Pool 1 & Pool 2)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    delete process.env.WEBSHARE_POOL_1;
    delete process.env.WEBSHARE_POOL_2;
  });

  it("reads proxies from environment variables for Pool 1 and Pool 2", async () => {
    process.env.WEBSHARE_POOL_1 = "http://user1:pass1@proxy1.webshare.io:1000";
    process.env.WEBSHARE_POOL_2 = "http://user2:pass2@proxy2.webshare.io:2000";

    const pool1 = await getWebsharePool(1);
    const pool2 = await getWebsharePool(2);

    expect(pool1).toHaveLength(1);
    expect(pool1[0]).toContain("proxy1.webshare.io:1000");

    expect(pool2).toHaveLength(1);
    expect(pool2[0]).toContain("proxy2.webshare.io:2000");
  });

  it("rotates proxies in round-robin within the same pool", async () => {
    process.env.WEBSHARE_POOL_1 = "http://user1:pass1@p1.webshare.io:1000,http://user1:pass1@p2.webshare.io:1000";

    const first = await getNextProxyFromPool(1);
    const second = await getNextProxyFromPool(1);
    const third = await getNextProxyFromPool(1);

    expect(first).not.toEqual(second);
    expect(third).toEqual(first);
  });

  it("resolves Google Drive stream URL with fallback download endpoint", async () => {
    const fileId = "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs";
    const resolved = await resolveGoogleDriveStreamUrl(fileId);

    expect(resolved.url).toContain(fileId);
  });
});
