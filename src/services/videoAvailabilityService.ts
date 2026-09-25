import { externalFetch } from "@/lib/httpClient";
import { validateHlsUrl } from "@/services/hlsValidator";

export async function checkVideoAvailability(url: string): Promise<"ONLINE" | "OFFLINE"> {
  // If url is a mock demo URL or a relative path, we consider it ONLINE immediately
  if (url.includes("demo-") || url.includes("/videos/")) {
    return "ONLINE";
  }

  if (url.toLowerCase().includes(".m3u8")) {
    return (await validateHlsUrl(url)) ? "ONLINE" : "OFFLINE";
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000); // 6s timeout

    const isEmbedUrl = !url.toLowerCase().includes(".m3u8") && !url.toLowerCase().includes(".mp4");

    // 1. For direct media streams, attempt HEAD request first
    if (!isEmbedUrl) {
      try {
        const headRes = await externalFetch(url, {
          method: "HEAD",
          signal: controller.signal,
          proxy: "auto"
        });
        clearTimeout(timeoutId);

        if (headRes.status === 200 || headRes.status === 206 || headRes.status === 304) {
          return "ONLINE";
        }
      } catch (e) {
        // HEAD failed, fall back to partial GET
      }
    }

    // 2. Attempt GET request (partial or full HTML for embed pages)
    const getController = new AbortController();
    const getTimeoutId = setTimeout(() => getController.abort(), 6000);
    
    const getRes = await externalFetch(url, {
      method: "GET",
      headers: isEmbedUrl
        ? { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" }
        : { Range: "bytes=0-1024" },
      signal: getController.signal,
      proxy: isEmbedUrl ? "never" : "auto"
    });
    clearTimeout(getTimeoutId);

    if (getRes.status === 200 || getRes.status === 206 || getRes.status === 304) {
      if (isEmbedUrl) {
        const html = await getRes.text();
        const htmlLower = html.toLowerCase();
        const deletionIndicators = [
          "file not found",
          "file_not_found",
          "file was deleted",
          "no longer available",
          "no longer exists",
          "has been removed",
          "video not found",
          "invalid link",
          "decryption error",
          "video no disponible",
          "video no encontrado",
          "video has been blocked",
          "copyright claim",
          "copyright infringement",
          "copyright violation",
          "due to copyright",
          "copyright takedown",
          "reclamacion de copyright",
          "derechos de autor",
          "expired or has been deleted",
          "el archivo fue borrado",
          "archivo no encontrado",
          "video eliminado"
        ];
        if (deletionIndicators.some((indicator) => htmlLower.includes(indicator))) {
          console.log(`[checkVideoAvailability] Detected deleted/blocked video on host for: ${url}`);
          return "OFFLINE";
        }
      }
      return "ONLINE";
    }

    return "OFFLINE";
  } catch (error) {
    console.warn(`Video availability check failed for URL: ${url}`, error);
    return "OFFLINE";
  }
}
