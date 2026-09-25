const ITAG_QUALITY: Record<string, string> = {
  "37": "1080p",
  "22": "720p",
  "59": "480p",
  "18": "360p",
};

const QUALITY_SCORE: Record<string, number> = {
  "1080p": 1080,
  "720p": 720,
  "480p": 480,
  "360p": 360,
  auto: 0,
};

export interface GoogleDriveSource {
  itag: string;
  quality: string;
  url: string;
}

export function extractGoogleDriveFileId(value: string) {
  const clean = value.trim();
  if (/^[A-Za-z0-9_-]{10,}$/.test(clean) && !clean.includes("/")) return clean;

  let parsed: URL;
  try {
    parsed = new URL(clean);
  } catch {
    return null;
  }

  const filePathMatch = parsed.pathname.match(/\/file\/d\/([^/]+)/);
  if (filePathMatch?.[1]) return filePathMatch[1];

  const id = parsed.searchParams.get("id");
  if (id) return id;

  const foldersMatch = parsed.pathname.match(/\/d\/([^/]+)/);
  return foldersMatch?.[1] || null;
}

function safeDecode(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function parseGoogleDriveVideoInfo(body: string) {
  const params = new URLSearchParams(body);
  const errorCode = params.get("errorcode");
  if (errorCode) {
    return {
      sources: [] as GoogleDriveSource[],
      error: params.get("reason") || params.get("errorCode") || errorCode,
    };
  }

  const streamMap = params.get("fmt_stream_map") || params.get("url_encoded_fmt_stream_map");
  if (!streamMap) return { sources: [] as GoogleDriveSource[], error: "No video streams were returned by Google Drive." };

  const sources = streamMap
    .split(",")
    .map((entry) => {
      const [itag, rawUrl] = entry.split("|");
      if (!itag || !rawUrl) return null;
      const quality = ITAG_QUALITY[itag] || `${itag}p`;
      return { itag, quality, url: safeDecode(rawUrl) };
    })
    .filter((source): source is GoogleDriveSource => Boolean(source?.url));

  return { sources, error: sources.length ? undefined : "No playable Google Drive streams were parsed." };
}

export function pickBestGoogleDriveSource(sources: GoogleDriveSource[], preferredQuality = "auto") {
  const normalizedPreference = preferredQuality.toLowerCase().replace(/[^0-9a-z]/g, "");
  const exact = sources.find((source) => source.quality.replace(/[^0-9a-z]/g, "") === normalizedPreference);
  if (exact) return exact;

  return [...sources].sort((left, right) => {
    const leftScore = QUALITY_SCORE[left.quality] || Number.parseInt(left.quality, 10) || 0;
    const rightScore = QUALITY_SCORE[right.quality] || Number.parseInt(right.quality, 10) || 0;
    return rightScore - leftScore;
  })[0] || null;
}

function rankedGoogleDriveSources(sources: GoogleDriveSource[], preferredQuality = "auto") {
  const normalizedPreference = preferredQuality.toLowerCase().replace(/[^0-9a-z]/g, "");

  return [...sources].sort((left, right) => {
    const leftMatchesPreference = left.quality.replace(/[^0-9a-z]/g, "") === normalizedPreference ? 1 : 0;
    const rightMatchesPreference = right.quality.replace(/[^0-9a-z]/g, "") === normalizedPreference ? 1 : 0;
    if (leftMatchesPreference !== rightMatchesPreference) return rightMatchesPreference - leftMatchesPreference;

    const leftScore = QUALITY_SCORE[left.quality] || Number.parseInt(left.quality, 10) || 0;
    const rightScore = QUALITY_SCORE[right.quality] || Number.parseInt(right.quality, 10) || 0;
    return rightScore - leftScore;
  });
}

async function isPlayableGoogleDriveSource(source: GoogleDriveSource, cookieHeader: string) {
  try {
    const response = await fetch(source.url, {
      method: "HEAD",
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36",
        ...(cookieHeader ? { "cookie": cookieHeader } : {}),
      },
      signal: AbortSignal.timeout(10000),
    });

    return response.status === 200 || response.status === 206;
  } catch {
    return false;
  }
}

export async function resolveGoogleDriveFile(fileId: string, preferredQuality?: string) {
  const endpoint = new URL("https://docs.google.com/get_video_info");
  endpoint.searchParams.set("docid", fileId);

  const response = await fetch(endpoint, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36",
    },
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) throw new Error(`Google Drive returned HTTP ${response.status}`);

  const cookieHeader = response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .filter(Boolean)
    .join("; ");
  const parsed = parseGoogleDriveVideoInfo(await response.text());
  if (parsed.error) throw new Error(parsed.error);

  let source: GoogleDriveSource | null = null;
  for (const candidate of rankedGoogleDriveSources(parsed.sources, preferredQuality)) {
    if (await isPlayableGoogleDriveSource(candidate, cookieHeader)) {
      source = candidate;
      break;
    }
  }

  if (!source) throw new Error("No playable Google Drive stream was selected.");

  return {
    url: source.url,
    contentType: "video/mp4",
    quality: source.quality,
    cookieHeader,
  };
}
