import { API_BASE } from "@/lib/apiOrigin";

const proxyPath = (route: "proxy" | "remux", url: string) =>
  `${API_BASE}/media/${route}?url=${encodeURIComponent(url)}`;

export function mediaProxyUrl(url?: string | null): string | undefined {
  if (!url || !/^https?:\/\//i.test(url)) return url || undefined;
  return proxyPath("proxy", url);
}

export function mediaPlaybackUrl(url: string, extension?: string | null, preferWebm = false): string {
  const path = new URL(url).pathname.toLowerCase();
  const rawTransportStream = extension?.toLowerCase() === "ts" || path.endsWith(".ts");
  const base = proxyPath(rawTransportStream ? "remux" : "proxy", url);
  return rawTransportStream && preferWebm ? `${base}&output=webm` : base;
}