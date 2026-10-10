import { Check, Info, Play, Plus } from "lucide-react";
import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { MediaItem } from "@/lib/luxTypes";

interface MediaRailProps {
  title: string;
  items: MediaItem[];
  landscape?: boolean;
  myList: string[];
  onPlay: (item: MediaItem) => void;
  onToggleList: (item: MediaItem) => void;
}

export default function MediaRail({ title, items, landscape, myList, onPlay, onToggleList }: MediaRailProps) {
  if (!items.length) return null;
  const displayItems = items.slice(0, 40);
  return <section className="relative mt-12" data-testid={`media-rail-${title.toLowerCase().replaceAll(" ", "-")}`}>
    <div className="mb-4 flex items-end justify-between gap-4 px-5 sm:px-8 lg:px-12">
      <div><p className="text-xs font-semibold tracking-[0.22em] text-purple-300" data-testid={`media-rail-kicker-${title}`}>LUX COLLECTION</p><h2 className="mt-1 font-heading text-2xl font-semibold tracking-tight text-white" data-testid={`media-rail-title-${title}`}>{title}</h2></div>
      <span className="text-sm text-zinc-500" data-testid={`media-rail-count-${title}`}>{items.length} títulos</span>
    </div>
    <div className="scrollbar-hide flex gap-3 overflow-x-auto px-5 pb-4 sm:gap-4 sm:px-8 lg:px-12">
      {displayItems.map((item, index) => <motion.article key={item.id} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(index * 0.025, 0.2) }} className={`group relative shrink-0 overflow-hidden rounded-xl border border-white/10 bg-zinc-900 shadow-lg transition-transform duration-300 hover:-translate-y-1 hover:border-purple-400/60 hover:shadow-[0_0_26px_rgba(147,51,234,0.22)] ${landscape ? "w-64 sm:w-80" : "w-36 sm:w-44"}`} data-testid={`media-card-${item.id}`}>
        <div className={`relative overflow-hidden bg-gradient-to-br from-purple-950 via-zinc-900 to-black ${landscape ? "aspect-video" : "aspect-[2/3]"}`}>
          {(item.poster || item.logo) && <img src={item.poster || item.logo || ""} alt="" loading="lazy" className="absolute inset-0 size-full object-cover opacity-90 transition-transform duration-500 group-hover:scale-105" />}
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/10 to-transparent" />
          <div className="absolute top-3 left-3"><Badge className="border-white/10 bg-black/60 text-[10px] text-zinc-200 backdrop-blur" data-testid={`media-kind-${item.id}`}>{item.kind === "live" ? "AO VIVO" : item.kind === "series" ? "SÉRIE" : "FILME"}</Badge></div>
          <div className="absolute inset-x-3 bottom-3 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
            <div className="flex gap-2"><Button size="icon-sm" onClick={() => onPlay(item)} data-testid={`media-play-${item.id}`} className="bg-white text-black hover:bg-zinc-200"><Play className="fill-current" /></Button><Button size="icon-sm" variant="outline" onClick={() => onToggleList(item)} data-testid={`media-list-${item.id}`} className="border-white/30 bg-black/50 text-white hover:bg-white/20">{myList.includes(item.id) ? <Check /> : <Plus />}</Button><Button size="icon-sm" variant="outline" onClick={() => onPlay(item)} data-testid={`media-info-${item.id}`} className="ml-auto border-white/30 bg-black/50 text-white hover:bg-white/20"><Info /></Button></div>
          </div>
        </div>
        <div className="p-3"><h3 className="truncate text-sm font-medium text-zinc-100" data-testid={`media-title-${item.id}`}>{item.title}</h3><p className="mt-1 truncate text-xs text-zinc-500" data-testid={`media-meta-${item.id}`}>{item.group || (item.kind === "live" ? "Canal ao vivo" : "Sua coleção")}</p></div>
      </motion.article>)}
    </div>
  </section>;
}