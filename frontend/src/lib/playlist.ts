import type { MediaItem, MediaKind, PlaylistItemResponse } from "@/lib/luxTypes";
import { createLocalId } from "@/lib/storage";
import { classifyMediaKind, parseEpisodeMetadata, seriesTitleFromTitle } from "@/lib/catalog";

function attributes(line: string) {
  return Object.fromEntries([...line.matchAll(/([\w-]+)="([^"]*)"/g)].map((match) => [match[1].toLowerCase(), match[2]]));
}

function mediaItem(title: string, streamUrl: string, group: string, metadata: Record<string, string>, playlistId: string): MediaItem {
  const kind = classifyMediaKind(title, group, streamUrl);
  const episode = parseEpisodeMetadata(title);
  return { id: createLocalId("media"), title, streamUrl, kind, group, logo: metadata["tvg-logo"] || metadata.logo || null, poster: metadata["tvg-logo"] || metadata.poster || null, season: episode.season, episode: episode.episode, seriesTitle: kind === "series" ? seriesTitleFromTitle(title) : null, playlistId };
}

export function parseM3U(text: string, playlistId: string): MediaItem[] {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const items: MediaItem[] = [];
  let pendingAttributes: Record<string, string> = {};
  let pendingTitle = "";
  for (const line of lines) {
    if (line.startsWith("#EXTINF")) {
      pendingAttributes = attributes(line);
      pendingTitle = line.includes(",") ? line.slice(line.indexOf(",") + 1).trim() : "";
      continue;
    }
    if (line.startsWith("#")) continue;
    const title = pendingAttributes["tvg-name"] || pendingTitle || line.split("/").pop() || "Sem título";
    const group = pendingAttributes["group-title"] || pendingAttributes.group || "";
    items.push(mediaItem(title, line, group, pendingAttributes, playlistId));
    pendingAttributes = {};
    pendingTitle = "";
  }
  return items;
}

export async function parseM3UAsync(text: string, playlistId: string): Promise<MediaItem[]> {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const items: MediaItem[] = [];
  let pendingAttributes: Record<string, string> = {};
  let pendingTitle = "";
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.startsWith("#EXTINF")) {
      pendingAttributes = attributes(line);
      pendingTitle = line.includes(",") ? line.slice(line.indexOf(",") + 1).trim() : "";
    } else if (!line.startsWith("#")) {
      const title = pendingAttributes["tvg-name"] || pendingTitle || line.split("/").pop() || "Sem título";
      const group = pendingAttributes["group-title"] || pendingAttributes.group || "";
      items.push(mediaItem(title, line, group, pendingAttributes, playlistId));
      pendingAttributes = {};
      pendingTitle = "";
    }
    if (index > 0 && index % 500 === 0) await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
  }
  return items;
}

export async function parseM3UStream(stream: ReadableStream<Uint8Array>, playlistId: string): Promise<{ items: MediaItem[]; truncated: boolean }> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  const items: MediaItem[] = [];
  const maxItems = 500000;
  let buffer = "";
  let pendingAttributes: Record<string, string> = {};
  let pendingTitle = "";
  let truncated = false;
  const consumeLine = (line: string) => {
    const normalized = line.trim();
    if (!normalized) return;
    if (normalized.startsWith("#EXTINF")) {
      pendingAttributes = attributes(normalized);
      pendingTitle = normalized.includes(",") ? normalized.slice(normalized.indexOf(",") + 1).trim() : "";
    } else if (!normalized.startsWith("#")) {
      if (items.length >= maxItems) { truncated = true; return; }
      const title = pendingAttributes["tvg-name"] || pendingTitle || normalized.split("/").pop() || "Sem título";
      const group = pendingAttributes["group-title"] || pendingAttributes.group || "";
      items.push(mediaItem(title, normalized, group, pendingAttributes, playlistId));
      pendingAttributes = {};
      pendingTitle = "";
    }
  };
  while (true) {
    const result = await reader.read();
    buffer += decoder.decode(result.value, { stream: !result.done });
    let lineBreak = buffer.indexOf("\n");
    let processed = 0;
    while (lineBreak >= 0) {
      consumeLine(buffer.slice(0, lineBreak));
      buffer = buffer.slice(lineBreak + 1);
      lineBreak = buffer.indexOf("\n");
      processed += 1;
    }
    if (processed > 0) await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
    if (truncated) { await reader.cancel(); break; }
    if (result.done) { if (buffer) consumeLine(buffer); break; }
  }
  return { items, truncated };
}

export function normalizeRemoteItems(items: PlaylistItemResponse[], playlistId: string): MediaItem[] {
  return items.map((item) => ({
    id: createLocalId("media"),
    title: item.title,
    streamUrl: item.stream_url,
    kind: item.kind,
    group: item.group,
    logo: item.logo,
    poster: item.poster,
    season: item.season,
    episode: item.episode,
    seriesTitle: item.kind === "series" ? seriesTitleFromTitle(item.title) : null,
    description: item.description,
    containerExtension: item.container_extension,
    playlistId,
  }));
}

export const formatTime = (seconds: number) => {
  if (!Number.isFinite(seconds)) return "00:00";
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.floor(seconds % 60);
  return `${minutes >= 60 ? `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}` : String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
};