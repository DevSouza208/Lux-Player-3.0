import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import { Captions, Check, ChevronLeft, Expand, Languages, ListVideo, Pause, PictureInPicture, Play, Settings2, Volume2, VolumeX, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { MediaItem, WatchProgress } from "@/lib/luxTypes";
import { formatTime } from "@/lib/playlist";

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
  const hideTimer = useRef<number | undefined>(undefined);

  const revealControls = () => {
    setControlsVisible(true);
    window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setControlsVisible(false), 3500);
  };

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let hls: Hls | undefined;
    const isHls = item.streamUrl.toLowerCase().includes(".m3u8") || item.containerExtension === "m3u8";
    if (isHls && Hls.isSupported()) {
      hls = new Hls({ enableWorker: true, lowLatencyMode: true });
      hls.loadSource(item.streamUrl);
      hls.attachMedia(video);
    } else {
      video.src = item.streamUrl;
    }
    video.volume = volume;
    video.muted = muted;
    const onLoaded = () => {
      const startAt = progress?.position && progress.position < (video.duration || Infinity) - 8 ? progress.position : 0;
      if (startAt > 0) video.currentTime = startAt;
      setDuration(video.duration || progress?.duration || 0);
    };
    const onTime = () => {
      setCurrent(video.currentTime);
      if (video.duration) setDuration(video.duration);
      onProgress(video.currentTime, video.duration || duration);
    };
    const onPlay = () => setPaused(false);
    const onPause = () => setPaused(true);
    video.addEventListener("loadedmetadata", onLoaded);
    video.addEventListener("timeupdate", onTime);
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    return () => {
      hls?.destroy();
      video.pause();
      video.removeAttribute("src");
      video.load();
      video.removeEventListener("loadedmetadata", onLoaded);
      video.removeEventListener("timeupdate", onTime);
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
    };
  }, [item.id]);

  useEffect(() => { if (videoRef.current) videoRef.current.playbackRate = Number(speed); }, [speed]);

  const togglePlay = () => { const video = videoRef.current; if (!video) return; if (video.paused) void video.play().catch(() => undefined); else video.pause(); revealControls(); };
  const toggleCaptions = () => {
    setCaptions((value) => !value);
    const tracks = videoRef.current?.textTracks;
    if (tracks) for (let index = 0; index < tracks.length; index += 1) tracks[index].mode = !captions ? "showing" : "hidden";
  };
  const seek = (value: number) => { if (videoRef.current) videoRef.current.currentTime = value; setCurrent(value); revealControls(); };
  const toggleFullscreen = () => { if (!document.fullscreenElement) void playerRef.current?.requestFullscreen(); else void document.exitFullscreen(); };
  const togglePip = () => { const video = videoRef.current; if (video && document.pictureInPictureEnabled && !document.pictureInPictureElement && video.readyState >= HTMLMediaElement.HAVE_METADATA) void video.requestPictureInPicture().catch(() => undefined); };

  return <div ref={playerRef} className="fixed inset-0 z-[100] flex items-center justify-center bg-black" onMouseMove={revealControls} onTouchStart={revealControls} data-testid="lux-player-overlay">
    <video ref={videoRef} playsInline controls={false} className="size-full object-contain" poster={item.poster || item.logo || undefined} data-testid="lux-player-video" />
    <div className={`pointer-events-none absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-black/90 transition-opacity duration-300 ${controlsVisible ? "opacity-100" : "opacity-0"}`} />
    <div className={`absolute inset-x-0 top-0 flex items-center justify-between p-4 transition-opacity duration-300 sm:p-7 ${controlsVisible ? "opacity-100" : "pointer-events-none opacity-0"}`}>
      <Button variant="ghost" onClick={onClose} data-testid="player-close-button" className="pointer-events-auto text-white hover:bg-white/10"><ChevronLeft /> Voltar</Button>
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
        {nextItem && <Button size="sm" onClick={onNext} data-testid="player-next-button" className="ml-auto bg-white text-black hover:bg-zinc-200"><ListVideo /> Próximo episódio</Button>}
        <Settings2 className="ml-auto hidden size-4 text-zinc-600 sm:block" data-testid="player-settings-icon" />
      </div>
    </div>
    <Button size="icon" variant="ghost" onClick={onClose} data-testid="player-dismiss-button" className="absolute top-4 right-4 text-white hover:bg-white/10 sm:hidden"><X /></Button>
  </div>;
}