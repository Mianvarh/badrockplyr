const DIRECT_PLAYBACK_HOSTS = [
  "docs.google.com",
  "drive.google.com",
  "googleusercontent.com",
  "api.onedrive.com",
  "onedrive.live.com",
  "1drv.ms",
  "unlimplay.com",
  "vimeos.net",
  "vimeos.zip",
  "goodstream.one",
  "tiktokcdn.com",
  "cloudwindow-route.com",
  "dramiyos-cdn.com",
  "acek-cdn.com",
  "uqload.co",
  "uqload.vc",
  "mp4upload.com",
  "jamesbornmain.com",
  "callistanise.com",
  "streamwish.to",
  "sfastwish.com",
  "niramirus.com",
  "awish.pro",
  "hlswish.com",
  "minochinos.com",
  "fembed.com",
  "feurl.com",
  "voe.sx",
  "voe.network",
  "filemoon.sx",
  "filemoon.to",
  "ok.ru",
  "okcdn.ru",
  "vsembed.ru",
  "vidlink.pro",
  "videasy.net",
  "bysefujedu.com",
  "do7go.com",
  "supervideo.tv",
  "digitalnomadventures.site",
  "highperformancebrands.site",
  "scalableimpactgroup.site",
  "putgate.com",
];

const NEXTGEN_SEGMENT_HOSTS = [
  "digitalnomadventures.site",
  "highperformancebrands.site",
  "scalableimpactgroup.site",
  "putgate.com",
];

const HEAVY_VIDEO_EXTENSIONS = [
  ".ts",
  ".m4s",
  ".mp4",
  ".mkv",
  ".webm",
  ".avi",
  ".mov",
];

function hostMatches(host: string, domain: string) {
  return host === domain || host.endsWith(`.${domain}`);
}

export function isPlaylistUrl(targetUrl: string) {
  const lower = targetUrl.toLowerCase();
  return lower.includes(".m3u8") || lower.includes("unlimplay.com/hls/");
}

export function isLikelyHeavyVideoUrl(targetUrl: string) {
  try {
    const url = new URL(targetUrl);
    const path = url.pathname.toLowerCase();
    return HEAVY_VIDEO_EXTENSIONS.some((extension) => path.endsWith(extension) || path.includes(`${extension}?`));
  } catch {
    return HEAVY_VIDEO_EXTENSIONS.some((extension) => targetUrl.toLowerCase().includes(extension));
  }
}

export function isHeavyVideoContentType(contentType: string) {
  const lower = contentType.toLowerCase();
  return (
    lower.startsWith("video/") ||
    lower.includes("mp2t") ||
    lower.includes("dash") ||
    lower.includes("matroska")
  );
}

export function shouldProxySegmentThroughVps(targetUrl: string) {
  try {
    const url = new URL(targetUrl);
    const host = url.hostname.toLowerCase();
    const path = url.pathname.toLowerCase();
    return hostMatches(host, "unlimplay.com") && path.includes("/stream-ts/");
  } catch {
    return false;
  }
}

export function requiresVpsVideoProxy(targetUrl: string) {
  try {
    const url = new URL(targetUrl);
    const host = url.hostname.toLowerCase();
    const path = url.pathname.toLowerCase();
    return hostMatches(host, "unlimplay.com") && (
      path.includes("/hls/") ||
      path.includes("/stream-ts/")
    );
  } catch {
    return false;
  }
}

export function allowsExplicitFallbackRelay(targetUrl: string, requested: boolean) {
  return requested && requiresVpsVideoProxy(targetUrl);
}

export function shouldBypassProxyForPlayback(targetUrl: string) {
  try {
    const url = new URL(targetUrl);
    const host = url.hostname.toLowerCase();
    const isDirectHost = DIRECT_PLAYBACK_HOSTS.some((domain) => hostMatches(host, domain));
    if (isDirectHost) return true;
    if (isPlaylistUrl(targetUrl) || isLikelyHeavyVideoUrl(targetUrl)) return true;
    return false;
  } catch {
    return false;
  }
}

export function getPlaybackResponseContentType(targetUrl: string, upstreamContentType: string) {
  try {
    const url = new URL(targetUrl);
    const host = url.hostname.toLowerCase();
    const lowerPath = url.pathname.toLowerCase();
    const isNextgenSegment = NEXTGEN_SEGMENT_HOSTS.some((domain) => hostMatches(host, domain)) && /\/page-\d+\.html$/i.test(url.pathname);
    const isTiktokWrappedSegment = hostMatches(host, "tiktokcdn.com") && lowerPath.includes("/ad-site-i18n-");
    const isUnlimplaySegment = hostMatches(host, "unlimplay.com") && lowerPath.includes("/stream-ts/");

    if (isNextgenSegment || isTiktokWrappedSegment || isUnlimplaySegment) {
      return "video/mp2t";
    }
  } catch {
    // Keep upstream content type.
  }

  return upstreamContentType || "application/octet-stream";
}
