import type { SyntheticEvent } from "react";
import { API_BASE, API_ORIGIN } from "@/lib/apiOrigin";

const proxyPath = (route: "proxy" | "remux", url: string) =>
  `${API_BASE}/media/${route}?url=${encodeURIComponent(url)}`;

/**
 * Artwork doesn't need the video proxy: browsers can display ordinary HTTPS
 * images cross-origin. Github Pages has no /api/media route; sending *every*
 * logo through it produced dozens of 404s after M3U import.
 */
export function mediaProxyUrl(url?: string | null): string | undefined {
  if (!url) return undefined;
  let parsed: URL;
  try { parsed = new URL(url); } catch { return undefined; }

  if (parsed.protocol === "https:") return parsed.toString();
  if (parsed.protocol !== "http:") return undefined;

  // Once our independent FastAPI is deployed, it can fetch HTTP artwork.
  if (API_ORIGIN) return proxyPath("proxy", url);

  // Browsers block HTTP artwork from HTTPS Pages. Try the secure version,
  // and let the image's onError handler reveal the built-in gradient fallback.
  parsed.protocol = "https:";
  return parsed.toString();
}

export function handleMediaImageError(event: SyntheticEvent<HTMLImageElement>) {
  // Prevent broken-image icons from covering the placeholder gradient.
  event.currentTarget.style.display = "none";
}

export function mediaPlaybackUrl(url: string, extension?: string | null, preferWebm = false): string {
  const path = new URL(url).pathname.toLowerCase();
  const rawTransportStream = extension?.toLowerCase() === "ts" || path.endsWith(".ts");
  const base = proxyPath(rawTransportStream ? "remux" : "proxy", url);
  return rawTransportStream && preferWebm ? `${base}&output=webm` : base;
}
