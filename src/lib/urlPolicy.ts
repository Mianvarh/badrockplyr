import { lookup, Resolver } from "node:dns/promises";
import net from "node:net";

const publicResolver = new Resolver();
publicResolver.setServers(["1.1.1.1", "1.0.0.1", "8.8.8.8", "8.8.4.4"]);

const blockedHostnames = new Set(["localhost", "localhost.localdomain"]);

const explicitResolverHosts = [
  "api.themoviedb.org",
  "image.tmdb.org",
  "unlimplay.com",
  "www3.animeflv.net",
  "www4.animeflv.net",
  "jkanime.net",
  "tioanime.com",
  "monoschinos2.com",
  "animeid.to",
  "cuevana3.cl",
  "cuevana3i.you",
  "www.cinecalidad.am",
  "cinecalidad.am",
  "cinecalidad.ec",
  "cinecalidad.lol",
  "wnv5.gnula.cc",
  "doramasflix.in",
  "sv1.fluxcedene.net",
  "cinehdplus.zone",
  "cinehdplus.biz",
  "full-online.xyz",
  "pelisjuanita.com",
  "vimeus.com",
  "streamwish.to",
  "sfastwish.com",
  "niramirus.com",
  "playmudos.com",
  "cloudwindow-route.com",
  "tiktokcdn.com",
  "awish.pro",
  "hlswish.com",
  "minochinos.com",
  "vsembed.ru",
  "vidlink.pro",
  "videasy.net",
  "player.videasy.net",
  "hanerix.com",
  "embedsito.com",
  "fembed.com",
  "feurl.com",
  "voe.sx",
  "voe.network",
  "filemoon.sx",
  "filemoon.to",
  "nzn3.org",
  "goodstream.one",
  "vimeos.net",
  "vimeos.zip",
  "supervideo.tv",
  "dropload.io",
  "verhdlink.cam",
  "fkplayer.xyz",
  "primeload.co",
  "bysefujedu.com",
  "do7go.com",
  "ducvomes.com",
  "ok.ru",
  "mega.nz",
  "jessicayeahcatch.com",
  "lindalastattack.com",
  "dramiyos-cdn.com",
  "acek-cdn.com",
  "uqload.co",
  "uqload.vc",
  "mp4upload.com",
  "jamesbornmain.com",
  "callistanise.com",
  "okcdn.ru",
  "odnoklassniki.ru",
  "doopla.net",
  "streamtape.com",
  "doodstream.com",
  "dood.li",
  "dood.so",
];

export type PlaybackUrlKind = "direct" | "iframe" | "html";

export function classifyPlaybackUrl(input: string): PlaybackUrlKind {
  const value = input.trim();
  if (value.startsWith("<")) return "html";

  const lower = value.toLowerCase();
  if (
    lower.includes(".m3u8") ||
    lower.includes(".mp4") ||
    lower.includes(".mkv") ||
    lower.includes(".webm")
  ) {
    return "direct";
  }

  return "iframe";
}

function isPrivateIpv4(ip: string) {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) return true;
  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // RFC 6598 Carrier Grade NAT
    (a === 169 && b === 254) ||           // RFC 3927 Link-local / Cloud metadata
    (a === 172 && b >= 16 && b <= 31) ||  // RFC 1918 Private
    (a === 192 && b === 168) ||           // RFC 1918 Private
    (a === 198 && (b === 18 || b === 19)) || // RFC 2544 Benchmark
    a >= 224                              // Multicast (224.0.0.0/4) & Reserved (240.0.0.0/4)
  );
}

function isPrivateIpv6(ip: string) {
  const normalized = ip.toLowerCase();
  if (normalized.startsWith("::ffff:")) {
    const v4 = normalized.slice(7);
    if (net.isIPv4(v4)) return isPrivateIpv4(v4);
  }
  return (
    normalized === "::1" ||
    normalized === "::" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe80:")
  );
}

export function isPrivateIp(ip: string) {
  const version = net.isIP(ip);
  if (version === 4) return isPrivateIpv4(ip);
  if (version === 6) return isPrivateIpv6(ip);
  return false;
}

function hostMatchesDomain(hostname: string, domain: string) {
  const host = hostname.toLowerCase();
  const cleanDomain = domain.toLowerCase().replace(/^https?:\/\//, "").split("/")[0];
  return host === cleanDomain || host.endsWith(`.${cleanDomain}`);
}

export function isAllowedExternalHost(hostname: string, extraDomains: string[] = []) {
  const host = hostname.toLowerCase();
  return (
    host.includes("fmoon.") ||
    [...explicitResolverHosts, ...extraDomains].some((domain) => hostMatchesDomain(hostname, domain))
  );
}

export function parseHttpUrl(input: string) {
  const url = new URL(input);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http/https URLs are allowed.");
  }
  if (blockedHostnames.has(url.hostname.toLowerCase())) {
    throw new Error("Localhost URLs are not allowed.");
  }
  if (isPrivateIp(url.hostname)) {
    throw new Error("Private network IP URLs are not allowed.");
  }
  return url;
}

export async function resolveSafePublicAddresses(
  hostname: string
): Promise<Array<{ address: string; family: number }>> {
  let records: Array<{ address: string; family: number }> = [];
  try {
    const raw = await lookup(hostname, { all: true, verbatim: true });
    records = raw;
  } catch {
    // OS DNS lookup error / NXDOMAIN / timeout
  }

  // If system lookup resolved only to private IPs (e.g. 127.0.0.1 ISP sinkhole) or failed,
  // query public DNS resolvers (1.1.1.1, 8.8.8.8).
  const isSinkholedOrEmpty = records.length === 0 || records.every((r) => isPrivateIp(r.address));
  if (isSinkholedOrEmpty) {
    try {
      const [v4, v6] = await Promise.allSettled([
        publicResolver.resolve4(hostname),
        publicResolver.resolve6(hostname),
      ]);
      const fallbackAddrs: string[] = [];
      if (v4.status === "fulfilled") fallbackAddrs.push(...v4.value);
      if (v6.status === "fulfilled") fallbackAddrs.push(...v6.value);

      if (fallbackAddrs.length > 0) {
        records = fallbackAddrs.map((addr) => ({
          address: addr,
          family: net.isIP(addr),
        }));
      }
    } catch {
      // Public resolver also failed
    }
  }

  if (records.length === 0) {
    throw new Error(`Hostname could not be resolved: ${hostname}`);
  }

  if (records.some((record) => isPrivateIp(record.address))) {
    throw new Error("URLs resolving to private network addresses are not allowed.");
  }

  return records;
}

export function safeDnsLookup(
  hostname: string,
  options: any,
  callback?: (err: any, address?: any, family?: any) => void
) {
  const cb = typeof options === "function" ? options : callback!;
  const opt = typeof options === "function" ? {} : options;

  resolveSafePublicAddresses(hostname)
    .then((records) => {
      if (opt && opt.all) {
        cb(null, records);
      } else {
        cb(null, records[0].address, records[0].family);
      }
    })
    .catch((err) => {
      cb(err);
    });
}

export async function assertPublicHttpUrl(input: string) {
  const url = parseHttpUrl(input);
  const ipVersion = net.isIP(url.hostname);
  if (ipVersion === 0) {
    await resolveSafePublicAddresses(url.hostname);
  }
  return url;
}

export async function assertAllowedExternalUrl(input: string, extraDomains: string[] = []) {
  const url = await assertPublicHttpUrl(input);
  if (!isAllowedExternalHost(url.hostname, extraDomains)) {
    throw new Error(`External host is not allowed: ${url.hostname}`);
  }
  return url;
}

export function isResolvableHost(input: string) {
  try {
    const { hostname, pathname } = parseHttpUrl(input);
    return (
      isAllowedExternalHost(hostname) ||
      hostname.includes("fmoon.") ||
      pathname.includes("embed-") ||
      /\/e\/[a-zA-Z0-9]+/.test(pathname)
    );
  } catch {
    return false;
  }
}

export function getProxyableEmbedUrl(input: string) {
  try {
    const url = parseHttpUrl(input);
    const host = url.hostname.toLowerCase();
    const isVoe =
      host.includes("voe.sx") ||
      host.includes("voe.network") ||
      host.includes("jessicayeahcatch.com") ||
      host.includes("lindalastattack.com");
    const isUnlimplay = host === "unlimplay.com" || host.endsWith(".unlimplay.com");

    return isVoe || isUnlimplay ? input : null;
  } catch {
    return null;
  }
}
