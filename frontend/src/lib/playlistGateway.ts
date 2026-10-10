import { apiGetStream } from "@/lib/api";

/**
 * Temporary no-login M3U gateway. Set by the GitHub Pages workflow;
 * in local development the original FastAPI /api route remains available.
 *
 * The source URL is POSTed in JSON, not included in the request URL
 * or in GitHub/public configuration.
 */
export async function importRemotePlaylist(sourceUrl: string): Promise<ReadableStream<Uint8Array>> {
  const gateway = (import.meta.env.VITE_M3U_GATEWAY_URL || "").trim();
  if (!gateway) {
    return apiGetStream(`/playlists/proxy?url=${encodeURIComponent(sourceUrl)}`);
  }

  const response = await fetch(gateway, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: sourceUrl }),
  });
  if (!response.ok) {
    const data: { error?: string } | null = await response.json().catch(() => null);
    throw new Error(data?.error || `Servidor de listas respondeu HTTP ${response.status}.`);
  }
  if (!response.body) throw new Error("O servidor não devolveu dados da playlist.");
  return response.body;
}
