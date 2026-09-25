import { NextRequest, NextResponse } from "next/server";
import { externalFetch } from "@/lib/httpClient";
import { assertAllowedExternalUrl, getProxyableEmbedUrl } from "@/lib/urlPolicy";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const url = searchParams.get("url");

    if (!url) {
      return new NextResponse("Missing url parameter", { status: 400 });
    }

    await assertAllowedExternalUrl(url);
    if (!getProxyableEmbedUrl(url)) {
      return new NextResponse("URL is not proxyable", { status: 400 });
    }

    const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
    
    // 1. Fetch the page following JS redirects to find the active domain
    async function fetchWithJsRedirect(targetUrl: string, depth: number = 0): Promise<{ html: string, url: string } | null> {
      if (depth > 5) return null;
      
      const res = await externalFetch(targetUrl, {
        headers: {
          "User-Agent": ua,
          "Referer": "https://www.cinecalidad.am/"
        },
        timeoutMs: 8000,
        proxy: "auto"
      });
      if (!res.ok) return null;
      const html = await res.text();
      
      const redirectMatch = html.match(/window\.location\.href\s*=\s*'([^']+)'/) ||
                            html.match(/window\.location\.replace\(\s*'([^']+)'\s*\)/);
      if (redirectMatch) {
        return fetchWithJsRedirect(redirectMatch[1], depth + 1);
      }
      
      return { html, url: targetUrl };
    }

    const targetPage = await fetchWithJsRedirect(url);
    if (!targetPage) {
      return new NextResponse("Failed to fetch target page", { status: 500 });
    }

    const urlObj = new URL(targetPage.url);
    const origin = urlObj.origin; // e.g. https://lindalastattack.com
    const isUnlimplay = urlObj.hostname === "unlimplay.com" || urlObj.hostname.endsWith(".unlimplay.com");

    let html = targetPage.html;

    // 2. Rewrite relative paths to absolute URLs pointing to Voe's active domain
    // Match src="/..." or href="/..." where the path is relative
    html = html.replace(/(href|src|action)="\/(?!\/)([^"]*?)"/gi, `$1="${origin}/$2"`);
    html = html.replace(/(href|src|action)='\/(?!\/)([^']*?)'/gi, `$1='${origin}/$2'`);

    // 3. Block popups and window.open calls
    const popupBlockerScript = `
      <script>
        (function() {
          // Block window.open
          window.open = function() { 
            console.log("[Proxy Embed] Blocked popup (window.open)"); 
            return {
              focus: function() {},
              blur: function() {},
              close: function() {}
            }; 
          };
          
          // Disable alert/confirm if used for ads
          window.alert = function() {};
          window.confirm = function() { return false; };
          window.sandboxDetector = function() {};
          window.showSandbox = function() {};
          
          // Block popups manager in Voe (which is assigned to window.c5022... or window.b744...)
          // We can prevent the ad script from running by overriding functions
          Object.defineProperty(window, 'sk', {
            get: () => true,
            set: () => {},
            configurable: false
          });
        })();
      </script>
    `;
    
    // Inject popup blocker right after <head> or at the beginning of HTML
    html = html.replace("<head>", `<head>${popupBlockerScript}`);
    html = html.replace(/\bsandboxDetector\s*\(\s*\)\s*;?/gi, "");
    html = html.replace(/\bshowSandbox\s*\(\s*\)\s*;?/gi, "");
    html = html.replace(/top\.location/gi, "window.location");
    html = html.replace(/parent\.location/gi, "window.location");

    if (isUnlimplay) {
      html = html
        .replace(/<script\s+type=["']importmap["'][^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<script\s+type=["']module["'][^>]*>[\s\S]*?p2p-media-loader[\s\S]*?<\/script>/gi, "");

      const disableP2pScript = `
        <script>
          Object.defineProperty(window, "HlsWithP2P", {
            configurable: true,
            get: function() { return window.Hls; },
            set: function() {}
          });
        </script>
      `;
      html = html.replace("</head>", `${disableP2pScript}</head>`);

      const playerScriptTags = Array.from(html.matchAll(/<script[^>]+src=["']([^"']*player[^"']*\.js)["'][^>]*><\/script>/gi));
      for (const match of playerScriptTags) {
        const scriptUrl = new URL(match[1], origin).toString();
        try {
          const scriptResponse = await externalFetch(scriptUrl, {
            headers: {
              "User-Agent": ua,
              "Referer": targetPage.url,
            },
            timeoutMs: 8000,
            proxy: "auto",
          });
          if (!scriptResponse.ok) continue;
          let script = await scriptResponse.text();
          script = script
            .replace(/\bsandboxDetector\s*\(\s*\)\s*;?/gi, "")
            .replace(/\bshowSandbox\s*\(\s*\)\s*;?/gi, "")
            .replace(/top\.location/gi, "window.location")
            .replace(/parent\.location/gi, "window.location")
            .replace(/<\/script/gi, "<\\/script");
          html = html.replace(match[0], `<script>${script}</script>`);
        } catch (error) {
          console.warn(`[proxy-embed] Failed to inline Unlimplay player script: ${scriptUrl}`, error);
        }
      }
    }

    // 4. Strip known popunder / ad networks scripts entirely
    html = html.replace(/<script[^>]*src="[^"]*?(?:cactusheadroomscaling|annihilativefaltermillion|ciderconcluded|popunder|clickunder|adsystem)[^"]*?"[^>]*><\/script>/gi, "");
    
    // Remove inline scripts containing ad network setup (e.g. f98a024e.add)
    html = html.replace(/<script[^>]*>(?:(?!<\/script>)[\s\S])*?(?:f98a024e\.add|\.config\(|ignoreTo)(?:(?!<\/script>)[\s\S])*?<\/script>/gi, "<!-- Stripped Ad Script -->");

    return new NextResponse(html, {
      headers: {
        "Content-Type": "text/html",
        "X-Frame-Options": "ALLOWALL",
        "Access-Control-Allow-Origin": "*"
      }
    });

  } catch (error: any) {
    console.error("Error in proxy-embed:", error);
    return new NextResponse("Error rendering embed", { status: 500 });
  }
}
