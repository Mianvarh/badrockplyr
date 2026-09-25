/**
 * Stream Resolver Service
 * Extracts direct video streams (e.g. .m3u8, .mp4) from third-party file hosts
 */
import { externalFetch } from "@/lib/httpClient";

function unpack(packed: string): string {
  const pattern = /}\s*\(\s*['"]([\s\S]*?)['"]\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*['"]([\s\S]*?)['"]\.split\(['"]\|['"]\)/;
  const match = packed.match(pattern);
  if (!match) {
    const pattern2 = /}\s*\(\s*['"]([\s\S]*?)['"]\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*['"]([\s\S]*?)['"]\s*,\s*(\d+)\s*,\s*([\s\S]*?)\)/;
    const match2 = packed.match(pattern2);
    if (!match2) return packed;
    
    const payload = match2[1];
    const radix = parseInt(match2[2], 10);
    const count = parseInt(match2[3], 10);
    const symtab = match2[4].split('|');
    return decodePacker(payload, radix, count, symtab);
  }
  
  const payload = match[1];
  const radix = parseInt(match[2], 10);
  const count = parseInt(match[3], 10);
  const symtab = match[4].split('|');
  return decodePacker(payload, radix, count, symtab);
}

function decodePacker(payload: string, radix: number, count: number, symtab: string[]): string {
  const base62 = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  
  function unbase(str: string, base: number): number {
    if (base <= 36) {
      return parseInt(str, base);
    }
    const dict: Record<string, number> = {};
    for (let i = 0; i < base; i++) {
      dict[base62[i]] = i;
    }
    let val = 0;
    for (let i = 0; i < str.length; i++) {
      val = val * base + (dict[str[i]] ?? 0);
    }
    return val;
  }
  
  const lookup = function(word: string): string {
    const idx = unbase(word, radix);
    const value = symtab[idx];
    return value === undefined || value === '' ? word : value;
  };
  
  return payload.replace(/\b\w+\b/g, lookup);
}

// Parenthesis matching to find packed scripts in HTML
function findPackedScripts(text: string): string[] {
  const results: string[] = [];
  const searchStr = "eval(function(p,a,c,k,e,d)";
  let idx = 0;
  while (true) {
    const start = text.indexOf(searchStr, idx);
    if (start === -1) break;
    let open = 0;
    let end = -1;
    for (let i = start + 4; i < text.length; i++) {
      if (text[i] === '(') open++;
      else if (text[i] === ')') {
        open--;
        if (open === 0) {
          end = i;
          break;
        }
      }
    }
    if (end !== -1) {
      results.push(text.substring(start, end + 1));
      idx = end + 1;
    } else {
      idx = start + searchStr.length;
    }
  }
  return results;
}

export async function resolveStreamWish(url: string): Promise<string | null> {
  try {
    const fileIdMatch = url.match(/\/e\/([a-zA-Z0-9]+)/);
    if (!fileIdMatch) return null;
    const fileId = fileIdMatch[1];
    const originalHost = new URL(url).hostname;
    
    // We try to fetch from niramirus.com first, as it is the current active player routing domain
    const domainsToTry = Array.from(new Set([originalHost, "niramirus.com", "streamwish.to", "awish.pro", "sfastwish.com", "hanerix.com"]));
    
    for (const domain of domainsToTry) {
      try {
        const directUrl = `https://${domain}/e/${fileId}`;
        const res = await externalFetch(directUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36",
            "Referer": "https://www4.animeflv.net/"
          },
          timeoutMs: 4000,
          proxy: "auto"
        });
        
        if (!res.ok) continue;
        const html = await res.text();
        
        const matches = findPackedScripts(html);
        for (const match of matches) {
          const unpacked = unpack(match);
          const linksMatch = unpacked.match(/var\s+links\s*=\s*(\{[\s\S]*?\});/);
          if (linksMatch) {
            const hls4Match = linksMatch[1].match(/"hls4"\s*:\s*"([^"]+)"|'hls4'\s*:\s*'([^']+)'/);
            const hls2Match = linksMatch[1].match(/"hls2"\s*:\s*"([^"]+)"|'hls2'\s*:\s*'([^']+)'/);
            
            const hls4 = hls4Match ? (hls4Match[1] || hls4Match[2]) : null;
            const hls2 = hls2Match ? (hls2Match[1] || hls2Match[2]) : null;
            
            const chosenStream = hls4 || hls2;
            if (chosenStream) {
              return chosenStream.startsWith("/") ? `https://${domain}${chosenStream}` : chosenStream;
            }
          }
        }
      } catch (err) {
        console.warn(`Failed resolving StreamWish via ${domain}:`, err);
      }
    }
  } catch (err) {
    console.error("Error in resolveStreamWish:", err);
  }
  return null;
}

export async function resolveFembed(url: string): Promise<string | null> {
  try {
    const res = await externalFetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36",
        "Referer": "https://cuevana3i.you/"
      },
      timeoutMs: 8000,
      proxy: "auto"
    });
    if (!res.ok) return null;
    const html = await res.text();
    
    const matches = findPackedScripts(html);
    for (const match of matches) {
      const unpacked = unpack(match);
      const m3u8Match = unpacked.match(/(https?:\/\/[^\s'"]+?\.m3u8(?=[?#"'\s]|$)[^\s'"]*)/i);
      if (m3u8Match) {
        return m3u8Match[1].replace(/\\/g, "");
      }
      const mp4Match = unpacked.match(/(https?:\/\/[^\s'"]+?\.mp4(?=[?#"'\s]|$)[^\s'"]*)/i);
      if (mp4Match) {
        return mp4Match[1].replace(/\\/g, "");
      }
    }
  } catch (err) {
    console.error("Error in resolveFembed:", err);
  }
  return null;
}

export async function resolveJKAnime(url: string): Promise<string | null> {
  try {
    const res = await externalFetch(url, {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36",
        "Referer": "https://jkanime.net/"
      },
      timeoutMs: 8000,
      proxy: "auto"
    });
    if (!res.ok) return null;
    const html = await res.text();
    
    const streamMatch = html.match(/(https?:\/\/[^\s'"]+?\.(?:m3u8|mp4|webm|mkv)[^\s'"]*)/i);
    if (streamMatch) {
      return streamMatch[1].replace(/\\/g, "");
    }
    
    const okruMatch = html.match(/ok\.ru\/videoembed\/(\d+)/i);
    if (okruMatch) {
      return `https://ok.ru/videoembed/${okruMatch[1]}`;
    }
  } catch (err) {
    console.error("Error in resolveJKAnime:", err);
  }
  return null;
}

/**
 * Resolves a Voe embed to its direct m3u8 or mp4 stream
 */
async function resolveVoe(url: string): Promise<string | null> {
  try {
    const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
    
    // Helper function to fetch a URL, check for JS redirection, and follow it recursively
    async function fetchWithJsRedirect(targetUrl: string, depth: number = 0): Promise<{ html: string, url: string } | null> {
      if (depth > 5) return null; // prevent infinite loops
      
      const res = await externalFetch(targetUrl, {
        headers: {
          "User-Agent": ua,
          "Referer": "https://www.cinecalidad.am/"
        },
        timeoutMs: 8000,
        proxy: "never"
      });
      if (!res.ok) return null;
      const html = await res.text();
      
      // Look for client-side redirection like: window.location.href = '...'
      const redirectMatch = html.match(/window\.location\.href\s*=\s*'([^']+)'/) ||
                            html.match(/window\.location\.replace\(\s*'([^']+)'\s*\)/);
      if (redirectMatch) {
        const nextUrl = redirectMatch[1];
        console.log(`[resolveVoe] Following JS redirect from ${targetUrl} to ${nextUrl}`);
        return fetchWithJsRedirect(nextUrl, depth + 1);
      }
      
      return { html, url: targetUrl };
    }

    // 1. Fetch the main page and follow any JS redirects
    const embedPage = await fetchWithJsRedirect(url);
    if (!embedPage) return null;

    // 2. Try the 'hls' / packed script matches first on resolved embed page
    const hlsMatch = embedPage.html.match(/'hls'\s*:\s*'([^']+\.m3u8[^']*)'/i) ||
                     embedPage.html.match(/"hls"\s*:\s*"([^"]+\.m3u8[^"]*)"/i);
    if (hlsMatch) return hlsMatch[1];

    const matches = findPackedScripts(embedPage.html);
    for (const match of matches) {
      const unpacked = unpack(match);
      const m3u8Match = unpacked.match(/(https?:\/\/[^\s'"]+?\.m3u8[^\s'"]*)/);
      if (m3u8Match) return m3u8Match[1].replace(/\\/g, "");
    }

    // 3. Fallback: parse the download page for a direct .mp4 link
    const urlObj = new URL(embedPage.url);
    const pathParts = urlObj.pathname.split("/").filter(Boolean);
    const vid = pathParts[pathParts.length - 1]; // last segment is the ID
    if (!vid) return null;

    const downloadPageUrl = `${urlObj.origin}/${vid}/download`;
    console.log(`[resolveVoe] Fetching download page: ${downloadPageUrl}`);
    
    const downloadPage = await fetchWithJsRedirect(downloadPageUrl);
    if (!downloadPage) return null;

    // Find the direct .mp4 download URL
    const mp4Match = downloadPage.html.match(/href="([^"]+?\.mp4[^"]*?)"/i) ||
                     downloadPage.html.match(/'(https?:\/\/[^\s'"]+?\.mp4[^\s'"]*?)'/i) ||
                     downloadPage.html.match(/"(https?:\/\/[^\s'"]+?\.mp4[^\s'"]*?)"/i);
    if (mp4Match) {
      const directUrl = mp4Match[1].replace(/&amp;/g, "&").replace(/\\/g, "");
      console.log(`[resolveVoe] Extracted direct MP4 URL: ${directUrl}`);
      return directUrl;
    }
  } catch (err) {
    console.error("Error in resolveVoe:", err);
  }
  return null;
}

/**
 * Resolves a Filemoon embed to its direct m3u8 stream
 */
async function resolveFilemoon(url: string): Promise<string | null> {
  try {
    const res = await externalFetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Referer": "https://www.cinecalidad.am/"
      },
      timeoutMs: 8000,
      proxy: "auto"
    });
    if (!res.ok) return null;
    const html = await res.text();

    // Try packed scripts first (Filemoon uses eval-packed JS)
    const matches = findPackedScripts(html);
    for (const match of matches) {
      const unpacked = unpack(match);
      const m3u8Match = unpacked.match(/(https?:\/\/[^\s'"]+?\.m3u8[^\s'"]*)/);
      if (m3u8Match) return m3u8Match[1].replace(/\\/g, "");
    }

    // Direct m3u8 in page source
    const directMatch = html.match(/(https?:\/\/[^\s'"]+?\.m3u8[^\s'"]*)/);
    if (directMatch) return directMatch[1].replace(/\\/g, "");
  } catch (err) {
    console.error("Error in resolveFilemoon:", err);
  }
  return null;
}

/**
 * Generic embed resolver: fetches the embed page and searches for m3u8/mp4 streams
 * Works for Goodstream, Hlswish, Vimeos, and similar simple embed hosts.
 */
async function resolveGenericEmbed(url: string, referer: string = "https://www.cinecalidad.am/"): Promise<string | null> {
  try {
    const res = await externalFetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Referer": referer
      },
      timeoutMs: 8000,
      proxy: "auto"
    });
    if (!res.ok) return null;
    const html = await res.text();

    // 1. Try packed scripts
    const matches = findPackedScripts(html);
    for (const match of matches) {
      const unpacked = unpack(match);
      const m3u8 = unpacked.match(/(https?:\/\/[^\s'"]+?\.m3u8(?=[?#"'\s]|$)[^\s'"]*)/i);
      if (m3u8) return m3u8[1].replace(/\\/g, "");
      const mp4 = unpacked.match(/(https?:\/\/[^\s'"]+?\.mp4(?=[?#"'\s]|$)[^\s'"]*)/i);
      if (mp4) return mp4[1].replace(/\\/g, "");
    }

    // 2. Direct stream URL in source
    const m3u8Direct = html.match(/(https?:\/\/[^\s'"<>]+\.m3u8(?=[?#"'\s<>]|$)(?:\?[^\s'"<>]*)?)/i);
    if (m3u8Direct) return m3u8Direct[1].replace(/\\/g, "");

    const mp4Direct = html.match(/(https?:\/\/[^\s'"<>]+\.mp4(?=[?#"'\s<>]|$)(?:\?[^\s'"<>]*)?)/i);
    if (mp4Direct) return mp4Direct[1].replace(/\\/g, "");
  } catch (err) {
    console.error(`Error in resolveGenericEmbed (${url}):`, err);
  }
  return null;
}

async function resolveVimeus(url: string): Promise<string | null> {
  try {
    const res = await externalFetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Referer": "https://cinehdplus.biz/"
      },
      timeoutMs: 8000,
      proxy: "auto"
    });
    if (!res.ok) return null;
    const html = await res.text();

    const embeds = Array.from(new Set(
      (html.match(/https?:\/\/[^\s'"<>]+?(?:\/embed-[a-zA-Z0-9_-]+\.html|\/embed\/[a-zA-Z0-9_-]+|\/e\/[a-zA-Z0-9_-]+)/g) || [])
        .map((value) => value.replace(/\\/g, ""))
        .filter((value) =>
          value.includes("vimeos.net") ||
          value.includes("goodstream.one") ||
          value.includes("hlswish.com") ||
          value.includes("voe.sx") ||
          value.includes("voe.network") ||
          value.includes("filemoon.sx")
        )
    ));

    for (const embed of embeds) {
      const resolved = await resolveVideoUrl(embed);
      if (resolved && resolved !== embed) return resolved;
    }
  } catch (err) {
    console.error("Error in resolveVimeus:", err);
  }
  return null;
}

/**
 * Resolves a given URL to a direct video stream link if supported.
 * Falls back to the original URL if resolving fails or is not supported.
 */
export async function resolveVideoUrl(url: string): Promise<string> {
  const cleanUrl = url.trim();

  // Streamwish / Niramirus / Hanerix family
  if (cleanUrl.includes("streamwish.to") || cleanUrl.includes("niramirus.com") || cleanUrl.includes("awish.pro") ||
      cleanUrl.includes("sfastwish.com") || cleanUrl.includes("hanerix.com") ||
      cleanUrl.includes("hlswish.com")) {
    const resolved = await resolveStreamWish(cleanUrl);
    if (resolved) return resolved;
  }

  // Fembed / Minochinos family
  if (cleanUrl.includes("minochinos.com") || cleanUrl.includes("hanerix.com") || 
      cleanUrl.includes("embedsito.com") || cleanUrl.includes("fembed.com") || cleanUrl.includes("feurl.com")) {
    const resolved = await resolveFembed(cleanUrl);
    if (resolved) return resolved;
  }

  // JKAnime player wrappers
  if (cleanUrl.includes("jkanime.net/jkplayer/") || cleanUrl.includes("jkanime.net/jkokru.php")) {
    const resolved = await resolveJKAnime(cleanUrl);
    if (resolved) return resolved;
  }

  // Voe
  if (cleanUrl.includes("voe.sx") || cleanUrl.includes("voe.network")) {
    const resolved = await resolveVoe(cleanUrl);
    if (resolved) return resolved;
  }

  // Filemoon
  if (cleanUrl.includes("filemoon.sx") || cleanUrl.includes("filemoon.to") || cleanUrl.includes("fmoon.")) {
    const resolved = await resolveFilemoon(cleanUrl);
    if (resolved) return resolved;
  }

  // Vimeus wrapper used by CineHDPlus
  if (cleanUrl.includes("vimeus.com")) {
    const resolved = await resolveVimeus(cleanUrl);
    if (resolved) return resolved;
  }

  // Generic embed fallback: Goodstream, Vimeos, and any other embed URL
  // We only attempt this for known embed-style URLs (contain /embed- or /e/ pattern)
  if (cleanUrl.includes("goodstream.one") || cleanUrl.includes("vimeos.net") || cleanUrl.includes("vimeus.com") ||
      cleanUrl.includes("embed-") || cleanUrl.match(/\/e\/[a-zA-Z0-9]+/)) {
    const resolved = await resolveGenericEmbed(cleanUrl);
    if (resolved) return resolved;
  }

  return url;
}
