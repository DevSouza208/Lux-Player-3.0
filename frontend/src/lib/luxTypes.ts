export type MediaKind = "live" | "movie" | "series";

export interface MediaItem {
  id: string;
  title: string;
  streamUrl: string;
  kind: MediaKind;
  group: string;
  logo?: string | null;
  poster?: string | null;
  season?: number | null;
  episode?: number | null;
  seriesTitle?: string | null;
  description?: string | null;
  containerExtension?: string | null;
  playlistId: string;
}

export interface PlaylistRecord {
  id: string;
  name: string;
  sourceType: "file" | "url" | "xstream";
  importedAt: string;
  itemCount: number;
}

export interface Profile {
  id: string;
  name: string;
  avatar: string;
  pin?: string;
}

export interface WatchProgress {
  position: number;
  duration: number;
  updatedAt: string;
}

export interface LuxState {
  catalogVersion: number;
  profiles: Profile[];
  activeProfileId: string | null;
  playlists: PlaylistRecord[];
  media: MediaItem[];
  myList: Record<string, string[]>;
  progress: Record<string, WatchProgress>;
}

export interface PlaylistItemResponse {
  id: string;
  title: string;
  stream_url: string;
  kind: MediaKind;
  group: string;
  logo?: string | null;
  poster?: string | null;
  season?: number | null;
  episode?: number | null;
  description?: string | null;
  container_extension?: string | null;
}

export interface PlaylistParseResult {
  playlist_name: string;
  source_type: "m3u" | "xstream";
  items: PlaylistItemResponse[];
  warnings: string[];
}

export const EMPTY_LUX_STATE: LuxState = {
  catalogVersion: 3,
  profiles: [],
  activeProfileId: null,
  playlists: [],
  media: [],
  myList: {},
  progress: {},
};

export const profileProgressKey = (profileId: string, itemId: string) => `${profileId}:${itemId}`;