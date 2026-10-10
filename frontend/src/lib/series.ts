import { parseEpisodeMetadata, seriesTitleFromTitle } from "@/lib/catalog";
import type { MediaItem } from "@/lib/luxTypes";

export interface SeriesGroup {
  id: string;
  title: string;
  group: string;
  poster?: string | null;
  logo?: string | null;
  seasons: number[];
  episodes: MediaItem[];
  representative: MediaItem;
}

export interface SeriesCollection {
  groups: SeriesGroup[];
  byEpisodeId: Map<string, SeriesGroup>;
  byRepresentativeId: Map<string, SeriesGroup>;
}

function canonical(value: string) {
  return value
    .replace(/\s*\(\d{4}\)\s*$/, "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function stableId(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `series-${(hash >>> 0).toString(36)}`;
}

export function buildSeriesCollection(items: MediaItem[]): SeriesCollection {
  const buckets = new Map<string, { title: string; items: MediaItem[] }>();
  for (const item of items) {
    if (item.kind !== "series") continue;
    const title = item.seriesTitle || seriesTitleFromTitle(item.title);
    const key = canonical(title) || canonical(item.title) || item.id;
    const bucket = buckets.get(key);
    if (bucket) bucket.items.push(item);
    else buckets.set(key, { title, items: [item] });
  }

  const groups: SeriesGroup[] = [];
  const byEpisodeId = new Map<string, SeriesGroup>();
  const byRepresentativeId = new Map<string, SeriesGroup>();

  for (const [key, bucket] of buckets) {
    const unique = new Map<string, MediaItem>();
    for (const item of bucket.items) {
      const metadata = parseEpisodeMetadata(item.title);
      const episodeKey = metadata.season !== null && metadata.episode !== null
        ? `${metadata.season}:${metadata.episode}`
        : canonical(item.title) || item.id;
      const current = unique.get(episodeKey);
      if (!current || (!(current.poster || current.logo) && (item.poster || item.logo))) unique.set(episodeKey, item);
    }
    const episodes = [...unique.values()].sort((first, second) => {
      const firstMeta = parseEpisodeMetadata(first.title);
      const secondMeta = parseEpisodeMetadata(second.title);
      return (firstMeta.season ?? 1) - (secondMeta.season ?? 1)
        || (firstMeta.episode ?? 0) - (secondMeta.episode ?? 0)
        || first.title.localeCompare(second.title, "pt-BR");
    });
    const representative = episodes.find((item) => item.poster || item.logo) ?? episodes[0];
    if (!representative) continue;
    const seasons = [...new Set(episodes.map((item) => parseEpisodeMetadata(item.title).season ?? 1))].sort((a, b) => a - b);
    const group: SeriesGroup = {
      id: stableId(key),
      title: bucket.title,
      group: representative.group,
      poster: representative.poster,
      logo: representative.logo,
      seasons,
      episodes,
      representative,
    };
    groups.push(group);
    for (const item of bucket.items) byEpisodeId.set(item.id, group);
    byRepresentativeId.set(representative.id, group);
  }

  groups.sort((first, second) => first.title.localeCompare(second.title, "pt-BR", { numeric: true }));
  return { groups, byEpisodeId, byRepresentativeId };
}

export function seriesCard(group: SeriesGroup): MediaItem {
  return {
    ...group.representative,
    title: group.title,
    group: `${group.seasons.length} temporada${group.seasons.length === 1 ? "" : "s"} · ${group.episodes.length} episódio${group.episodes.length === 1 ? "" : "s"}`,
    seriesTitle: group.title,
  };
}