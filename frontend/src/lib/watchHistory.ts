import type { MediaItem, WatchProgress } from "@/lib/luxTypes";
import { profileProgressKey } from "@/lib/luxTypes";
import type { SeriesCollection, SeriesGroup } from "@/lib/series";

/**
 * VOD finishes when nearly all of it was watched. Live TV has no fixed
 * duration: visiting a channel is a recent watch, never a resumable position.
 */
export function isWatchComplete(progress?: WatchProgress): boolean {
  if (!progress || !Number.isFinite(progress.duration) || progress.duration <= 0) return false;
  const endThreshold = Math.min(30, progress.duration * 0.05);
  return progress.position >= Math.max(0, progress.duration - endThreshold);
}

export function resumeSeriesEpisode(
  group: SeriesGroup,
  profileId: string,
  progress: Record<string, WatchProgress>,
): MediaItem | undefined {
  let last: { item: MediaItem; progress: WatchProgress; order: number } | undefined;
  for (let index = 0; index < group.episodes.length; index++) {
    const item = group.episodes[index];
    const saved = progress[profileProgressKey(profileId, item.id)];
    if (!saved || saved.position < 2 || !Number.isFinite(Date.parse(saved.updatedAt))) continue;
    const order = Date.parse(saved.updatedAt);
    if (!last || order > last.order) last = { item, progress: saved, order };
  }
  if (!last) return group.episodes[0];
  if (!isWatchComplete(last.progress)) return last.item;
  return group.episodes[group.episodes.findIndex((item) => item.id === last.item.id) + 1];
}

/** One recent-watch item per series, not one card for every episode. */
export function buildContinueWatching(
  media: MediaItem[],
  progress: Record<string, WatchProgress>,
  profileId: string,
  collection: SeriesCollection,
): MediaItem[] {
  const recently = new Map<string, { item: MediaItem; time: number }>();
  for (const item of media) {
    const saved = progress[profileProgressKey(profileId, item.id)];
    if (!saved) continue;
    const time = Date.parse(saved.updatedAt);
    if (!Number.isFinite(time)) continue;

    if (item.kind === "live") {
      // Resume a channel at the live edge, never at a saved minute.
      const key = `live:${item.id}`;
      const previous = recently.get(key);
      if (!previous || time > previous.time) recently.set(key, { item, time });
      continue;
    }

    if (item.kind === "movie") {
      if (saved.position >= 2 && !isWatchComplete(saved)) {
        recently.set(`movie:${item.id}`, { item, time });
      }
      continue;
    }

    const group = collection.byEpisodeId.get(item.id);
    if (!group || saved.position < 2) continue;
    const key = `series:${group.id}`;
    const previous = recently.get(key);
    if (!previous || time > previous.time) recently.set(key, { item, time });
  }

  return [...recently.entries()]
    .sort((a, b) => b[1].time - a[1].time)
    .flatMap(([key, value]) => {
      if (!key.startsWith("series:")) return [value.item];
      const group = collection.byEpisodeId.get(value.item.id);
      if (!group) return [];
      const target = resumeSeriesEpisode(group, profileId, progress);
      return target ? [target] : [];
    })
    .slice(0, 40);
}
