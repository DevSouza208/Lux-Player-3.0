import { useState } from "react";
import { LockKeyhole, Plus, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Profile } from "@/lib/luxTypes";
import { createLocalId } from "@/lib/storage";

const AVATARS = ["✦", "◈", "☾", "✹", "✧", "◆", "◌", "✺"];

interface ProfileGateProps {
  profiles: Profile[];
  initial: boolean;
  onSelect: (profile: Profile) => void;
  onCreate: (profile: Profile) => void;
  onClose?: () => void;
}

export default function ProfileGate({ profiles, initial, onSelect, onCreate, onClose }: ProfileGateProps) {
  const [creating, setCreating] = useState(profiles.length === 0);
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [avatar, setAvatar] = useState(AVATARS[0]);
  const [unlocking, setUnlocking] = useState<Profile | null>(null);
  const [unlockPin, setUnlockPin] = useState("");
  const [error, setError] = useState("");

  const createProfile = () => {
    const trimmed = name.trim();
    if (!trimmed) return setError("Dê um nome ao seu perfil.");
    onCreate({ id: createLocalId("profile"), name: trimmed, avatar, pin: pin.trim() || undefined });
    setName("");
    setPin("");
    setCreating(false);
    setError("");
  };

  const chooseProfile = (profile: Profile) => {
    if (profile.pin) return setUnlocking(profile);
    onSelect(profile);
  };

  const confirmPin = () => {
    if (!unlocking) return;
    if (unlockPin === unlocking.pin) {
      onSelect(unlocking);
      setUnlocking(null);
      setUnlockPin("");
    } else setError("PIN incorreto. Tente novamente.");
  };

  return (
    <div className="fixed inset-0 z-[80] flex min-h-svh items-center justify-center overflow-y-auto bg-black px-5 py-10 text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_20%,rgba(147,51,234,0.18),transparent_35%),radial-gradient(circle_at_20%_90%,rgba(126,34,206,0.12),transparent_32%)]" />
      {onClose && <Button variant="ghost" size="icon" onClick={onClose} data-testid="profile-gate-close-button" className="absolute top-6 right-6 text-zinc-400 hover:text-white"><X /></Button>}
      <div className="relative w-full max-w-4xl">
        <div className="mb-12 text-center">
          <div className="mb-5 flex items-center justify-center gap-2 text-sm font-semibold tracking-[0.32em] text-purple-300" data-testid="profile-gate-brand"><Sparkles className="size-4" /> LUX PLAYER</div>
          <h1 className="font-heading text-4xl font-bold tracking-tight sm:text-6xl" data-testid="profile-gate-title">Quem está assistindo?</h1>
          <p className="mx-auto mt-4 max-w-md text-zinc-400" data-testid="profile-gate-description">Crie até quatro espaços locais. Sua jornada fica só neste dispositivo.</p>
        </div>

        {!creating && !unlocking && <div className="grid grid-cols-2 gap-4 sm:grid-cols-4" data-testid="profile-list">
          {profiles.map((profile) => <button key={profile.id} type="button" onClick={() => chooseProfile(profile)} data-testid={`profile-select-${profile.id}`} className="group rounded-2xl border border-white/10 bg-white/[0.04] p-3 text-left transition-transform duration-300 hover:-translate-y-1 hover:border-purple-400/70 hover:bg-purple-500/10 focus-visible:ring-2 focus-visible:ring-purple-400">
            <div className="flex aspect-square items-center justify-center rounded-xl bg-gradient-to-br from-purple-600/80 to-fuchsia-900 text-5xl shadow-[0_0_30px_rgba(147,51,234,0.2)] transition-transform duration-300 group-hover:scale-[1.03]" data-testid={`profile-avatar-${profile.id}`}>{profile.avatar}</div>
            <div className="mt-3 flex items-center gap-2 font-medium" data-testid={`profile-name-${profile.id}`}>{profile.name}{profile.pin && <LockKeyhole className="size-3.5 text-purple-300" />}</div>
          </button>)}
          {profiles.length < 4 && <button type="button" onClick={() => setCreating(true)} data-testid="profile-add-button" className="group rounded-2xl border border-dashed border-white/15 bg-white/[0.02] p-3 text-left transition-colors hover:border-purple-400 hover:bg-purple-500/10 focus-visible:ring-2 focus-visible:ring-purple-400">
            <div className="flex aspect-square items-center justify-center rounded-xl border border-white/10 text-zinc-500 transition-colors group-hover:text-purple-200"><Plus className="size-10" /></div>
            <div className="mt-3 font-medium text-zinc-400 group-hover:text-white" data-testid="profile-add-label">Adicionar perfil</div>
          </button>}
        </div>}

        {creating && <div className="mx-auto max-w-md rounded-3xl border border-white/10 bg-white/[0.05] p-6 shadow-2xl backdrop-blur-xl" data-testid="profile-create-form">
          <h2 className="font-heading text-2xl font-semibold" data-testid="profile-create-title">Seu espaço no Lux</h2>
          <p className="mt-2 text-sm text-zinc-400" data-testid="profile-create-description">Escolha um nome, um avatar e, se quiser, um PIN.</p>
          <label className="mt-6 block text-sm text-zinc-300" htmlFor="profile-name">Nome do perfil</label>
          <Input id="profile-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex.: Rafa" data-testid="profile-name-input" className="mt-2 h-11 border-white/10 bg-black/30" />
          <label className="mt-4 block text-sm text-zinc-300" htmlFor="profile-pin">PIN opcional</label>
          <Input id="profile-pin" value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" placeholder="Sem PIN" data-testid="profile-pin-input" className="mt-2 h-11 border-white/10 bg-black/30" />
          <div className="mt-5 grid grid-cols-8 gap-2" data-testid="profile-avatar-picker">
            {AVATARS.map((option) => <button type="button" key={option} onClick={() => setAvatar(option)} data-testid={`profile-avatar-option-${option}`} className={`flex size-9 items-center justify-center rounded-lg border text-lg transition-transform duration-200 hover:scale-110 ${avatar === option ? "border-purple-400 bg-purple-500/25" : "border-white/10 bg-black/20"}`}>{option}</button>)}
          </div>
          {error && <p className="mt-4 text-sm text-rose-300" data-testid="profile-error-message">{error}</p>}
          <div className="mt-6 flex gap-3">
            {!initial && <Button variant="ghost" onClick={() => setCreating(false)} data-testid="profile-create-cancel-button">Cancelar</Button>}
            <Button className="flex-1 bg-purple-600 text-white hover:bg-purple-500" onClick={createProfile} data-testid="profile-create-submit-button">Entrar no Lux</Button>
          </div>
        </div>}

        {unlocking && <div className="mx-auto max-w-sm rounded-3xl border border-white/10 bg-white/[0.05] p-6 text-center shadow-2xl backdrop-blur-xl" data-testid="profile-pin-form">
          <div className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-purple-600/30 text-3xl">{unlocking.avatar}</div>
          <h2 className="mt-4 font-heading text-2xl font-semibold" data-testid="profile-pin-title">Perfil {unlocking.name}</h2>
          <Input value={unlockPin} onChange={(event) => setUnlockPin(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" type="password" placeholder="Digite o PIN" data-testid="profile-unlock-input" className="mt-5 h-11 border-white/10 bg-black/30 text-center tracking-[0.5em]" />
          {error && <p className="mt-3 text-sm text-rose-300" data-testid="profile-unlock-error">{error}</p>}
          <Button className="mt-5 w-full bg-purple-600 text-white hover:bg-purple-500" onClick={confirmPin} data-testid="profile-unlock-submit-button">Desbloquear</Button>
        </div>}
      </div>
    </div>
  );
}