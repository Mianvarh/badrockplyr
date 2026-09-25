export const MAX_VIDEO_OPTIONS = 4;

const QUALITY_PRIORITY = ["2160p", "1080p", "HD", "720p", "SD", "CAM"];
const LANGUAGE_PRIORITY = ["LATINO", "ENGLISH", "CASTELLANO", "JAPANESE"];

export type PlaybackRankInput = {
  videoUrl: string;
  quality: string;
  language: string;
  candidateUrl?: string | null;
  sortOrder?: number;
  createdAt?: Date | string;
  sourceSite?: { priority?: number | null } | null;
};

export type PlaybackRouteKind = "direct_clean" | "manifest_only" | "iframe_fallback" | "rejected";

export function isPrivateMediaUrl(url: string) {
  return url.startsWith("private-media://");
}

export function isPrivateMediaVariant(input: PlaybackRankInput) {
  return input.candidateUrl === "PRIVATE_MEDIA" || isPrivateMediaUrl(input.videoUrl);
}

export function isManualVariant(input: PlaybackRankInput) {
  return input.candidateUrl === "MANUAL";
}

export function isDirectStreamUrl(url: string) {
  const lower = url.toLowerCase();
  return (
    lower.includes(".m3u8") ||
    lower.includes(".mp4") ||
    lower.includes(".mkv") ||
    lower.includes(".webm") ||
    lower.includes("unlimplay.com/hls/")
  );
}

export function isUnsafeIframeHost(url: string) {
  const lower = url.toLowerCase();
  return [
    "filemoon.",
    "fmoon.",
    "bysekoze.com",
    "nzn3.org",
    "streamtape.",
    "hqq.",
    "yourupload.",
    "goodstream.one",
    "mediafire.com",
    "mxdrop.",
    "mixdrop.",
    "dsvplay.",
    "lulustream",
    "dood.",
    "vidhide",
  ].some((host) => lower.includes(host));
}

export function isResolvableEmbedUrl(url: string) {
  if (isPrivateMediaUrl(url)) return true;

  const lower = url.toLowerCase();
  return [
    "unlimplay.com",
    "voe.sx",
    "voe.network",
    "voe-network.net",
    "repacklab.com",
    "streamwish",
    "sfastwish",
    "niramirus",
    "awish.pro",
    "hlswish.com",
    "wishembed",
    "embedwish",
    "strwish",
    "minochinos",
    "hanerix",
    "embedsito",
    "fembed",
    "feurl",
    "mp4upload.com",
    "jkanime.net/jkplayer",
    "jkanime.net/jkokru.php",
    "vimeos.net",
    "vimeus.com",
    "fkplayer.xyz",
    "primeload.co",
    "bysefujedu.com",
    "do7go.com",
    "uqload.",
    "dramiyos-cdn",
    "acek-cdn",
    "jamesbornmain",
    "callistanise",
    "embed-",
    "ok.ru/videoembed/",
    "vidlink.pro",
    "videasy.net",
    "player.videasy.net",
    "vsembed.ru",
    "vidapi.xyz",
  ].some((host) => lower.includes(host));
}

export function isSupportedEmbedUrl(url: string) {
  const lower = url.toLowerCase();
  return [
    "vsembed.ru",
    "vidlink.pro",
    "videasy.net",
    "player.videasy.net",
    "vidapi.xyz",
    "mp4upload.com",
  ].some((host) => lower.includes(host));
}

export function isCleanPlaybackUrl(url: string) {
  if (isUnsafeIframeHost(url)) return false;
  return isPrivateMediaUrl(url) || isDirectStreamUrl(url) || isResolvableEmbedUrl(url) || isSupportedEmbedUrl(url);
}

export function classifyPlaybackRoute(url: string): PlaybackRouteKind {
  if (!url || isUnsafeIframeHost(url)) return "rejected";
  if (isPrivateMediaUrl(url)) return "direct_clean";
  if (isDirectStreamUrl(url)) {
    return url.toLowerCase().includes(".m3u8") || url.toLowerCase().includes("unlimplay.com/hls/")
      ? "manifest_only"
      : "direct_clean";
  }
  if (isResolvableEmbedUrl(url) || isSupportedEmbedUrl(url)) return "iframe_fallback";
  return "rejected";
}

function priorityIndex(values: string[], value: string) {
  const index = values.indexOf(value);
  return index === -1 ? 99 : index;
}

function createdAtMs(value?: Date | string) {
  if (!value) return 0;
  return new Date(value).getTime();
}

export function comparePlaybackRank(a: PlaybackRankInput, b: PlaybackRankInput) {
  const manualA = isManualVariant(a);
  const manualB = isManualVariant(b);
  if (manualA && !manualB) return -1;
  if (!manualA && manualB) return 1;

  const cleanA = isCleanPlaybackUrl(a.videoUrl);
  const cleanB = isCleanPlaybackUrl(b.videoUrl);
  if (cleanA && !cleanB) return -1;
  if (!cleanA && cleanB) return 1;

  const langA = priorityIndex(LANGUAGE_PRIORITY, a.language);
  const langB = priorityIndex(LANGUAGE_PRIORITY, b.language);
  if (langA !== langB) return langA - langB;

  const qualityA = priorityIndex(QUALITY_PRIORITY, a.quality);
  const qualityB = priorityIndex(QUALITY_PRIORITY, b.quality);
  if (qualityA !== qualityB) return qualityA - qualityB;

  const directA = isDirectStreamUrl(a.videoUrl);
  const directB = isDirectStreamUrl(b.videoUrl);
  if (directA && !directB) return -1;
  if (!directA && directB) return 1;

  const sourceA = a.sourceSite?.priority || 0;
  const sourceB = b.sourceSite?.priority || 0;
  if (sourceA !== sourceB) return sourceB - sourceA;

  if ((a.sortOrder || 0) !== (b.sortOrder || 0)) {
    return (a.sortOrder || 0) - (b.sortOrder || 0);
  }

  return createdAtMs(a.createdAt) - createdAtMs(b.createdAt);
}

export function orderPlaybackOptions<T extends PlaybackRankInput>(variants: T[], limit: number | null = MAX_VIDEO_OPTIONS) {
  const cleanVariants = variants.filter((variant) => isCleanPlaybackUrl(variant.videoUrl));
  const manual = cleanVariants.filter(isManualVariant).sort(comparePlaybackRank);
  const privateMedia = cleanVariants.filter((variant) => !isManualVariant(variant) && isPrivateMediaVariant(variant)).sort(comparePlaybackRank);
  const external = cleanVariants.filter((variant) => !isManualVariant(variant) && !isPrivateMediaVariant(variant)).sort(comparePlaybackRank);
  const applyLimit = (items: T[]) => limit === null ? items : items.slice(0, limit);

  if (manual.length > 0) {
    return applyLimit([...manual, ...external, ...privateMedia]);
  }

  if (external.length === 0) {
    return applyLimit(privateMedia);
  }

  return applyLimit([external[0], ...privateMedia, ...external.slice(1)]);
}
