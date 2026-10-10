import { describe, expect, it } from "vitest";
import type { MediaItem, WatchProgress } from "@/lib/luxTypes";
import { buildSeriesCollection } from "@/lib/series";
import { buildContinueWatching, isWatchComplete, resumeSeriesEpisode } from "@/lib/watchHistory";

const media = (id: string, kind: MediaItem["kind"], title: string): MediaItem => ({
  id, kind, title, group: kind, streamUrl: `https://example.com/${id}.mp4`, playlistId: "source",
});
const watch = (position: number, duration: number, date: string): WatchProgress => ({
  position, duration, updatedAt: date,
});
const now = "2026-10-10T22:00:00.000Z";
const earlier = "2026-10-10T20:00:00.000Z";

describe("Lux Continue assistindo", () => {
  it("includes live channels as recent watches without seeking", () => {
    const live = media("a&e", "live", "A&E");
    const collection = buildSeriesCollection([live]);
    expect(buildContinueWatching([live], { "p:a&e": watch(0, 0, now) }, "p", collection))
      .toEqual([live]);
  });

  it("includes an unfinished movie, but not a finished movie", () => {
    const movie = media("movie", "movie", "Filme");
    const progress = { "p:movie": watch(300, 1200, now) };
    expect(buildContinueWatching([movie], progress, "p", buildSeriesCollection([movie])))
      .toEqual([movie]);
    progress["p:movie"] = watch(1190, 1200, now);
    expect(buildContinueWatching([movie], progress, "p", buildSeriesCollection([movie])))
      .toEqual([]);
    expect(isWatchComplete(progress["p:movie"])).toBe(true);
  });

  it("has one series card and resumes the last unfinished episode", () => {
    const e1 = media("e1", "series", "Série S01E01");
    const e2 = media("e2", "series", "Série S01E02");
    const collection = buildSeriesCollection([e1, e2]);
    const progress = {
      "p:e1": watch(1190, 1200, earlier),
      "p:e2": watch(200, 1200, now),
    };
    expect(buildContinueWatching([e1, e2], progress, "p", collection)).toEqual([e2]);
  });

  it("offers the next episode when the prior one has ended", () => {
    const e1 = media("e1", "series", "Série S01E01");
    const e2 = media("e2", "series", "Série S01E02");
    const collection = buildSeriesCollection([e1, e2]);
    const group = collection.groups[0];
    const progress = { "p:e1": watch(1200, 1200, now) };
    expect(resumeSeriesEpisode(group, "p", progress)).toEqual(e2);
    expect(buildContinueWatching([e1, e2], progress, "p", collection)).toEqual([e2]);
  });

  it("does not show a finished series, and keeps watch history separate by profile", () => {
    const e1 = media("e1", "series", "Série S01E01");
    const e2 = media("e2", "series", "Série S01E02");
    const collection = buildSeriesCollection([e1, e2]);
    const progress = {
      "p:e1": watch(1200, 1200, earlier),
      "p:e2": watch(1200, 1200, now),
    };
    expect(buildContinueWatching([e1, e2], progress, "p", collection)).toEqual([]);
    expect(buildContinueWatching([e1, e2], progress, "other", collection)).toEqual([]);
  });

  it("sorts all categories by most recently watched", () => {
    const live = media("live", "live", "Canal");
    const movie = media("movie", "movie", "Filme");
    const ep = media("ep", "series", "Série S01E01");
    const items = [live, movie, ep];
    const progress = {
      "p:live": watch(0, 0, earlier),
      "p:movie": watch(120, 1200, now),
      "p:ep": watch(60, 1200, "2026-10-10T21:00:00.000Z"),
    };
    expect(buildContinueWatching(items, progress, "p", buildSeriesCollection(items))
      .map((item) => item.id)).toEqual(["movie", "ep", "live"]);
  });
});
