import { useEffect, useState } from "react";
import { Check, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Play, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { handleMediaImageError, mediaProxyUrl } from "@/lib/media";
import type { MediaItem } from "@/lib/luxTypes";

export const CATALOG_PAGE_SIZE = 48;

interface CatalogGridProps {
  title: string;
  items: MediaItem[];
  page: number;
  onPageChange: (page: number) => void;
  myList: string[];
  onPlay: (item: MediaItem) => void;
  onToggleList: (item: MediaItem) => void;
}

function Pagination({ page, totalPages, totalItems, onPageChange, position }: { page: number; totalPages: number; totalItems: number; onPageChange: (page: number) => void; position: "top" | "bottom" }) {
  const [jump, setJump] = useState(String(page));
  useEffect(() => setJump(String(page)), [page]);
  const go = (next: number) => onPageChange(Math.min(totalPages, Math.max(1, next)));

  return <div className="flex flex-wrap items-center gap-2" data-testid={`catalog-pagination-${position}`}>
    <span className="mr-2 text-sm text-zinc-500" data-testid={`catalog-pagination-summary-${position}`}>Página {page.toLocaleString("pt-BR")} de {totalPages.toLocaleString("pt-BR")} · {totalItems.toLocaleString("pt-BR")} títulos</span>
    <Button size="icon-sm" variant="outline" disabled={page === 1} onClick={() => go(1)} aria-label="Primeira página" data-testid={`catalog-first-page-button-${position}`} className="border-white/10 bg-white/[0.03]"><ChevronsLeft /></Button>
    <Button size="icon-sm" variant="outline" disabled={page === 1} onClick={() => go(page - 1)} aria-label="Página anterior" data-testid={`catalog-previous-page-button-${position}`} className="border-white/10 bg-white/[0.03]"><ChevronLeft /></Button>
    <form onSubmit={(event) => { event.preventDefault(); go(Number(jump) || 1); }} className="flex items-center gap-2" data-testid={`catalog-page-jump-form-${position}`}>
      <label htmlFor={`catalog-page-input-${position}`} className="sr-only">Ir para página</label>
      <input id={`catalog-page-input-${position}`} type="number" min={1} max={totalPages} value={jump} onChange={(event) => setJump(event.target.value)} data-testid={`catalog-page-input-${position}`} className="h-7 w-20 rounded-lg border border-white/10 bg-white/[0.04] px-2 text-center text-sm text-white outline-none focus:border-purple-400" />
      <Button size="sm" type="submit" variant="ghost" data-testid={`catalog-page-go-button-${position}`}>Ir</Button>
    </form>
    <Button size="icon-sm" variant="outline" disabled={page === totalPages} onClick={() => go(page + 1)} aria-label="Próxima página" data-testid={`catalog-next-page-button-${position}`} className="border-white/10 bg-white/[0.03]"><ChevronRight /></Button>
    <Button size="icon-sm" variant="outline" disabled={page === totalPages} onClick={() => go(totalPages)} aria-label="Última página" data-testid={`catalog-last-page-button-${position}`} className="border-white/10 bg-white/[0.03]"><ChevronsRight /></Button>
  </div>;
}

export default function CatalogGrid({ title, items, page, onPageChange, myList, onPlay, onToggleList }: CatalogGridProps) {
  const totalPages = Math.max(1, Math.ceil(items.length / CATALOG_PAGE_SIZE));
  const safePage = Math.min(totalPages, Math.max(1, page));
  const start = (safePage - 1) * CATALOG_PAGE_SIZE;
  const pageItems = items.slice(start, start + CATALOG_PAGE_SIZE);

  return <section className="px-5 pb-8 pt-10 sm:px-8 lg:px-12" data-testid="catalog-grid-section">
    <div className="mb-7 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
      <div><p className="text-xs font-semibold tracking-[0.22em] text-purple-300" data-testid="catalog-grid-kicker">CATÁLOGO COMPLETO</p><h1 className="mt-1 font-heading text-3xl font-semibold tracking-tight" data-testid="catalog-grid-title">{title}</h1></div>
      <Pagination page={safePage} totalPages={totalPages} totalItems={items.length} onPageChange={onPageChange} position="top" />
    </div>
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8" data-testid="catalog-page-items">
      {pageItems.map((item) => <article key={item.id} className="group overflow-hidden rounded-xl border border-white/10 bg-zinc-900 transition-transform duration-300 hover:-translate-y-1 hover:border-purple-400/60" data-testid={`catalog-grid-card-${item.id}`}>
        <button type="button" onClick={() => onPlay(item)} data-testid={`catalog-grid-play-${item.id}`} className="relative block aspect-[2/3] w-full overflow-hidden bg-gradient-to-br from-purple-950 via-zinc-900 to-black text-left focus-visible:ring-2 focus-visible:ring-purple-400">
          {(item.poster || item.logo) && <img onError={handleMediaImageError} src={mediaProxyUrl(item.poster || item.logo)} alt="" loading="lazy" className="absolute inset-0 size-full object-cover transition-transform duration-500 group-hover:scale-105" />}
          <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent" />
          <Badge className="absolute top-2 left-2 border-white/10 bg-black/65 text-[10px] text-white backdrop-blur" data-testid={`catalog-grid-kind-${item.id}`}>{item.kind === "live" ? "AO VIVO" : item.kind === "series" ? "SÉRIE" : "FILME"}</Badge>
          <span className="absolute right-2 bottom-2 flex size-8 items-center justify-center rounded-full bg-white text-black opacity-0 shadow-lg transition-opacity duration-200 group-hover:opacity-100"><Play className="size-4 fill-current" /></span>
        </button>
        <div className="p-3"><h2 className="truncate text-sm font-medium" data-testid={`catalog-grid-title-${item.id}`}>{item.title}</h2><p className="mt-1 truncate text-xs text-zinc-500" data-testid={`catalog-grid-group-${item.id}`}>{item.group || "Sua coleção"}</p><button type="button" onClick={() => onToggleList(item)} data-testid={`catalog-grid-list-${item.id}`} className="mt-3 flex items-center gap-1 text-xs text-zinc-400 hover:text-white">{myList.includes(item.id) ? <><Check className="size-3.5 text-purple-300" /> Na lista</> : <><Plus className="size-3.5" /> Minha lista</>}</button></div>
      </article>)}
    </div>
    <div className="mt-8 flex justify-end"><Pagination page={safePage} totalPages={totalPages} totalItems={items.length} onPageChange={onPageChange} position="bottom" /></div>
  </section>;
}