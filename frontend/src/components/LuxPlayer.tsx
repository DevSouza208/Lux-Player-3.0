import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import { Captions, Check, ChevronLeft, Expand, Languages, ListVideo, Pause, PictureInPicture, Play, Settings2, Volume2, VolumeX, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { MediaItem, WatchProgress } from "@/lib/luxTypes";
import { formatTime } from "@/lib/playlist";
import { mediaPlaybackUrl, mediaProxyUrl, mediaVodFallbackUrl, VOD_API_ORIGIN } from "@/lib/media";
import { API_BASE } from "@/lib/apiOrigin";

interface LuxPlayerProps {
  item: MediaItem;
  nextItem?: MediaItem;
  progress?: WatchProgress;
  onClose: () => void;
  onProgress: (position: number, duration: number) => void;
  onNext: () => void;
}

export default function LuxPlayer({ item, nextItem, progress, onClose, onProgress, onNext }: LuxPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const playerRef = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(true);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(0.85);
  const [current, setCurrent] = useState(progress?.position ?? 0);
  const [duration, setDuration] = useState(progress?.duration ?? 0);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [speed, setSpeed] = useState("1");
  const [captions, setCaptions] = useState(false);
  const [playbackState, setPlaybackState] = useState<"loading" | "ready" | "error">("loading");
  const [playbackAttempt, setPlaybackAttempt] = useState(0);
  const [playbackError, setPlaybackError] = useState("");
  const [needsClick, setNeedsClick] = useState(false);
  const hideTimer = useRef<number | undefined>(undefined);

  const revealControls = () => {
    setControlsVisible(true);
    window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setControlsVisible(false), 3500);
  };

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let disposed = false;
    let hls: Hls | undefined;
    let lastMovementAt = Date.now();
    let lastSeenPosition = 0;
    let lastProgressSavedAt = 0;
    let attemptedAutoplay = false;
    let awaitingUserGesture = false;
    let initialVideoError = false;
    const path = new URL(item.streamUrl).pathname.toLowerCase();
    const isHls = path.endsWith(".m3u8") || item.containerExtension?.toLowerCase() === "m3u8";
    const isTransportStream = path.endsWith(".ts") || item.containerExtension?.toLowerCase() === "ts";
    const isVod = item.kind !== "live";
    const preferWebm = video.canPlayType('video/mp4; codecs="avc1.640028, mp4a.40.2"') === "";

    // Xtream live lists can advertise both HLS and continuous MPEG-TS.
    // If the CDN refuses HLS segments (often token-bound), retry the SAME
    // stream ID as .ts. This is a byte-stream remux, not a full download.
    const canUseXtreamTs = item.kind === "live"
      && isHls && /\/live\/[^/]+\/[^/]+\/\d+\.m3u8$/i.test(path);
    const useTsFallback = canUseXtreamTs && playbackAttempt > 0;
    const playHls = isHls && !useTsFallback;
    let sourceUrl = item.streamUrl;
    let sourceExtension = item.containerExtension;
    if (useTsFallback) {
      const backupUrl = new URL(item.streamUrl);
      backupUrl.pathname = backupUrl.pathname.replace(/\.m3u8$/i, ".ts");
      sourceUrl = backupUrl.toString();
      sourceExtension = "ts";
    }
    // Native/Range MP4 first; transcode incompatible VOD only as fallback.
    let playbackUrl = isVod && playbackAttempt > 0
      ? mediaVodFallbackUrl(item.streamUrl)
      : mediaPlaybackUrl(sourceUrl, sourceExtension, preferWebm);

    // On the last TS attempt, transcode only that channel to browser H.264.
    // All healthy streams continue using remux without any re-encoding.
    if (useTsFallback && playbackAttempt >= 2) {
      playbackUrl = `${API_BASE}/media/remux?url=${encodeURIComponent(sourceUrl)}&output=h264`;
    } else if (playbackAttempt > 0 && !playHls && !useTsFallback) {
      if (isTransportStream) {
        playbackUrl = `${API_BASE}/media/remux?url=${encodeURIComponent(item.streamUrl)}&output=h264`;
      } else if (item.kind === "live") {
        playbackUrl = `${API_BASE}/media/remux?url=${encodeURIComponent(item.streamUrl)}${playbackAttempt === 2 ? "&output=h264" : ""}`;
      }
    }

    setPlaybackState("loading");
    setPlaybackError("");
    setNeedsClick(false);
    setPaused(true);
    setCurrent(0);

    const retryOrFail = (reason: string) => {
      if (disposed) return;
      const maxRetries = isVod || isTransportStream ? 1 : 2;
      if (playbackAttempt < maxRetries) {
        if (isVod) {
          // A 422 here means the route exists but requires a URL.
          // The old Emergent preview answers 404: do not retry video endlessly.
          void fetch(`${VOD_API_ORIGIN}/api/media/vod`)
            .then((response) => {
              if (disposed) return;
              if (response.status === 404) {
                setPlaybackError("Este episódio precisa de conversão de formato. A rota FFmpeg para filmes e séries ainda não foi ativada no backend.");
                setPlaybackState("error");
              } else {
                setPlaybackAttempt((old) => old + 1);
              }
            })
            .catch(() => {
              if (disposed) return;
              setPlaybackError("Não foi possível acessar a conversão de vídeo do servidor.");
              setPlaybackState("error");
            });
        } else {
          setPlaybackAttempt((old) => old + 1);
        }
      } else {
        setPlaybackError(isVod
          ? `${reason} Verifique se o servidor consegue converter este episódio para H.264/AAC.`
          : reason);
        setPlaybackState("error");
      }
    };
    const requestPlay = () => {
      if (disposed || attemptedAutoplay) return;
      attemptedAutoplay = true;
      void video.play().then(() => {
        if (!disposed) setNeedsClick(false);
      }).catch(() => {
        // Browser autoplay policies can require an explicit click.
        if (!disposed) {
          awaitingUserGesture = true;
          setNeedsClick(true);
          setPlaybackState("ready");
        }
      });
    };
    const onLoaded = () => {
      if (disposed) return;
      setPlaybackState("ready");
      lastMovementAt = Date.now();
      const startAt = progress?.position && progress.position < (video.duration || Infinity) - 8 ? progress.position : 0;
      if (startAt > 0 && Number.isFinite(video.duration)) video.currentTime = startAt;
      setDuration(Number.isFinite(video.duration) ? video.duration : progress?.duration || 0);
      requestPlay();
    };
    const onTime = () => {
      if (disposed) return;
      setCurrent(video.currentTime);
      if (Number.isFinite(video.duration) && video.duration > 0) setDuration(video.duration);
      if (video.currentTime > lastSeenPosition + 0.15) {
        lastSeenPosition = video.currentTime;
        lastMovementAt = Date.now();
      }
      // IndexedDB and a giant catalogue should not update on every video frame.
      if (item.kind !== "live" && video.currentTime >= 2 && Date.now() - lastProgressSavedAt >= 12000) {
        lastProgressSavedAt = Date.now();
        onProgress(video.currentTime, video.duration);
      }
    };
    const onPlay = () => { setPaused(false); setNeedsClick(false); };
    const onPause = () => {
      setPaused(true);
      if (!disposed && item.kind !== "live" && video.currentTime >= 2 && !video.ended) {
        onProgress(video.currentTime, video.duration);
      }
    };
    const onCanPlay = () => { setPlaybackState("ready"); requestPlay(); };
    const onPlaying = () => {
      setPlaybackState("ready");
      lastMovementAt = Date.now();
      // Record a recent channel visit, without falsely seeking into a live stream.
      if (item.kind === "live") onProgress(0, 0);
    };
    const onEnded = () => {
      if (disposed || item.kind === "live") return;
      const finishedAt = Number.isFinite(video.duration) && video.duration > 0
        ? video.duration : video.currentTime;
      onProgress(finishedAt, finishedAt);
      if (item.kind === "series" && nextItem) onNext();
      else onClose();
    };
    const onWaiting = () => { if (!video.paused && !disposed) setPlaybackState("loading"); };
    const onError = () => {
      if (disposed || initialVideoError) return;
      initialVideoError = true;
      const code = video.error?.code;
      retryOrFail(code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED
        ? "Formato de vídeo não compatível com este navegador."
        : "O servidor interrompeu a transmissão do canal.");
    };

    video.addEventListener("loadedmetadata", onLoaded);
    video.addEventListener("timeupdate", onTime);
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("canplay", onCanPlay);
    video.addEventListener("playing", onPlaying);
    video.addEventListener("ended", onEnded);
    video.addEventListener("waiting", onWaiting);
    video.addEventListener("stalled", onWaiting);
    video.addEventListener("error", onError);

    video.preload = "auto";
    video.volume = volume;
    video.muted = muted;
    if (playHls && Hls.isSupported()) {
      hls = new Hls({ enableWorker: true, lowLatencyMode: true });
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          retryOrFail(data.type === Hls.ErrorTypes.NETWORK_ERROR
            ? "Não foi possível receber os segmentos HLS do canal."
            : "O navegador não conseguiu decodificar o vídeo.");
        }
      });
      hls.attachMedia(video);
      hls.loadSource(playbackUrl);
    } else {
      video.src = playbackUrl;
      video.load();
    }

    // A media request can hang without firing video/error. Never spin forever:
    // after 28 s with no decoded frame, switch transport or reconnect (max 2).
    const watchdog = window.setInterval(() => {
      if (disposed) return;
      if (video.paused && video.currentTime > 0) return;
      if (video.currentTime > lastSeenPosition + 0.15) {
        lastSeenPosition = video.currentTime;
        lastMovementAt = Date.now();
      }
      if (Date.now() - lastMovementAt > (isVod ? 50000 : 28000) && !awaitingUserGesture && !video.ended) {
        lastMovementAt = Date.now();
        retryOrFail("O canal não enviou vídeo por tempo suficiente. Verifique o servidor de streaming.");
      }
    }, 4000);

    return () => {
      disposed = true;
      window.clearInterval(watchdog);
      video.removeEventListener("loadedmetadata", onLoaded);
      video.removeEventListener("timeupdate", onTime);
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("canplay", onCanPlay);
      video.removeEventListener("playing", onPlaying);
      video.removeEventListener("ended", onEnded);
      video.removeEventListener("waiting", onWaiting);
      video.removeEventListener("stalled", onWaiting);
      video.removeEventListener("error", onError);
      hls?.destroy();
      video.pause();
      video.removeAttribute("src");
      video.load();
    };
  }, [item.id, playbackAttempt]);

  useEffect(() => { if (videoRef.current) videoRef.current.playbackRate = Number(speed); }, [speed]);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) void video.play().then(() => setNeedsClick(false)).catch(() => setPlaybackError("Não foi possível iniciar o vídeo."));
    else video.pause();
    revealControls();
  };
  const saveBeforeLeaving = () => {
    const video = videoRef.current;
    if (item.kind !== "live" && video && video.currentTime >= 2) {
      onProgress(video.currentTime, video.duration);
    }
  };
  const closePlayer = () => { saveBeforeLeaving(); onClose(); };
  const nextPlayerEpisode = () => { saveBeforeLeaving(); onNext(); };
  const toggleCaptions = () => {
    setCaptions((value) => !value);
    const tracks = videoRef.current?.textTracks;
    if (tracks) for (let index = 0; index < tracks.length; index += 1) tracks[index].mode = !captions ? "showing" : "hidden";
  };
  const seek = (value: number) => { if (videoRef.current) videoRef.current.currentTime = value; setCurrent(value); revealControls(); };
  const toggleFullscreen = () => { if (!document.fullscreenElement) void playerRef.current?.requestFullscreen(); else void document.exitFullscreen(); };
  const togglePip = () => { const video = videoRef.current; if (video && document.pictureInPictureEnabled && !document.pictureInPictureElement && video.readyState >= HTMLMediaElement.HAVE_METADATA) void video.requestPictureInPicture().catch(() => undefined); };

  return <div ref={playerRef} className="fixed inset-0 z-[100] flex items-center justify-center bg-black" onMouseMove={revealControls} onTouchStart={revealControls} data-testid="lux-player-overlay">
    <video ref={videoRef} playsInline controls={false} className="size-full object-contain" poster={mediaProxyUrl(item.poster || item.logo)} data-testid="lux-player-video" />
    {playbackState === "loading" && <div className="absolute inset-0 flex items-center justify-center bg-black/50" data-testid="player-loading-state"><div className="text-center"><div className="mx-auto size-10 animate-spin rounded-full border-2 border-white/20 border-t-purple-400" /><p className="mt-4 text-sm text-zinc-300">{playbackAttempt ? (item.kind === "live" ? "Reconectando ao canal..." : "Preparando outro formato de vídeo...") : (item.kind === "live" ? "Preparando o canal com segurança..." : "Preparando episódio...")}</p></div></div>}
    {playbackState === "error" && <div className="absolute inset-0 flex items-center justify-center bg-black/80 px-6" data-testid="player-error-state"><div className="max-w-md text-center"><h3 className="font-heading text-2xl font-semibold">{item.kind === "live" ? "Este canal não respondeu" : "Não foi possível reproduzir este episódio"}</h3><p className="mt-2 text-sm leading-6 text-zinc-400">{playbackError || "Não foi possível iniciar este canal."}</p><Button onClick={() => setPlaybackAttempt(0)} className="mt-5 mr-3 bg-white text-black hover:bg-zinc-200" data-testid="player-retry-button">Tentar novamente</Button><Button onClick={closePlayer} className="mt-5 bg-purple-600 text-white hover:bg-purple-500" data-testid="player-error-close-button">Voltar ao catálogo</Button></div></div>}
    {needsClick && playbackState === "ready" && <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/30"><Button onClick={togglePlay} size="lg" className="bg-purple-600 text-white hover:bg-purple-500">Reproduzir canal</Button></div>}
    <div className={`pointer-events-none absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-black/90 transition-opacity duration-300 ${controlsVisible ? "opacity-100" : "opacity-0"}`} />
    <div className={`absolute inset-x-0 top-0 flex items-center justify-between p-4 transition-opacity duration-300 sm:p-7 ${controlsVisible ? "opacity-100" : "pointer-events-none opacity-0"}`}>
      <Button variant="ghost" onClick={closePlayer} data-testid="player-close-button" className="pointer-events-auto text-white hover:bg-white/10"><ChevronLeft /> Voltar</Button>
      <div className="max-w-[50%] text-right"><p className="text-xs tracking-[0.2em] text-purple-300" data-testid="player-kind">{item.kind === "live" ? "AO VIVO" : item.kind === "series" ? "SÉRIE" : "FILME"}</p><h2 className="truncate font-heading text-lg font-semibold text-white" data-testid="player-title">{item.title}</h2></div>
    </div>
    <div className={`absolute inset-x-0 bottom-0 p-4 transition-opacity duration-300 sm:p-7 ${controlsVisible ? "opacity-100" : "pointer-events-none opacity-0"}`}>
      <input type="range" min={0} max={duration || 0} step={0.1} value={Math.min(current, duration || 0)} onChange={(event) => seek(Number(event.target.value))} aria-label="Progresso do vídeo" data-testid="player-progress-range" className="h-1.5 w-full cursor-pointer accent-purple-500" />
      <div className="mt-3 flex items-center gap-2 text-white">
        <Button size="icon" variant="ghost" onClick={togglePlay} data-testid="player-play-button" className="text-white hover:bg-white/10">{paused ? <Play className="fill-current" /> : <Pause className="fill-current" />}</Button>
        <Button size="icon" variant="ghost" onClick={() => { setMuted((value) => !value); if (videoRef.current) videoRef.current.muted = !muted; }} data-testid="player-mute-button" className="text-white hover:bg-white/10">{muted ? <VolumeX /> : <Volume2 />}</Button>
        <input type="range" min={0} max={1} step={0.05} value={muted ? 0 : volume} onChange={(event) => { const next = Number(event.target.value); setVolume(next); setMuted(next === 0); if (videoRef.current) { videoRef.current.volume = next; videoRef.current.muted = next === 0; } }} aria-label="Volume" data-testid="player-volume-range" className="hidden w-20 accent-purple-500 sm:block" />
        <span className="ml-1 text-xs text-zinc-400" data-testid="player-time">{formatTime(current)} / {formatTime(duration)}</span>
        <div className="ml-auto flex items-center gap-1">
          <label className="sr-only" htmlFor="player-speed">Velocidade</label><select id="player-speed" value={speed} onChange={(event) => setSpeed(event.target.value)} aria-label="Velocidade de reprodução" data-testid="player-speed-select" className="h-8 rounded-lg border border-white/10 bg-black/50 px-2 text-xs text-white outline-none"><option value="0.75">0.75x</option><option value="1">1x</option><option value="1.25">1.25x</option><option value="1.5">1.5x</option><option value="2">2x</option></select>
          <Button size="icon-sm" variant="ghost" onClick={toggleCaptions} aria-label="Legendas" data-testid="player-captions-button" className={captions ? "bg-purple-600 text-white" : "text-white hover:bg-white/10"}><Captions /></Button>
          <Button size="icon-sm" variant="ghost" onClick={togglePip} aria-label="Picture in picture" data-testid="player-pip-button" className="text-white hover:bg-white/10"><PictureInPicture /></Button>
          <Button size="icon-sm" variant="ghost" onClick={toggleFullscreen} aria-label="Tela cheia" data-testid="player-fullscreen-button" className="text-white hover:bg-white/10"><Expand /></Button>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-white/10 pt-3 text-xs text-zinc-400">
        <span className="mr-2 flex items-center gap-1" data-testid="player-audio-label"><Languages className="size-3.5" /> Áudio original</span><span className="flex items-center gap-1" data-testid="player-subtitles-label"><Check className="size-3.5 text-purple-300" /> Legendas disponíveis</span>
        {nextItem && <Button size="sm" onClick={nextPlayerEpisode} data-testid="player-next-button" className="ml-auto bg-white text-black hover:bg-zinc-200"><ListVideo /> Próximo episódio</Button>}
        <Settings2 className="ml-auto hidden size-4 text-zinc-600 sm:block" data-testid="player-settings-icon" />
      </div>
    </div>
    <Button size="icon" variant="ghost" onClick={closePlayer} data-testid="player-dismiss-button" className="absolute top-4 right-4 text-white hover:bg-white/10 sm:hidden"><X /></Button>
  </div>;
}