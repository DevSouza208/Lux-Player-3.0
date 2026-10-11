import { API_BASE } from "@/lib/apiOrigin";

/**
 * M3U import via Render: FastAPI streams the provider response directly to the
 * browser in chunks, with zero disk/R2 persistence or full-file buffering.
 * Provider credentials stay in the POST body instead of the API request URL.
 */
export async function importRemotePlaylist(sourceUrl: string): Promise<ReadableStream<Uint8Array>> {
  const response = await fetch(`${API_BASE}/playlists/proxy`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: sourceUrl }),
  });
  if (!response.ok) {
    const payload: { detail?: string | { msg?: string }[] } | null = await response.json().catch(() => null);
    const message = typeof payload?.detail === "string"
      ? payload.detail
      : `Importação indisponível (HTTP ${response.status}).`;
    throw new Error(message);
  }
  if (!response.body) throw new Error("O servidor não disponibilizou a playlist em streaming.");
  return response.body;
}
