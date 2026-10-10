import { useRef, useState } from "react";
import { FileUp, Link2, LoaderCircle, Server, UploadCloud, X } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiGetStream, apiPost } from "@/lib/api";
import { normalizeRemoteItems, parseM3UAsync, parseM3UStream } from "@/lib/playlist";
import { createLocalId } from "@/lib/storage";
import type { PlaylistParseResult, PlaylistRecord, MediaItem } from "@/lib/luxTypes";

interface ImportCenterProps { onClose: () => void; onImported: (items: MediaItem[], playlist: PlaylistRecord) => void; }

export default function ImportCenter({ onClose, onImported }: ImportCenterProps) {
  const [mode, setMode] = useState<"file" | "url" | "xstream">("file");
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [server, setServer] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [fileLoading, setFileLoading] = useState(false);
  const [error, setError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  const finish = (items: MediaItem[], playlistName: string, sourceType: PlaylistRecord["sourceType"]) => {
    if (!items.length) return setError("Nenhum conteúdo compatível foi encontrado.");
    const playlistId = items[0]?.playlistId || createLocalId("playlist");
    const playlist: PlaylistRecord = { id: playlistId, name: playlistName || "Minha playlist", sourceType, importedAt: new Date().toISOString(), itemCount: items.length };
    onImported(items.map((item) => ({ ...item, playlistId })), playlist);
    toast.success(`${items.length} títulos adicionados ao Lux Player`);
    onClose();
  };

  const urlImport = useMutation({
    mutationFn: () => apiGetStream(`/playlists/proxy?url=${encodeURIComponent(url.trim())}`),
    onSuccess: async (stream) => { const playlistId = createLocalId("playlist"); const parsed = await parseM3UStream(stream, playlistId); finish(parsed.items, name || "Playlist remota", "url"); if (parsed.truncated) toast.warning("A fonte ultrapassou 500.000 itens; importamos esse limite de segurança."); },
    onError: (mutationError: Error) => setError(mutationError.message || "Não foi possível carregar essa URL."),
  });
  const xstreamImport = useMutation({
    mutationFn: (payload: Record<string, string | undefined>) => apiPost<PlaylistParseResult>("/playlists/parse-url", payload),
    onSuccess: (result) => { const playlistId = createLocalId("playlist"); finish(normalizeRemoteItems(result.items, playlistId), name || result.playlist_name, mode); },
    onError: (mutationError: Error) => setError(mutationError.message || "Não foi possível importar essa fonte."),
  });

  const handleFile = async (file?: File) => {
    if (!file) return;
    setFileLoading(true); setError("");
    try {
      const playlistId = createLocalId("playlist");
      const items = await parseM3UAsync(await file.text(), playlistId);
      finish(items, name || file.name.replace(/\.(m3u8?|txt)$/i, ""), "file");
    } catch { setError("Não foi possível ler este arquivo."); } finally { setFileLoading(false); }
  };

  const submit = () => {
    setError("");
    if (mode === "url" && !url.trim()) return setError("Cole a URL da playlist M3U/M3U8.");
    const fullXstreamUrl = /[?&]username=/.test(server) && /[?&]password=/.test(server);
    if (mode === "xstream" && (!server.trim() || ((!username.trim() || !password.trim()) && !fullXstreamUrl))) return setError("Preencha servidor, usuário e senha do XStream ou cole uma URL completa com essas credenciais.");
    if (mode === "url") urlImport.mutate();
    else xstreamImport.mutate({ source_type: "xstream", server: server.trim(), username: username.trim() || undefined, password: password.trim() || undefined, playlist_name: name.trim() || undefined });
  };

  const busy = fileLoading || urlImport.isPending || xstreamImport.isPending;
  return <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/75 p-3 backdrop-blur-sm sm:items-center sm:p-6" data-testid="import-center-overlay">
    <div className="relative max-h-[92svh] w-full max-w-3xl overflow-y-auto rounded-3xl border border-white/10 bg-[#0b0a0f] p-5 shadow-2xl shadow-purple-950/30 sm:p-8" data-testid="import-center-dialog">
      <Button variant="ghost" size="icon" onClick={onClose} data-testid="import-close-button" className="absolute top-4 right-4 text-zinc-400 hover:text-white"><X /></Button>
      <div className="max-w-xl"><p className="text-xs font-semibold tracking-[0.24em] text-purple-300" data-testid="import-kicker">YOUR LIBRARY</p><h2 className="mt-2 font-heading text-3xl font-semibold" data-testid="import-title">Adicione sua primeira fonte</h2><p className="mt-2 text-sm leading-6 text-zinc-400" data-testid="import-description">O Lux organiza a lista localmente no seu dispositivo. Nenhum catálogo de demonstração será misturado ao seu.</p></div>
      <div className="mt-7 grid grid-cols-3 gap-2 rounded-xl bg-white/[0.04] p-1" data-testid="import-mode-tabs">
        <button type="button" onClick={() => setMode("file")} data-testid="import-mode-file" className={`flex items-center justify-center gap-2 rounded-lg px-3 py-3 text-sm transition-colors ${mode === "file" ? "bg-purple-600 text-white" : "text-zinc-400 hover:text-white"}`}><FileUp className="size-4" /> Arquivo</button>
        <button type="button" onClick={() => setMode("url")} data-testid="import-mode-url" className={`flex items-center justify-center gap-2 rounded-lg px-3 py-3 text-sm transition-colors ${mode === "url" ? "bg-purple-600 text-white" : "text-zinc-400 hover:text-white"}`}><Link2 className="size-4" /> URL M3U</button>
        <button type="button" onClick={() => setMode("xstream")} data-testid="import-mode-xstream" className={`flex items-center justify-center gap-2 rounded-lg px-3 py-3 text-sm transition-colors ${mode === "xstream" ? "bg-purple-600 text-white" : "text-zinc-400 hover:text-white"}`}><Server className="size-4" /> XStream</button>
      </div>
      <label className="mt-6 block text-sm text-zinc-300" htmlFor="playlist-name">Nome da fonte <span className="text-zinc-600">(opcional)</span></label>
      <Input id="playlist-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex.: Minha TV" data-testid="import-name-input" className="mt-2 h-11 border-white/10 bg-white/[0.04]" />
      {mode === "file" && <div className="mt-5 rounded-2xl border border-dashed border-purple-300/30 bg-purple-500/[0.06] p-8 text-center" data-testid="import-file-panel"><UploadCloud className="mx-auto size-9 text-purple-300" /><h3 className="mt-3 font-medium" data-testid="import-file-title">Arraste sua lista para cá</h3><p className="mt-1 text-sm text-zinc-500" data-testid="import-file-help">M3U, M3U8 ou TXT com extensão M3U</p><input ref={fileInput} type="file" accept=".m3u,.m3u8,.txt,audio/x-mpegurl,application/x-mpegurl,text/plain" onChange={(event) => void handleFile(event.target.files?.[0])} className="mt-5 block w-full text-sm text-zinc-400 file:mr-3 file:rounded-lg file:border-0 file:bg-white/10 file:px-3 file:py-2 file:text-sm file:text-white hover:file:bg-white/20" data-testid="import-file-input" /></div>}
      {mode === "url" && <div className="mt-5" data-testid="import-url-panel"><label className="text-sm text-zinc-300" htmlFor="playlist-url">URL da playlist</label><Input id="playlist-url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://servidor.com/lista.m3u" data-testid="import-url-input" className="mt-2 h-11 border-white/10 bg-white/[0.04]" /></div>}
      {mode === "xstream" && <div className="mt-5 grid gap-3 sm:grid-cols-2" data-testid="import-xstream-panel"><div className="sm:col-span-2"><label className="text-sm text-zinc-300" htmlFor="xstream-server">Servidor ou URL completa</label><Input id="xstream-server" value={server} onChange={(event) => setServer(event.target.value)} placeholder="https://servidor:8080" data-testid="xstream-server-input" className="mt-2 h-11 border-white/10 bg-white/[0.04]" /></div><div><label className="text-sm text-zinc-300" htmlFor="xstream-username">Usuário</label><Input id="xstream-username" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="username" data-testid="xstream-username-input" className="mt-2 h-11 border-white/10 bg-white/[0.04]" /></div><div><label className="text-sm text-zinc-300" htmlFor="xstream-password">Senha</label><Input id="xstream-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="password" data-testid="xstream-password-input" className="mt-2 h-11 border-white/10 bg-white/[0.04]" /></div></div>}
      {error && <p className="mt-4 rounded-lg border border-rose-400/20 bg-rose-400/10 px-3 py-2 text-sm text-rose-200" data-testid="import-error-message">{error}</p>}
      {(mode === "url" || mode === "xstream") && <Button disabled={busy} onClick={submit} className="mt-6 h-11 w-full bg-purple-600 text-white hover:bg-purple-500" data-testid="import-submit-button">{busy ? <><LoaderCircle className="animate-spin" /> Carregando catálogo...</> : "Carregar catálogo"}</Button>}
      {mode === "file" && <p className="mt-5 text-center text-xs text-zinc-600" data-testid="import-local-note">A leitura do arquivo acontece localmente, sem enviar sua lista.</p>}
    </div>
  </div>;
}