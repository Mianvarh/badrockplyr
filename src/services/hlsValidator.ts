import { externalFetch } from "@/lib/httpClient";

const userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

function resolvePlaylistUrl(baseUrl: string, value: string) {
  return new URL(value.trim(), baseUrl).toString();
}

function getHlsHeaders(url: string, range?: string) {
  const headers: Record<string, string> = {
    "User-Agent": userAgent,
    Accept: "application/vnd.apple.mpegurl,application/x-mpegURL,text/plain,*/*",
    ...(range ? { Range: range } : {}),
  };

  try {
    const host = new URL(url).hostname.toLowerCase();
    const needsNextgenReferer = [
      "digitalnomadventures.site",
      "highperformancebrands.site",
      "scalableimpactgroup.site",
      "putgate.com",
    ].some((domain) => host === domain || host.endsWith(`.${domain}`));

    if (needsNextgenReferer) {
      headers.Origin = "https://nextgencloudfabric.com";
      headers.Referer = "https://nextgencloudfabric.com/";
    }

    if (host === "vimeos.net" || host.endsWith(".vimeos.net") || host === "vimeos.zip" || host.endsWith(".vimeos.zip")) {
      headers.Origin = "https://vimeos.net";
      headers.Referer = "https://vimeos.net/";
    }

    if (host === "goodstream.one" || host.endsWith(".goodstream.one")) {
      headers.Origin = "https://goodstream.one";
      headers.Referer = "https://goodstream.one/";
    }
  } catch {
    // Keep default HLS headers.
  }

  return headers;
}

function shouldBypassProxy(url: string) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return [
      "unlimplay.com",
      "vimeos.net",
      "vimeos.zip",
      "goodstream.one",
      "digitalnomadventures.site",
      "highperformancebrands.site",
      "scalableimpactgroup.site",
      "putgate.com",
    ].some((domain) => host === domain || host.endsWith(`.${domain}`));
  } catch {
    return false;
  }
}

function firstPlaylistUri(manifest: string) {
  return manifest
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith("#") && (line.includes(".m3u8") || line.includes(".txt")));
}

function firstSegmentUri(manifest: string) {
  return manifest
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith("#") && !line.includes(".m3u8") && !line.includes(".txt"));
}

function segmentUris(manifest: string) {
  return manifest
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && !line.includes(".m3u8") && !line.includes(".txt"));
}

async function fetchText(url: string) {
  try {
    const response = await externalFetch(url, {
      headers: getHlsHeaders(url),
      timeoutMs: 8000,
      proxy: shouldBypassProxy(url) ? "never" : "auto",
    });
    if (!response.ok) return null;
    const text = await response.text();
    const lower = text.slice(0, 512).toLowerCase();
    if (lower.includes("<html") || lower.includes("<!doctype")) return null;
    return text;
  } catch {
    return null;
  }
}

async function validateSegment(url: string) {
  try {
    const response = await externalFetch(url, {
      headers: getHlsHeaders(url, "bytes=0-751"),
      timeoutMs: 8000,
      proxy: shouldBypassProxy(url) ? "never" : "auto",
    });
    if (response.status !== 200 && response.status !== 206) return false;

    const buffer = new Uint8Array(await response.arrayBuffer());
    if (buffer.length === 0) return false;

    const ascii = Array.from(buffer)
      .map((byte) => (byte >= 32 && byte < 127 ? String.fromCharCode(byte) : "."))
      .join("")
      .toLowerCase();

    const isImage =
      (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) ||
      (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) ||
      (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) ||
      ascii.includes("webp");
    const isMarkupOrJson = ascii.includes("<html") || ascii.includes("<!doctype") || ascii.trimStart().startsWith("{");
    if (isImage || isMarkupOrJson) return false;

    const packetOffsets = [0, 188, 376, 564].filter((offset) => offset < buffer.length);
    const isMpegTs = packetOffsets.length >= 2 && packetOffsets.every((offset) => buffer[offset] === 0x47);
    const isFragmentedMp4 = ascii.includes("ftyp") || ascii.includes("moof") || ascii.includes("styp");
    return isMpegTs || isFragmentedMp4;
  } catch {
    return false;
  }
}

export async function validateHlsUrl(url: string, depth = 0): Promise<boolean> {
  if (depth > 2) return false;

  const manifest = await fetchText(url);
  if (!manifest || !manifest.includes("#EXTM3U")) return false;

  const nestedPlaylist = firstPlaylistUri(manifest);
  if (nestedPlaylist) {
    return validateHlsUrl(resolvePlaylistUrl(url, nestedPlaylist), depth + 1);
  }

  if (!manifest.includes("#EXTINF") && !manifest.includes("#EXT-X-MAP")) {
    return false;
  }

  const segment = firstSegmentUri(manifest);
  if (!segment) return false;

  const segments = segmentUris(manifest).slice(0, 18);
  if (segments.length > 1) {
    for (const item of segments) {
      if (!(await validateSegment(resolvePlaylistUrl(url, item)))) {
        return false;
      }
    }
    return true;
  }

  return validateSegment(resolvePlaylistUrl(url, segment));
}
