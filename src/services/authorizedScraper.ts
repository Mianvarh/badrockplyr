import * as cheerio from "cheerio";
import { normalizeLanguage } from "./languageNormalizer";
import { normalizeQuality } from "./qualityNormalizer";
import { externalFetch } from "@/lib/httpClient";
import { extractPelisJuanitaStreamRows, isPelisJuanitaUrl } from "./pelisJuanitaService";
import { extractPelisFlixStreamRows, isPelisFlixUrl } from "./pelisFlixService";
import { isCleanPlaybackUrl, isResolvableEmbedUrl, isSupportedEmbedUrl, isUnsafeIframeHost } from "@/lib/playbackUrlPolicy";

function extractJkLanguageMap(html: string): Record<string, string> {
  const map: Record<string, string> = {
    "1": "JAPANESE",
    "2": "LATINO",
    "3": "LATINO",
    "4": "CASTELLANO",
  };
  const deflangMatch = html.match(/<select[^>]*id=["']deflang["'][^>]*>([\s\S]*?)<\/select>/i);
  if (deflangMatch) {
    const optRegex = /<option[^>]*value=["'](\d+)["'][^>]*>([\s\S]*?)<\/option>/gi;
    let m;
    while ((m = optRegex.exec(deflangMatch[1])) !== null) {
      const val = m[1];
      const text = m[2].toLowerCase();
      if (text.includes("latino")) {
        map[val] = "LATINO";
      } else if (text.includes("castellano") || text.includes("españa")) {
        map[val] = "CASTELLANO";
      } else if (text.includes("japones") || text.includes("sub")) {
        map[val] = "JAPANESE";
      } else if (text.includes("ingles") || text.includes("english")) {
        map[val] = "ENGLISH";
      }
    }
  }
  return map;
}

function detectedLangFromJkLang(value: number | string | undefined, fallback: string, langMap?: Record<string, string>) {
  const normalized = String(value || "");
  if (langMap && langMap[normalized]) return langMap[normalized];
  if (normalized === "1") return "JAPANESE";
  if (normalized === "2") return "LATINO";
  if (normalized === "3") return "LATINO";
  if (normalized === "4") return "CASTELLANO";
  return fallback;
}

function detectLanguageFromContext(html: string, url: string, defaultValue: string = "LATINO"): string {
  const urlLower = url.toLowerCase();
  
  const titleMatch = html.match(/<title>([\s\S]*?)<\/title>/i);
  const pageTitle = titleMatch ? titleMatch[1].toLowerCase() : "";
  
  if (urlLower.includes("castellano") || pageTitle.includes("castellano")) {
    return "CASTELLANO";
  }
  if (urlLower.includes("latino") || pageTitle.includes("latino") || pageTitle.includes("español latino") || pageTitle.includes("audio latino")) {
    return "LATINO";
  }
  if (urlLower.includes("subtitulado") || urlLower.includes("sub-espanol") || pageTitle.includes("subtitulado") || pageTitle.includes("sub")) {
    return "JAPANESE";
  }
  return defaultValue;
}

function looksLikeAntiBotPage(html: string) {
  const head = html.slice(0, 5000).toLowerCase();
  return (
    head.includes("just a moment") ||
    head.includes("checking your browser") ||
    head.includes("verificación de seguridad") ||
    head.includes("verificacion de seguridad") ||
    head.includes("cf-browser-verification") ||
    head.includes("cf-challenge") ||
    head.includes("challenge-platform")
  );
}

export interface ScrapedVideo {
  url: string;
  language: string; // Standardized: LATINO, ENGLISH, etc.
  quality: string;  // Standardized: 1080p, HD, etc.
}

export interface ScrapedSubtitle {
  url: string;
  language: string;
  format: "vtt" | "srt";
  label?: string;
}

export interface ScrapeResultData {
  success: boolean;
  tmdbId?: string;
  videos: ScrapedVideo[];
  subtitles: ScrapedSubtitle[];
  message?: string;
}

export async function scrapePage(url: string): Promise<ScrapeResultData> {
  try {
    let targetUrl = url;
    if (url.includes("jkanime.net")) {
      if (!url.match(/\/\d+\/?$/)) {
        targetUrl = url.endsWith("/") ? `${url}1/` : `${url}/1/`;
      }
    }

    // 1. Fetch HTML content
    const res = await externalFetch(targetUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36"
      },
      proxy: "auto"
    });

    if (!res.ok) {
      const errorHtml = await res.text().catch(() => "");
      if (res.status === 403 && looksLikeAntiBotPage(errorHtml)) {
        return {
          success: false,
          videos: [],
          subtitles: [],
          message: "Acceso bloqueado por Cloudflare/anti-bot."
        };
      }
      return {
        success: false,
        videos: [],
        subtitles: [],
        message: `HTTP Error ${res.status}: ${res.statusText}`
      };
    }

    const html = await res.text();
    const $ = cheerio.load(html);

    let tmdbId: string | undefined = undefined;
    const isPageLatino = url.toLowerCase().includes("latino");
    const videos: ScrapedVideo[] = [];
    const subtitles: ScrapedSubtitle[] = [];

    if (looksLikeAntiBotPage(html)) {
      return {
        success: false,
        tmdbId,
        videos: [],
        subtitles: [],
        message: "Acceso bloqueado por Cloudflare/anti-bot."
      };
    }

    // --- Format H: CineCalidad / DooPlay player options parser ---
    // CineCalidad and other DooPlay-based WordPress sites store embed URLs in
    // li.dooplay_player_option[data-option]. Language is inferred from .pane_descripcion.
    if (url.includes("cinecalidad.am") || url.includes("cinecalidad.ec") || url.includes("cinecalidad.lol")) {
      // Detect page-level language from the panel description
      const paneDesc = $("#panel_online .pane_descripcion").text().toLowerCase();
      let pageLanguage = "LATINO"; // CineCalidad defaults to Latino
      if (paneDesc.includes("castellano") || paneDesc.includes("español")) {
        pageLanguage = "CASTELLANO";
      } else if (paneDesc.includes("subtitulado") || paneDesc.includes("sub")) {
        pageLanguage = "JAPANESE";
      } else if (paneDesc.includes("ingles") || paneDesc.includes("english")) {
        pageLanguage = "ENGLISH";
      }

      // Detect quality from the page
      let pageQuality = "HD";
      const qualityText = $(".single-calidad").text().toLowerCase();
      if (qualityText.includes("4k") || qualityText.includes("2160")) {
        pageQuality = "4K";
      } else if (qualityText.includes("full hd") || qualityText.includes("1080")) {
        pageQuality = "1080p";
      } else if (qualityText.includes("720")) {
        pageQuality = "720p";
      }

      $("li.dooplay_player_option").each((_, el) => {
        const embedUrl = $(el).attr("data-option");
        const label = $(el).text().trim().toLowerCase();
        if (!embedUrl || embedUrl.includes("youtube.com") || embedUrl.includes("youtu.be")) {
          return; // skip trailers
        }
        // Per-option language override (some sites show multiple language options)
        let lang = pageLanguage;
        if (label.includes("latino") || label.includes("lat")) lang = "LATINO";
        else if (label.includes("castellano") || label.includes("español")) lang = "CASTELLANO";
        else if (label.includes("sub") || label.includes("subtitulado")) lang = "JAPANESE";
        else if (label.includes("ingles") || label.includes("english")) lang = "ENGLISH";

        videos.push({
          url: embedUrl,
          language: normalizeLanguage(lang),
          quality: pageQuality
        });
      });
    }

    // --- Format J: Gnula / DooPlay-style player parser ---
    if (url.includes("wnv5.gnula.cc")) {
      let pageLanguage = detectLanguageFromContext(html, url, "LATINO");
      const lowerText = $.text().toLowerCase();
      if (lowerText.includes("latino")) pageLanguage = "LATINO";
      else if (lowerText.includes("castellano") || lowerText.includes("español")) pageLanguage = "CASTELLANO";
      else if (lowerText.includes("subtitulado")) pageLanguage = "JAPANESE";

      const addGnulaVideo = (rawUrl: string | undefined | null, label: string = "") => {
        if (!rawUrl || rawUrl.includes("youtube.com") || rawUrl.includes("youtu.be")) return;
        const cleanUrl = rawUrl.replace(/\\/g, "").trim();
        if (!cleanUrl || isUnsafeIframeHost(cleanUrl) || (!isCleanPlaybackUrl(cleanUrl) && !isResolvableEmbedUrl(cleanUrl))) return;
        const lowerLabel = label.toLowerCase();
        let language = pageLanguage;
        if (lowerLabel.includes("latino")) language = "LATINO";
        else if (lowerLabel.includes("castellano") || lowerLabel.includes("español")) language = "CASTELLANO";
        else if (lowerLabel.includes("sub")) language = "JAPANESE";

        videos.push({
          url: cleanUrl.startsWith("//") ? `https:${cleanUrl}` : cleanUrl,
          language: normalizeLanguage(language),
          quality: "HD"
        });
      };

      $("li.dooplay_player_option, li[data-option], .dooplay_player_option").each((_, el) => {
        const label = $(el).text().trim();
        addGnulaVideo($(el).attr("data-option"), label);
      });

      $("iframe").each((_, el) => {
        addGnulaVideo($(el).attr("src"), $(el).attr("title") || "");
      });

      const streamRegex = /(https?:\\?\/\\?\/[^\s'"<>]+?(?:\.m3u8|\.mp4|\/embed\/|\/e\/|embed-[a-zA-Z0-9_-]+)[^\s'"<>]*)/g;
      let streamMatch;
      while ((streamMatch = streamRegex.exec(html)) !== null) {
        addGnulaVideo(streamMatch[1], "Latino");
      }

      const ajaxOptions: Array<{ post: string; nume: string; type: string; label: string }> = [];
      $("li.dooplay_player_option[data-post][data-nume][data-type]").each((_, el) => {
        const post = $(el).attr("data-post");
        const nume = $(el).attr("data-nume");
        const type = $(el).attr("data-type");
        if (post && nume && type) {
          ajaxOptions.push({ post, nume, type, label: $(el).text().trim() });
        }
      });

      for (const option of ajaxOptions.slice(0, 8)) {
        try {
          const ajaxRes = await externalFetch("https://wnv5.gnula.cc/wp-admin/admin-ajax.php", {
            method: "POST",
            proxy: "auto",
            timeoutMs: 8000,
            headers: {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
              "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
              "X-Requested-With": "XMLHttpRequest",
              "Referer": targetUrl,
            },
            body: new URLSearchParams({
              action: "doo_player_ajax",
              post: option.post,
              nume: option.nume,
              type: option.type,
            }),
          });
          if (!ajaxRes.ok) continue;
          const ajaxText = await ajaxRes.text();
          try {
            const json = JSON.parse(ajaxText);
            addGnulaVideo(json.embed_url || json.iframe || json.url, option.label);
          } catch {
            const embedMatch = ajaxText.match(/https?:\\?\/\\?\/[^\s'"<>]+/);
            addGnulaVideo(embedMatch?.[0], option.label);
          }
        } catch (err) {
          console.warn("Failed to load Gnula player option:", err);
        }
      }
    }

    // --- Format K: Doramasflix static/Next pages ---
    // Doramasflix renders provider embeds into movie and episode HTML. Keep
    // this conservative and let playbackUrlPolicy reject noisy hosts.
    if (url.includes("doramasflix.in")) {
      const pageLanguage = normalizeLanguage(detectLanguageFromContext(html, url, "JAPANESE"));
      const seen = new Set<string>();
      const addDoramasFlixVideo = (rawUrl: string | undefined | null, label: string = "") => {
        if (!rawUrl || rawUrl.includes("youtube.com") || rawUrl.includes("youtu.be")) return;
        const cleanUrl = rawUrl.replace(/\\/g, "").trim();
        if (!cleanUrl || seen.has(cleanUrl)) return;
        if (isUnsafeIframeHost(cleanUrl) || (!isCleanPlaybackUrl(cleanUrl) && !isResolvableEmbedUrl(cleanUrl))) return;

        const lowerLabel = label.toLowerCase();
        const language = normalizeLanguage(
          lowerLabel.includes("latino")
            ? "LATINO"
            : lowerLabel.includes("castellano")
              ? "CASTELLANO"
              : lowerLabel.includes("english") || lowerLabel.includes("ingles")
                ? "ENGLISH"
                : pageLanguage
        );

        seen.add(cleanUrl);
        videos.push({
          url: cleanUrl.startsWith("//") ? `https:${cleanUrl}` : cleanUrl,
          language,
          quality: normalizeQuality("HD")
        });
      };

      $("iframe").each((_, el) => {
        addDoramasFlixVideo($(el).attr("src"), $(el).attr("title") || $(el).attr("aria-label") || "");
      });

      const embedRegex = /(https?:\\?\/\\?\/[^\s'"<>]+?(?:\/embed\/|\/e\/|embed-[a-zA-Z0-9_-]+)[^\s'"<>]*)/g;
      let embedMatch;
      while ((embedMatch = embedRegex.exec(html)) !== null) {
        addDoramasFlixVideo(embedMatch[1], "");
      }
    }

    // --- Format L: CineHDPlus series/movie pages ---
    if (url.includes("cinehdplus.zone") || url.includes("cinehdplus.biz")) {
      const hash = url.includes("#") ? url.slice(url.indexOf("#") + 1) : "";
      const seasonFromHash = hash.match(/(?:^|&)s=(\d+)/)?.[1];
      const episodeFromHash = hash.match(/(?:^|&)e=(\d+)/)?.[1];
      const tmdbRaw = html.match(/var\s+tmdbRaw\s*=\s*'([^']+)'/)?.[1] || html.match(/var\s+tmdbRaw\s*=\s*"([^"]+)"/)?.[1];
      const tmdb = tmdbRaw ? tmdbRaw.split("-")[0].trim() : "";
      const title = html.match(/var\s+titolo\s*=\s*'([^']+)'/)?.[1] || $("h1[itemprop='name'], h1").first().text().replace(/^Ver\s+(?:serie|película|pelicula)\s+/i, "").replace(/\s+Online.*$/i, "").trim();

      const addCineHdPlusVideo = (rawUrl: string | undefined | null, label: string = "Latino") => {
        if (!rawUrl || rawUrl.includes("youtube.com") || rawUrl.includes("youtu.be")) return;
        const cleanUrl = rawUrl.replace(/\\/g, "").trim();
        if (!cleanUrl || isUnsafeIframeHost(cleanUrl) || (!isCleanPlaybackUrl(cleanUrl) && !isResolvableEmbedUrl(cleanUrl))) return;
        videos.push({
          url: cleanUrl.startsWith("//") ? `https:${cleanUrl}` : cleanUrl,
          language: normalizeLanguage(label),
          quality: normalizeQuality("HD")
        });
      };

      if (tmdb && seasonFromHash && episodeFromHash) {
        const viewKey = html.match(/[?&]view_key=([A-Za-z0-9_-]+)/)?.[1];
        const dynamicTitle = html.match(/var\s+title\s*=\s*['"]([^'"]+)['"]/)?.[1] || title;
        if (viewKey && /vimeus\.com\/e\/serie/i.test(html)) {
          const params = new URLSearchParams({
            tmdb,
            view_key: viewKey,
            se: seasonFromHash,
            ep: episodeFromHash,
            title: dynamicTitle,
            theme: "minimal",
          });
          addCineHdPlusVideo(`https://vimeus.com/e/serie?${params.toString()}`, "Latino");
        }
        const episodeLink = $(`#serie-${seasonFromHash}_${episodeFromHash}`).first();
        const episodeRow = episodeLink.closest("li");
        addCineHdPlusVideo(episodeLink.attr("data-link"), "Latino");
        episodeRow.find("[data-link]").each((_, el) => {
          addCineHdPlusVideo($(el).attr("data-link"), $(el).text() || "Latino");
        });
      } else {
        $("iframe").each((_, el) => {
          addCineHdPlusVideo($(el).attr("src"), $(el).attr("title") || "");
        });

        $("[data-link]").each((_, el) => {
          addCineHdPlusVideo($(el).attr("data-link"), $(el).text());
        });
      }
    }

    // --- Format M: Full Online / Pelis Juanita movie and episode pages ---
    if (isPelisJuanitaUrl(url)) {
      const metaTmdb = $("meta[name='tmdb-id']").attr("content");
      if (metaTmdb) {
        tmdbId = metaTmdb.trim();
      }
      videos.push(...extractPelisJuanitaStreamRows(html));
    }

    // --- Format H: PelisFlix player options parser ---
    if (isPelisFlixUrl(url)) {
      videos.push(...extractPelisFlixStreamRows(html));
    }

    // --- Format G: Cuevana3 player options tab parser ---
    if (url.includes("cuevana3.cl") || url.includes("cuevana3i.you") || url.includes("cuevana3.ch") || url.includes("cuevana3")) {
      const key = "a45f04ce-2394-47c3-b718-0ecd97ce51d6";
      const cuevanaServers: Record<string, string> = {
        "1": "https://minochinos.com/v/",
        "2": "https://filemoon.sx/e/",
        "3": "https://hanerix.com/e/",
        "4": "https://dood.li/e/"
      };

      const decryptToken = (tok: string) => {
        try {
          const slice = tok.slice(1);
          const decoded = Buffer.from(slice, "base64").toString("binary");
          let decrypted = "";
          for (let i = 0; i < decoded.length; i++) {
            decrypted += String.fromCharCode(decoded.charCodeAt(i) ^ key.charCodeAt(i % key.length));
          }
          return cuevanaServers[tok[0]] + decrypted;
        } catch (e) {
          console.error("Cuevana3 token decryption error:", e);
          return null;
        }
      };

      $(".tab-video-item").each((_, itemEl) => {
        const langText = $(itemEl).find(".tab-item-name").text().trim().toLowerCase();
        let language = "LATINO";
        if (langText.includes("subtitulado") || langText.includes("sub")) {
          language = "JAPANESE";
        } else if (langText.includes("castellano") || langText.includes("español")) {
          language = "CASTELLANO";
        } else if (langText.includes("english") || langText.includes("ingles")) {
          language = "ENGLISH";
        }

        $(itemEl).find("ul li").each((_, optEl) => {
          const dataServer = $(optEl).attr("data-server");
          if (dataServer) {
            let resolvedUrl: string | null = null;
            if (dataServer.includes("token=")) {
              const m = dataServer.match(/token=([^&]+)/);
              if (m) {
                resolvedUrl = decryptToken(m[1]);
              }
            } else if (dataServer.includes("?v=")) {
              const m = dataServer.match(/\?v=([^&]+)/);
              if (m) {
                try {
                  resolvedUrl = Buffer.from(m[1], "base64").toString("utf8");
                } catch (e) {
                  console.error("Cuevana3 base64 decode error:", e);
                }
              }
            }

            if (resolvedUrl) {
              videos.push({
                url: resolvedUrl,
                language: normalizeLanguage(language),
                quality: "HD"
              });
            }
          }
        });
      });
    }

    // --- Format A: Meta tag ---
    const metaTmdb = $('meta[name="tmdb-id"]').attr("content");
    if (metaTmdb) {
      tmdbId = metaTmdb.trim();
    }

    // --- Format B: Data attribute (any tag with data-tmdb-id) ---
    if (!tmdbId) {
      const dataAttrTmdb = $("[data-tmdb-id]").first().attr("data-tmdb-id");
      if (dataAttrTmdb) {
        tmdbId = dataAttrTmdb.trim();
      }
    }

    // --- Format C: JSON-LD or script JSON block ---
    const jsonScript = $("#badrockplyr-data, #bandrackply-data");
    if (jsonScript.length > 0) {
      try {
        const jsonContent = JSON.parse(jsonScript.text().trim());
        if (jsonContent.tmdbId) {
          tmdbId = String(jsonContent.tmdbId).trim();
        }
        if (Array.isArray(jsonContent.videos)) {
          for (const v of jsonContent.videos) {
            if (v.url) {
              videos.push({
                url: v.url,
                language: normalizeLanguage(isPageLatino ? "Latino" : (v.language || "Latino")),
                quality: normalizeQuality(v.quality || "HD")
              });
            }
          }
        }
        if (Array.isArray(jsonContent.subtitles)) {
          for (const sub of jsonContent.subtitles) {
            if (sub.url) {
              subtitles.push({
                url: sub.url,
                language: normalizeLanguage(sub.language || "Latino"),
                format: sub.format === "srt" ? "srt" : "vtt",
                label: sub.label || sub.language || "Sub"
              });
            }
          }
        }
      } catch (err) {
        console.warn("Failed to parse JSON script tag in scraper:", err);
      }
    }

    // --- Format E: Javascript var videos parser (AnimeFLV and TioAnime styles) ---
    const matchVarVideos = html.match(/var\s+videos\s*=\s*(\{[\s\S]*?\}|\[[\s\S]*?\]);/);
    if (matchVarVideos) {
      try {
        const parsed = JSON.parse(matchVarVideos[1]);
        if (Array.isArray(parsed)) {
          // TioAnime style: [ [serverName, embedUrl, ...], ... ]
          const defaultLang = isPageLatino ? "LATINO" : detectLanguageFromContext(html, url, "JAPANESE");
          for (const item of parsed) {
            if (Array.isArray(item) && item[1]) {
              const videoUrl = String(item[1]).replace(/\\/g, "").trim();
              const serverName = String(item[0] || "").toLowerCase();
              if (
                videoUrl &&
                !isUnsafeIframeHost(videoUrl) &&
                (isCleanPlaybackUrl(videoUrl) || isResolvableEmbedUrl(videoUrl))
              ) {
                let rawLang = defaultLang;
                if (serverName.includes("latino")) rawLang = "LATINO";
                if (serverName.includes("castellano")) rawLang = "CASTELLANO";
                videos.push({
                  url: videoUrl,
                  language: normalizeLanguage(rawLang),
                  quality: "HD",
                });
              }
            }
          }
        } else if (typeof parsed === "object" && parsed !== null) {
          for (const key of Object.keys(parsed)) {
            const list = parsed[key];
            if (Array.isArray(list)) {
              for (const item of list) {
                const videoUrl = item.code || item.url;
                if (videoUrl) {
                  const cleanUrl = videoUrl.replace(/\\/g, "");
                  
                  // Mapear el audio según la clave del JSON
                  let rawLang = "LATINO";
                  const upperKey = key.toUpperCase();
                  if (isPageLatino) {
                    rawLang = "LATINO";
                  } else if (upperKey === "SUB") {
                    rawLang = "JAPANESE";
                  } else if (upperKey === "LAT") {
                    rawLang = "LATINO";
                  } else if (upperKey === "ES") {
                    rawLang = "CASTELLANO";
                  } else if (upperKey === "EN") {
                    rawLang = "ENGLISH";
                  }

                  videos.push({
                    url: cleanUrl,
                    language: normalizeLanguage(rawLang),
                    quality: "HD"
                  });
                }
              }
            }
          }
        }
      } catch (err) {
        console.warn("Failed to parse var videos script:", err);
      }
    }

    // --- Format F: JKAnime video array parser ---
    const matchJkVideos = html.match(/video\[\d+\]\s*=\s*['"]<iframe[\s\S]*?src=['"]([^'"]+?)['"]/g);
    const jkLangMap = url.includes("jkanime.net") ? extractJkLanguageMap(html) : null;

    if (matchJkVideos) {
      try {
        const videoRegex = /video\[\d+\]\s*=\s*['"]<iframe[\s\S]*?src=['"]([^'"]+?)['"]/g;
        let m;
        videoRegex.lastIndex = 0;
        
        // Detect default language from JKAnime deflang options if present, or from page context
        let defaultJkLang = isPageLatino ? "LATINO" : "JAPANESE";
        if (jkLangMap) {
          const firstOpt = html.match(/<select[^>]*id=["']deflang["'][^>]*>\s*<option[^>]*value=["'](\d+)["']/i);
          if (firstOpt && jkLangMap[firstOpt[1]]) {
            defaultJkLang = jkLangMap[firstOpt[1]];
          }
        }
        const rawLang = detectLanguageFromContext(html, url, defaultJkLang);
        const detectedLang = normalizeLanguage(rawLang);

        while ((m = videoRegex.exec(html)) !== null) {
          const iframeSrc = m[1];
          if (iframeSrc) {
            const cleanUrl = iframeSrc.replace(/\\/g, "");
            const absoluteUrl = cleanUrl.startsWith("/") ? `https://jkanime.net${cleanUrl}` : cleanUrl;
            videos.push({
              url: absoluteUrl,
              language: detectedLang,
              quality: "HD"
            });
          }
        }
      } catch (err) {
        console.warn("Failed to parse JKAnime video script:", err);
      }
    }

    // --- Format I: JKAnime extra server array parser ---
    if (url.includes("jkanime.net")) {
      const serversMatch = html.match(/var\s+servers\s*=\s*(\[[\s\S]*?\]);/);
      if (serversMatch) {
        try {
          const serverList = JSON.parse(serversMatch[1]) as Array<{
            remote?: string;
            server?: string;
            lang?: number | string;
          }>;
          const fallbackLang = isPageLatino ? "LATINO" : "JAPANESE";

          for (const server of serverList) {
            if (!server.remote) continue;

            let decodedUrl = "";
            try {
              decodedUrl = Buffer.from(server.remote, "base64").toString("utf8").trim();
            } catch {
              continue;
            }

            if (!decodedUrl || decodedUrl.includes("youtube.com") || decodedUrl.includes("youtu.be")) continue;
            if (isUnsafeIframeHost(decodedUrl) || (!isCleanPlaybackUrl(decodedUrl) && !isResolvableEmbedUrl(decodedUrl))) continue;

            const serverName = (server.server || "").toLowerCase();
            let language = detectedLangFromJkLang(server.lang, fallbackLang, jkLangMap || undefined);
            if (serverName.includes("latino")) language = "LATINO";
            if (serverName.includes("castellano")) language = "CASTELLANO";

            videos.push({
              url: decodedUrl,
              language: normalizeLanguage(language),
              quality: "HD"
            });
          }
        } catch (err) {
          console.warn("Failed to parse JKAnime servers array:", err);
        }
      }
    }

    // --- Format N: MonosChinos / data-player parser ---
    $("[data-player]").each((_, el) => {
      const raw = $(el).attr("data-player")?.trim();
      if (!raw) return;

      let decodedUrl = "";
      try {
        decodedUrl = Buffer.from(raw, "base64").toString("utf-8").trim();
      } catch {
        decodedUrl = raw;
      }

      if (!decodedUrl || !decodedUrl.startsWith("http")) return;
      if (decodedUrl.startsWith("http://ok.ru/videoembed/")) {
        decodedUrl = decodedUrl.replace("http://ok.ru/videoembed/", "https://ok.ru/videoembed/");
      }
      if (isUnsafeIframeHost(decodedUrl)) return;
      if (!isCleanPlaybackUrl(decodedUrl) && !isResolvableEmbedUrl(decodedUrl) && !isSupportedEmbedUrl(decodedUrl)) return;

      const serverText = $(el).text().toLowerCase();
      let language = isPageLatino ? "LATINO" : detectLanguageFromContext(html, url, "JAPANESE");
      if (serverText.includes("latino") || url.toLowerCase().includes("audio-latino")) language = "LATINO";
      if (serverText.includes("castellano")) language = "CASTELLANO";

      videos.push({
        url: decodedUrl,
        language: normalizeLanguage(language),
        quality: "HD"
      });
    });

    // --- Format D: Video tag scanning ---
    $("video").each((_, elem) => {
      const videoEl = $(elem);
      
      // If we haven't found a tmdbId, check the video tag
      if (!tmdbId) {
        const vidTmdb = videoEl.attr("data-tmdb-id");
        if (vidTmdb) {
          tmdbId = vidTmdb.trim();
        }
      }

      // Check for sources inside video tag
      const rawLanguage = isPageLatino ? "Latino" : (videoEl.attr("data-language") || "Latino");
      const rawQuality = videoEl.attr("data-quality") || "HD";

      const sourceSrc = videoEl.find("source").attr("src");
      const videoSrc = videoEl.attr("src") || sourceSrc;

      if (videoSrc) {
        videos.push({
          url: videoSrc,
          language: normalizeLanguage(rawLanguage),
          quality: normalizeQuality(rawQuality)
        });
      }

      // Check for track tags (subtitles) inside video tag
      videoEl.find("track").each((__, trackElem) => {
        const trackEl = $(trackElem);
        const trackSrc = trackEl.attr("src");
        const trackLang = trackEl.attr("srclang") || trackEl.attr("label") || "es";
        
        if (trackSrc) {
          subtitles.push({
            url: trackSrc,
            language: normalizeLanguage(trackLang),
            format: trackSrc.endsWith(".srt") ? "srt" : "vtt",
            label: trackEl.attr("label") || "Subtitles"
          });
        }
      });
    });

    // Keep resolver-capable embed URLs as-is. The orchestrator validates them by resolving
    // once, but stores the original URL so playback can resolve a fresh token on demand.
    const resolvedVideos = videos;


    if (resolvedVideos.length === 0 && jsonScript.length === 0) {
      return {
        success: false,
        tmdbId,
        videos: [],
        subtitles,
        message: "No se encontraron etiquetas de video o scripts JSON con fuentes válidas."
      };
    }

    return {
      success: true,
      tmdbId,
      videos: resolvedVideos,
      subtitles,
      message: `Scraping exitoso: Se encontraron ${resolvedVideos.length} videos y ${subtitles.length} subtítulos.`
    };
  } catch (err: any) {
    console.error(`Error scraping URL ${url}:`, err);
    return {
      success: false,
      videos: [],
      subtitles: [],
      message: `Error al conectar o parsear la página: ${err.message || err}`
    };
  }
}
