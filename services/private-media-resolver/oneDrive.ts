function base64UrlEncode(value: string) {
  return Buffer.from(value, "utf8")
    .toString("base64")
    .replace(/=+$/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

export function extractOneDriveFileId(value: string) {
  const clean = value.trim();
  if (!clean) return null;

  try {
    const url = new URL(clean);
    if (
      url.hostname === "1drv.ms" ||
      url.hostname.endsWith(".1drv.ms") ||
      url.hostname.includes("onedrive.live.com") ||
      url.hostname.includes("sharepoint.com")
    ) {
      return clean;
    }
  } catch {
    return null;
  }

  return null;
}

export function buildOneDriveContentUrl(sharedUrl: string) {
  return `https://api.onedrive.com/v1.0/shares/u!${base64UrlEncode(sharedUrl)}/root/content`;
}

async function probeOneDriveContent(contentUrl: string) {
  const response = await fetch(contentUrl, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36",
      "range": "bytes=0-0",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(15000),
  });

  await response.body?.cancel();
  return {
    ok: response.status === 200 || response.status === 206,
    status: response.status,
    contentType: response.headers.get("content-type") || "video/mp4",
  };
}

export async function resolveOneDriveFile(sharedUrl: string, preferredQuality?: string) {
  const contentUrl = buildOneDriveContentUrl(sharedUrl);
  const probe = await probeOneDriveContent(contentUrl);
  if (!probe.ok) {
    throw new Error(`OneDrive returned HTTP ${probe.status}`);
  }

  return {
    url: contentUrl,
    contentType: probe.contentType,
    quality: preferredQuality && preferredQuality !== "auto" ? preferredQuality : "auto",
  };
}
