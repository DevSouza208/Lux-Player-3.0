import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Bookmark, ChevronDown, FilePlus2, LayoutGrid, ListVideo, LogOut, Menu, Play, Search, Sparkles, Tv, UserRound, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import ImportCenter from "@/components/ImportCenter";
import LuxPlayer from "@/components/LuxPlayer";
import MediaRail from "@/components/MediaRail";
import CatalogGrid from "@/components/CatalogGrid";
import SeriesDetails from "@/components/SeriesDetails";
import ProfileGate from "@/components/ProfileGate";
import { createLocalId } from "@/lib/storage";
import { loadLuxState, saveLuxState, saveWatchProgress } from "@/lib/storage";
import { profileProgressKey } from "@/lib/luxTypes";
import type { LuxState, MediaItem, PlaylistRecord, Profile } from "@/lib/luxTypes";
import { mediaProxyUrl } from "@/lib/media";
import { buildSeriesCollection, seriesCard } from "@/lib/series";
import type { SeriesGroup } from "@/lib/series";

type View = "home" | "live" | "movies" | "series" | "my-list";

const navItems: { id: View; label: string; icon: typeof Tv }[] = [
  { id: "home", label: "Início", icon: LayoutGrid },
  { id: "live", label: "Ao vivo", icon: Tv },
  { id: "movies", label: "Filmes", icon: Play },
  { id: "series", label: "Séries", icon: ListVideo },
  { id: "my-list", label: "Minha lista", icon: Bookmark },
];

export default function Home() {
  const [state, setState] = useState<LuxState | null>(null);
  const [view, setView] = useState<View>("home");
  const [showImport, setShowImport] = useState(false);
  const [showProfiles, setShowProfiles] = useState(false);
  const [selected, setSelected] = useState<MediaItem | null>(null);
  const [search, setSearch] = useState("");
  const [mobileNav, setMobileNav] = useState(false);
  const [catalogPage, setCatalogPage] = useState(1);
  const [selectedSeries, setSelectedSeries] = useState<SeriesGroup | null>(null);

  useEffect(() => { void loadLuxState().then(setState).catch(() => setState({ catalogVersion: 3, profiles: [], activeProfileId: null, playlists: [], media: [], myList: {}, progress: {} })); }, []);
  useEffect(() => { setCatalogPage(1); }, [view, search, state?.media.length]);

  const activeProfile = state?.profiles.find((profile) => profile.id === state.activeProfileId);
  const activeList = activeProfile ? state?.myList[activeProfile.id] ?? [] : [];
  const visibleMedia = useMemo(() => {
    const all = state?.media ?? [];
    const term = search.trim().toLowerCase();
    const filtered = term ? all.filter((item) => `${item.title} ${item.group}`.toLowerCase().includes(term)) : all;
    if (view === "live") return filtered.filter((item) => item.kind === "live");
    if (view === "movies") return filtered.filter((item) => item.kind === "movie");
    if (view === "series") return filtered.filter((item) => item.kind === "series");
    if (view === "my-list") return filtered.filter((item) => activeList.includes(item.id));
    return filtered;
  }, [activeList, search, state?.media, view]);
  const continueWatching = useMemo(() => {
    if (!activeProfile || !state) return [];
    return state.media
      .filter((item) => (state.progress[profileProgressKey(activeProfile.id, item.id)]?.position ?? 0) > 8)
      .sort((a, b) => new Date(state.progress[profileProgressKey(activeProfile.id, b.id)]?.updatedAt || 0).getTime() - new Date(state.progress[profileProgressKey(activeProfile.id, a.id)]?.updatedAt || 0).getTime());
  }, [activeProfile, state]);
  const heroItem = visibleMedia[0] ?? state?.media[0];
  const { live, movies, series } = useMemo(() => ({
    live: visibleMedia.filter((item) => item.kind === "live"),
    movies: visibleMedia.filter((item) => item.kind === "movie"),
    series: visibleMedia.filter((item) => item.kind === "series"),
  }), [visibleMedia]);
  const allSeriesCollection = useMemo(() => buildSeriesCollection(state?.media ?? []), [state?.media]);
  const visibleSeriesCollection = useMemo(() => buildSeriesCollection(series), [series]);
  const seriesCards = useMemo(() => visibleSeriesCollection.groups.map(seriesCard), [visibleSeriesCollection.groups]);
  const currentProgress = selected && activeProfile ? state?.progress[profileProgressKey(activeProfile.id, selected.id)] : undefined;

  const commit = (next: LuxState) => { setState(next); void saveLuxState(next); };
  const createProfile = (profile: Profile) => { if (!state) return; const next = { ...state, profiles: [...state.profiles, profile], activeProfileId: profile.id }; commit(next); };
  const selectProfile = (profile: Profile) => { if (!state) return; commit({ ...state, activeProfileId: profile.id }); setShowProfiles(false); };
  const importItems = (items: MediaItem[], playlist: PlaylistRecord) => { if (!state) return; const next = { ...state, playlists: [...state.playlists.filter((existing) => existing.id !== playlist.id), playlist], media: [...state.media.filter((item) => item.playlistId !== playlist.id), ...items] }; commit(next); };
  const toggleList = (item: MediaItem) => { if (!state || !activeProfile) return; const current = state.myList[activeProfile.id] ?? []; const nextList = current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id]; commit({ ...state, myList: { ...state.myList, [activeProfile.id]: nextList } }); toast.success(current.includes(item.id) ? "Removido da Minha lista" : "Adicionado à Minha lista"); };
  const play = (item: MediaItem) => { if (!item.streamUrl) return toast.error("Este item ainda não possui um endereço de reprodução."); setSelected(item); };
  const updateProgress = (position: number, duration: number) => { if (!activeProfile || !selected || !duration) return; const key = profileProgressKey(activeProfile.id, selected.id); const entry = { position, duration, updatedAt: new Date().toISOString() }; setState((current) => current ? { ...current, progress: { ...current.progress, [key]: entry } } : current); void saveWatchProgress(key, entry); };
  const selectedEpisodeGroup = selected ? allSeriesCollection.byEpisodeId.get(selected.id) : undefined;
  const selectedEpisodeIndex = selected && selectedEpisodeGroup ? selectedEpisodeGroup.episodes.findIndex((item) => item.id === selected.id) : -1;
  const nextEpisode = selectedEpisodeGroup && selectedEpisodeIndex >= 0 ? selectedEpisodeGroup.episodes[selectedEpisodeIndex + 1] : undefined;
  const openSeries = (item: MediaItem) => { const group = visibleSeriesCollection.byRepresentativeId.get(item.id) ?? allSeriesCollection.byEpisodeId.get(item.id); if (group) setSelectedSeries(group); };

  if (!state) return <div className="flex min-h-svh items-center justify-center bg-black text-purple-200" data-testid="lux-loading-screen"><Sparkles className="mr-3 size-5 animate-pulse" /> Abrindo seu Lux Player...</div>;

  return <div className="min-h-svh bg-black text-white" data-testid="lux-app-shell">
    <header className="fixed inset-x-0 top-0 z-50 border-b border-white/[0.07] bg-black/70 backdrop-blur-xl" data-testid="lux-header">
      <div className="flex h-16 items-center gap-4 px-5 sm:px-8 lg:px-12">
        <button type="button" onClick={() => { setView("home"); setMobileNav(false); }} data-testid="lux-logo-button" className="flex shrink-0 items-center gap-2 focus-visible:ring-2 focus-visible:ring-purple-400"><span className="flex size-8 items-center justify-center rounded-lg bg-purple-600 shadow-[0_0_22px_rgba(147,51,234,0.45)]"><Sparkles className="size-4" /></span><span className="hidden font-heading text-sm font-bold tracking-[0.25em] sm:inline" data-testid="lux-logo-text">LUX</span></button>
        <nav className={`${mobileNav ? "absolute top-16 right-4 left-4 flex" : "hidden md:flex"} items-center gap-1 rounded-2xl border border-white/10 bg-black/90 p-2 backdrop-blur-xl`} data-testid="lux-main-nav">{navItems.map((item) => { const Icon = item.icon; return <button type="button" key={item.id} onClick={() => { setView(item.id); setMobileNav(false); }} data-testid={`nav-${item.id}`} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${view === item.id ? "bg-white/10 text-white" : "text-zinc-400 hover:bg-white/5 hover:text-white"}`}><Icon className="size-4" />{item.label}</button>; })}</nav>
        <div className="ml-auto flex items-center gap-2"><div className="hidden items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 sm:flex"><Search className="size-4 text-zinc-500" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar na sua lista" aria-label="Buscar na sua lista" data-testid="catalog-search-input" className="w-32 bg-transparent py-1.5 text-sm text-white outline-none placeholder:text-zinc-600 lg:w-48" /></div><Button variant="ghost" size="icon" onClick={() => setShowImport(true)} data-testid="header-import-button" className="text-zinc-300 hover:bg-purple-500/15 hover:text-white"><FilePlus2 /></Button><Button variant="ghost" size="icon" onClick={() => setShowProfiles(true)} data-testid="profile-switcher-button" className="text-zinc-300 hover:bg-purple-500/15 hover:text-white"><span className="flex size-7 items-center justify-center rounded-lg bg-gradient-to-br from-purple-500 to-fuchsia-800 text-xs font-bold">{activeProfile?.avatar || <UserRound className="size-4" />}</span></Button><Button variant="ghost" size="icon" onClick={() => setMobileNav((value) => !value)} data-testid="mobile-nav-button" className="text-zinc-300 md:hidden">{mobileNav ? <X /> : <Menu />}</Button></div>
      </div>
    </header>

    <main className="pb-20 pt-16">
      {view === "home" && <section className="relative min-h-[560px] overflow-hidden" data-testid="home-hero-section">
        {heroItem?.poster || heroItem?.logo ? <img src={mediaProxyUrl(heroItem.poster || heroItem.logo)} alt="" className="absolute inset-0 size-full object-cover opacity-45" data-testid="hero-background-image" /> : <div className="absolute inset-0 bg-[radial-gradient(circle_at_72%_22%,rgba(147,51,234,0.38),transparent_30%),linear-gradient(110deg,#000_22%,#160a24_70%,#050208)]" data-testid="hero-empty-background" />}
        <div className="absolute inset-0 bg-gradient-to-r from-black via-black/70 to-transparent" /><div className="absolute inset-0 bg-gradient-to-t from-black via-black/10 to-black/20" />
        <div className="relative flex min-h-[560px] items-end px-5 pb-14 sm:px-8 lg:px-12"><motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="max-w-2xl">
          <div className="mb-5 flex items-center gap-2 text-xs font-semibold tracking-[0.24em] text-purple-300" data-testid="hero-kicker"><Sparkles className="size-4" /> LUX PLAYER</div>
          {heroItem ? <><h1 className="font-heading text-4xl font-bold tracking-tight sm:text-6xl" data-testid="hero-title">{heroItem.title}</h1><p className="mt-4 max-w-xl text-base leading-7 text-zinc-300" data-testid="hero-description">{heroItem.description || "Seu conteúdo, organizado em uma experiência premium. Continue de onde parou ou descubra seu próximo favorito."}</p><div className="mt-7 flex flex-wrap gap-3"><Button onClick={() => play(heroItem)} className="h-11 bg-white px-5 text-black hover:bg-zinc-200" data-testid="hero-play-button"><Play className="fill-current" /> Assistir agora</Button><Button variant="outline" onClick={() => toggleList(heroItem)} className="h-11 border-white/20 bg-white/10 px-5 text-white hover:bg-white/20" data-testid="hero-list-button"><Bookmark /> {activeList.includes(heroItem.id) ? "Na minha lista" : "Minha lista"}</Button></div></> : <><h1 className="font-heading text-4xl font-bold tracking-tight sm:text-6xl" data-testid="hero-empty-title">Seu streaming. Seu espaço.</h1><p className="mt-4 max-w-xl text-base leading-7 text-zinc-300" data-testid="hero-empty-description">Importe sua primeira playlist e transforme canais, filmes e séries em uma biblioteca feita para você.</p><Button onClick={() => setShowImport(true)} className="mt-7 h-11 bg-purple-600 text-white hover:bg-purple-500" data-testid="hero-import-button"><FilePlus2 /> Adicionar playlist</Button></>}
        </motion.div></div>
      </section>}

      <div className="px-5 sm:px-8 lg:px-12">{state.media.length > 0 && <div className="mt-8 flex flex-wrap gap-2" data-testid="quick-category-nav">{navItems.slice(1).map((item) => <button type="button" key={item.id} onClick={() => setView(item.id)} data-testid={`quick-nav-${item.id}`} className={`rounded-full border px-4 py-2 text-sm transition-colors ${view === item.id ? "border-purple-400 bg-purple-600 text-white" : "border-white/10 bg-white/[0.04] text-zinc-300 hover:border-purple-300/60 hover:text-white"}`}>{item.label}</button>)}</div>}
      </div>
      {state.media.length === 0 && <section className="mx-5 mt-10 rounded-3xl border border-white/10 bg-white/[0.035] p-6 sm:mx-8 sm:p-10 lg:mx-12" data-testid="empty-library-panel"><div className="flex max-w-xl items-start gap-4"><div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-purple-600/20 text-purple-300"><FilePlus2 /></div><div><h2 className="font-heading text-2xl font-semibold" data-testid="empty-library-title">Sua biblioteca está pronta para nascer</h2><p className="mt-2 text-sm leading-6 text-zinc-400" data-testid="empty-library-description">M3U, M3U8 ou XStream: adicione uma fonte e o Lux cuida da organização por você.</p><Button onClick={() => setShowImport(true)} className="mt-5 bg-purple-600 text-white hover:bg-purple-500" data-testid="empty-library-import-button">Importar conteúdo</Button></div></div></section>}
      {state.media.length > 0 && <div data-testid="catalog-content">{view === "home" ? <>{continueWatching.length > 0 && <MediaRail title="Continuar assistindo" items={continueWatching} landscape myList={activeList} onPlay={play} onToggleList={toggleList} />}<MediaRail title="Ao vivo agora" items={live} landscape myList={activeList} onPlay={play} onToggleList={toggleList} /><MediaRail title="Filmes para você" items={movies} myList={activeList} onPlay={play} onToggleList={toggleList} /><MediaRail title="Suas séries" items={seriesCards} myList={activeList} onPlay={openSeries} onToggleList={toggleList} /></> : <CatalogGrid title={navItems.find((item) => item.id === view)?.label || "Minha lista"} items={view === "series" ? seriesCards : visibleMedia} page={catalogPage} onPageChange={(page) => { setCatalogPage(page); window.scrollTo({ top: 0, behavior: "smooth" }); }} myList={activeList} onPlay={view === "series" ? openSeries : play} onToggleList={toggleList} />}</div>}
      {state.media.length > 0 && !visibleMedia.length && <div className="py-24 text-center" data-testid="catalog-empty-search"><Search className="mx-auto size-8 text-zinc-600" /><p className="mt-4 text-zinc-400" data-testid="catalog-empty-message">Nada encontrado nessa seleção.</p></div>}
    </main>

    <footer className="border-t border-white/[0.06] px-5 py-8 text-xs text-zinc-600 sm:px-8 lg:px-12" data-testid="lux-footer"><div className="flex flex-wrap items-center justify-between gap-3"><span data-testid="lux-footer-brand">LUX PLAYER · sua biblioteca local</span><span className="flex items-center gap-2" data-testid="lux-footer-storage"><span className="size-1.5 rounded-full bg-emerald-400" /> IndexedDB ativo neste dispositivo</span></div></footer>

    <AnimatePresence>{showImport && <ImportCenter onClose={() => setShowImport(false)} onImported={importItems} />}</AnimatePresence>
    <AnimatePresence>{showProfiles && <ProfileGate profiles={state.profiles} initial={false} onSelect={selectProfile} onCreate={createProfile} onClose={() => setShowProfiles(false)} />}</AnimatePresence>
    <AnimatePresence>{selected && activeProfile && <LuxPlayer item={selected} nextItem={nextEpisode} progress={currentProgress} onClose={() => setSelected(null)} onProgress={updateProgress} onNext={() => { if (nextEpisode) setSelected(nextEpisode); }} />}</AnimatePresence>
    <AnimatePresence>{selectedSeries && activeProfile && <SeriesDetails series={selectedSeries} profileId={activeProfile.id} progress={state.progress} onClose={() => setSelectedSeries(null)} onPlay={play} />}</AnimatePresence>
    {!activeProfile && <ProfileGate profiles={state.profiles} initial onSelect={selectProfile} onCreate={createProfile} />}
  </div>;
}
