import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, Play, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { handleMediaImageError, mediaProxyUrl } from "@/lib/media";
import { parseEpisodeMetadata } from "@/lib/catalog";
import { profileProgressKey } from "@/lib/luxTypes";
import type { MediaItem, WatchProgress } from "@/lib/luxTypes";
import type { SeriesGroup } from "@/lib/series";
import { resumeSeriesEpisode } from "@/lib/watchHistory";

interface SeriesDetailsProps {
  series: SeriesGroup;
  profileId: string;
  progress: Record<string, WatchProgress>;
  onClose: () => void;
  onPlay: (item: MediaItem) => void;
}

export default function SeriesDetails({ series, profileId, progress, onClose, onPlay }: SeriesDetailsProps) {
  const [season, setSeason] = useState(series.seasons[0] ?? 1);
  useEffect(() => setSeason(series.seasons[0] ?? 1), [series.id, series.seasons]);
  const episodes = useMemo(() => series.episodes.filter((item) => (parseEpisodeMetadata(item.title).season ?? 1) === season), [season, series.episodes]);
  const resumeTarget = useMemo(() => resumeSeriesEpisode(series, profileId, progress), [series, profileId, progress]);
  const hasStarted = series.episodes.some((item) => Boolean(progress[profileProgressKey(profileId, item.id)]));
  const playFromHere = resumeTarget ?? series.episodes[0];

  return <div className="fixed inset-0 z-[80] overflow-y-auto bg-black text-white" data-testid="series-details-overlay">
    <div className="relative min-h-[360px] overflow-hidden border-b border-white/10" data-testid="series-details-hero">
      {(series.poster || series.logo) && <img onError={handleMediaImageError} src={mediaProxyUrl(series.poster || series.logo)} alt="" className="absolute inset-0 size-full object-cover opacity-35 blur-sm" data-testid="series-details-background" />}
      <div className="absolute inset-0 bg-gradient-to-r from-black via-black/80 to-black/30" /><div className="absolute inset-0 bg-gradient-to-t from-black to-transparent" />
      <Button variant="ghost" onClick={onClose} data-testid="series-details-close-button" className="absolute top-5 left-5 z-10 text-white hover:bg-white/10"><ChevronLeft /> Voltar</Button>
      <Button variant="ghost" size="icon" onClick={onClose} data-testid="series-details-x-button" className="absolute top-5 right-5 z-10 text-white hover:bg-white/10"><X /></Button>
      <div className="relative flex min-h-[360px] items-end gap-6 px-5 pb-10 sm:px-8 lg:px-12">
        {(series.poster || series.logo) && <img onError={handleMediaImageError} src={mediaProxyUrl(series.poster || series.logo)} alt="" className="hidden aspect-[2/3] w-36 rounded-xl border border-white/10 object-cover shadow-2xl sm:block" data-testid="series-details-poster" />}
        <div><p className="text-xs font-semibold tracking-[0.24em] text-purple-300" data-testid="series-details-kicker">SÉRIE</p><h1 className="mt-2 font-heading text-4xl font-bold tracking-tight sm:text-6xl" data-testid="series-details-title">{series.title}</h1><p className="mt-3 text-sm text-zinc-400" data-testid="series-details-summary">{series.seasons.length} temporada{series.seasons.length === 1 ? "" : "s"} · {series.episodes.length} episódio{series.episodes.length === 1 ? "" : "s"}</p><Button onClick={() => { if (playFromHere) onPlay(playFromHere); }} className="mt-6 h-10 bg-white px-5 text-black hover:bg-zinc-200" data-testid="series-start-button"><Play className="fill-current" /> {hasStarted ? resumeTarget ? "Continuar série" : "Reassistir" : "Começar"}</Button></div>
      </div>
    </div>
    <section className="px-5 py-8 sm:px-8 lg:px-12" data-testid="series-episodes-section">
      <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-semibold tracking-[0.22em] text-purple-300" data-testid="series-episodes-kicker">EPISÓDIOS</p><h2 className="mt-1 font-heading text-2xl font-semibold" data-testid="series-season-title">Temporada {season}</h2></div><div className="flex flex-wrap gap-2" data-testid="series-season-selector">{series.seasons.map((value) => <button type="button" key={value} onClick={() => setSeason(value)} data-testid={`series-season-${value}-button`} className={`rounded-full border px-4 py-2 text-sm transition-colors ${season === value ? "border-purple-400 bg-purple-600 text-white" : "border-white/10 bg-white/[0.04] text-zinc-400 hover:text-white"}`}>Temporada {value}</button>)}</div></div>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" data-testid="series-episode-list">
        {episodes.map((item) => { const metadata = parseEpisodeMetadata(item.title); const watch = progress[profileProgressKey(profileId, item.id)]; const percent = watch?.duration ? Math.min(100, (watch.position / watch.duration) * 100) : 0; return <button type="button" key={item.id} onClick={() => onPlay(item)} data-testid={`series-episode-${item.id}-button`} className="group overflow-hidden rounded-xl border border-white/10 bg-white/[0.035] text-left transition-transform duration-300 hover:-translate-y-1 hover:border-purple-400/60 focus-visible:ring-2 focus-visible:ring-purple-400"><div className="relative aspect-video overflow-hidden bg-gradient-to-br from-purple-950 to-zinc-950">{(item.poster || item.logo) && <img onError={handleMediaImageError} src={mediaProxyUrl(item.poster || item.logo)} alt="" loading="lazy" className="absolute inset-0 size-full object-cover opacity-80 transition-transform duration-500 group-hover:scale-105" />}<div className="absolute inset-0 flex items-center justify-center bg-black/20"><span className="flex size-11 items-center justify-center rounded-full bg-white text-black shadow-xl"><Play className="size-5 fill-current" /></span></div>{percent > 0 && <div className="absolute inset-x-0 bottom-0 h-1 bg-white/20" data-testid={`series-episode-${item.id}-progress`}><div className="h-full bg-purple-500" style={{ width: `${percent}%` }} /></div>}</div><div className="p-4"><p className="text-xs font-semibold text-purple-300" data-testid={`series-episode-${item.id}-number`}>T{metadata.season ?? season}:E{metadata.episode ?? episodes.indexOf(item) + 1}</p><h3 className="mt-1 line-clamp-2 text-sm font-medium" data-testid={`series-episode-${item.id}-title`}>{item.title}</h3></div></button>; })}
      </div>
    </section>
  </div>;
}