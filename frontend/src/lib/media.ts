import type { SyntheticEvent } from "react";
import { API_BASE, API_ORIGIN } from "@/lib/apiOrigin";

const proxyPath = (route: "proxy" | "remux", url: string) =>
  `${API_BASE}/media/${route}?url=${encodeURIComponent(url)}`;

/** Prefer direct HTTPS images (fast, zero backend bandwidth).
 * HTTP artwork must go through HTTPS proxy when backend exists.
 */
export function mediaProxyUrl(url?: string | null): string | undefined {
  if (!url) return undefined;
  let parsed: URL;
  try { parsed = new URL(url); } catch { return undefined; }

  if (parsed.protocol === "https:") return parsed.toString();
  if (parsed.protocol !== "http:") return undefined;

  if (API_ORIGIN) return proxyPath("proxy", url);

  // Last-resort secure upgrade when no backend is configured.
  parsed.protocol = "https:";
  return parsed.toString();
}

/** An origin with an expired/untrusted TLS certificate is not accessible
 * to the browser, but our media backend can fetch it. Retry only once,
 * then reveal the card's gradient when the upstream image is unavailable.
 */
export function handleMediaImageError(event: SyntheticEvent<HTMLImageElement>) {
  const img = event.currentTarget;
  const failedUrl = img.currentSrc || img.src;
  if (API_ORIGIN && img.dataset.luxProxyAttempted !== "yes") {
    try {
      const failed = new URL(failedUrl);
      if (failed.protocol === "https:" && failed.origin !== API_ORIGIN) {
        img.dataset.luxProxyAttempted = "yes";
        img.src = proxyPath("proxy", failed.toString());
        return;
      }
    } catch { /* Invalid artwork URLs should use the gradient. */ }
  }
  img.style.display = "none";
}

/** Long-form VOD fallback for MKV/AVI/HEVC. Requires the independent API
 * to include /api/media/vod; never route live-TV MPEG-TS through here.
 */
export const VOD_API_ORIGIN = (import.meta.env.VITE_VOD_API_ORIGIN || API_ORIGIN).trim().replace(/\\/+$/, "");

export function mediaVodFallbackUrl(url: string): string {
  return `${VOD_API_ORIGIN}/api/media/vod?url=${encodeURIComponent(url)}`;
}

export function mediaPlaybackUrl(url: string, extension?: string | null, preferWebm = false): string {
  const path = new URL(url).pathname.toLowerCase();
  const rawTransportStream = extension?.toLowerCase() === "ts" || path.endsWith(".ts");
  const base = proxyPath(rawTransportStream ? "remux" : "proxy", url);
  return rawTransportStream && preferWebm ? `${base}&output=webm` : base;
}
