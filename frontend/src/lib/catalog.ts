import type { LuxState, MediaItem, MediaKind } from "@/lib/luxTypes";

export const CATALOG_VERSION = 3;

const LIVE_GROUP = /\b(canal|canais|ao vivo|live|pay[- ]?per[- ]?view|ppv|24h|radio)\b/;
const SERIES_GROUP = /\b(serie|series|novela|novelas|dorama|doramas|temporada|temporadas|episodio|episodios|anime|animes)\b/;
const MOVIE_GROUP = /\b(filme|filmes|movie|movies|cinema|vod|acao|animacao|aventura|comedia|crime|documentario|documentarios|drama|fantasia|faroeste|ficcao|infantil|lancamento|lancamentos|nacional|nacionais|romance|suspense|terror)\b/;
const VOD_EXTENSIONS = new Set(["mp4", "mkv", "avi", "mov", "m4v", "webm"]);

function normalized(value: string) {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

function extensionOf(url: string) {
  const path = url.split(/[?#]/, 1)[0].toLowerCase();
  const filename = path.slice(path.lastIndexOf("/") + 1);
  return filename.includes(".") ? filename.slice(filename.lastIndexOf(".") + 1) : "";
}

export function parseEpisodeMetadata(title: string) {
  const standard = title.match(/\b(?:s|t)(\d{1,2})\s*[-_. ]*e(?:p)?\s*(\d{1,3})\b/i);
  if (standard) return { season: Number(standard[1]), episode: Number(standard[2]) };
  const alternate = title.match(/(?:^|\s)(\d{1,2})x(\d{2})\s*$/i);
  return alternate ? { season: Number(alternate[1]), episode: Number(alternate[2]) } : { season: null, episode: null };
}

export function seriesTitleFromTitle(title: string) {
  const withoutStandard = title.replace(/\s*(?:[-–—:|]\s*)?(?:s|t)\d{1,2}\s*[-_. ]*e(?:p)?\s*\d{1,3}\b.*$/i, "").trim();
  const withoutAlternate = withoutStandard.replace(/\s+\d{1,2}x\d{2}\s*$/i, "").trim();
  return withoutAlternate || title.trim();
}

export function classifyMediaKind(title: string, group: string, url: string): MediaKind {
  const cleanGroup = normalized(group);
  const extension = extensionOf(url);
  const episode = parseEpisodeMetadata(title);

  // Provider channel groups and continuous transport streams are always live,
  // even when a channel name happens to contain S01/E01 or "TV".
  if (LIVE_GROUP.test(cleanGroup) || extension === "ts") return "live";
  if (episode.season !== null && episode.episode !== null) return "series";
  if (SERIES_GROUP.test(cleanGroup)) return "series";
  if (MOVIE_GROUP.test(cleanGroup)) return "movie";
  if (extension === "m3u8") return "live";
  if (VOD_EXTENSIONS.has(extension)) return "movie";
  return "movie";
}

export async function migrateLuxCatalog(state: LuxState): Promise<{ state: LuxState; changed: boolean }> {
  if (state.catalogVersion === CATALOG_VERSION) return { state, changed: false };
  let changed = state.catalogVersion !== CATALOG_VERSION;
  const media: MediaItem[] = new Array(state.media.length);

  for (let index = 0; index < state.media.length; index += 1) {
    const item = state.media[index];
    const kind = classifyMediaKind(item.title, item.group, item.streamUrl);
    const episode = kind === "series" ? parseEpisodeMetadata(item.title) : { season: null, episode: null };
    const seriesTitle = kind === "series" ? seriesTitleFromTitle(item.title) : null;
    const itemChanged = kind !== item.kind || episode.season !== (item.season ?? null) || episode.episode !== (item.episode ?? null) || seriesTitle !== (item.seriesTitle ?? null);
    media[index] = itemChanged ? { ...item, kind, season: episode.season, episode: episode.episode, seriesTitle } : item;
    changed ||= itemChanged;
    if (index > 0 && index % 2000 === 0) await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
  }

  return { state: { ...state, media, catalogVersion: CATALOG_VERSION }, changed };
}