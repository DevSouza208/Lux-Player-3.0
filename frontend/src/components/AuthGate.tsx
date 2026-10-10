import { useEffect, useState, type ReactNode, type FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import { LoaderCircle, LockKeyhole, LogIn, ShieldCheck, Sparkles, KeyRound } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Account = { id: string; display_name: string | null; username: string | null; account_status: string | null; is_active: boolean | null };
type Props = { children: (id: string | undefined, logout: () => Promise<void>) => ReactNode };

function describeAuthError(message: string) {
  if (/invalid login credentials|invalid credentials/i.test(message)) return "Usuário/e-mail ou senha incorretos.";
  if (/email not confirmed/i.test(message)) return "Confirme seu e-mail antes de entrar.";
  if (/rate limit|too many requests/i.test(message)) return "Muitas tentativas. Aguarde alguns minutos.";
  return message || "Não foi possível autenticar agora.";
}

export default function AuthGate({ children }: Props) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(Boolean(supabase));
  const [checking, setChecking] = useState(false);
  const [account, setAccount] = useState<Account | null>(null);
  const [factorId, setFactorId] = useState("");
  const [requiresMfa, setRequiresMfa] = useState(false);
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [mode, setMode] = useState<"login" | "recover" | "new-password">("login");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [verifiedMfa, setVerifiedMfa] = useState(0);

  useEffect(() => {
    const client = supabase;
    if (!client) return;
    let mounted = true;
    const { data: { subscription } } = client.auth.onAuthStateChange((event, next) => {
      if (!mounted) return;
      setSession(next);
      setLoading(false);
      if (event === "PASSWORD_RECOVERY") setMode("new-password");
      if (event === "SIGNED_OUT") {
        setAccount(null);
        setRequiresMfa(false);
        setVerifiedMfa(0);
      }
    });
    void client.auth.getSession()
      .then(({ data, error: err }) => {
        if (!mounted) return;
        setSession(data.session);
        if (err) setError(describeAuthError(err.message));
      })
      .catch(() => { if (mounted) setError("O serviço de login não respondeu."); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    const client = supabase;
    if (!client || !session?.user.id) {
      setAccount(null);
      setChecking(false);
      return;
    }
    let mounted = true;
    setChecking(true);
    void (async () => {
      try {
        const [profile, assurance] = await Promise.all([
          client.from("profiles").select("id,display_name,username,account_status,is_active").eq("id", session.user.id).maybeSingle(),
          client.auth.mfa.getAuthenticatorAssuranceLevel(),
        ]);
        if (!mounted) return;
        if (profile.error) throw profile.error;
        if (assurance.error) throw assurance.error;
        setAccount((profile.data as Account | null) ?? null);
        const mustVerify = assurance.data.nextLevel === "aal2" && assurance.data.currentLevel !== "aal2";
        setRequiresMfa(mustVerify);
        if (mustVerify) {
          const { data, error: factorsError } = await client.auth.mfa.listFactors();
          if (factorsError) throw factorsError;
          if (mounted) setFactorId(data.totp?.find((factor) => factor.status === "verified")?.id ?? "");
        }
        if (mounted) setError("");
      } catch (err) {
        if (mounted) setError(describeAuthError(err instanceof Error ? err.message : "Não foi possível validar esta conta."));
      } finally {
        if (mounted) setChecking(false);
      }
    })();
    return () => { mounted = false; };
  }, [session?.user.id, session?.access_token, verifiedMfa]);

  const signOut = async () => {
    const client = supabase;
    if (!client) return;
    setAccount(null);
    setRequiresMfa(false);
    const { error: err } = await client.auth.signOut();
    if (err) setError(describeAuthError(err.message));
  };

  const submitLogin = async (event: FormEvent) => {
    event.preventDefault();
    const client = supabase;
    if (!client || busy) return;
    setBusy(true); setError(""); setMessage("");
    try {
      let email = identifier.trim();
      if (!email.includes("@")) {
        const { data, error: lookupError } = await client.functions.invoke("login-by-username", {
          body: { username: email.toLowerCase(), password },
        });
        if (lookupError || !data?.email) throw new Error(data?.error || "Usuário ou senha inválidos.");
        email = data.email;
      }
      const { error: authError } = await client.auth.signInWithPassword({ email, password });
      if (authError) throw authError;
      setPassword("");
    } catch (err) {
      setError(describeAuthError(err instanceof Error ? err.message : "Não foi possível entrar."));
    } finally { setBusy(false); }
  };

  const submitRecovery = async (event: FormEvent) => {
    event.preventDefault();
    const client = supabase;
    if (!client || busy) return;
    if (!identifier.includes("@")) return setError("Digite o e-mail da sua conta para recuperar a senha.");
    setBusy(true); setError(""); setMessage("");
    const redirectTo = window.location.origin + import.meta.env.BASE_URL;
    const { error: recoveryError } = await client.auth.resetPasswordForEmail(identifier.trim(), { redirectTo });
    if (recoveryError) setError(describeAuthError(recoveryError.message));
    else setMessage("Se o e-mail estiver cadastrado, você receberá um link de recuperação.");
    setBusy(false);
  };

  const submitNewPassword = async (event: FormEvent) => {
    event.preventDefault();
    const client = supabase;
    if (!client || busy) return;
    if (newPassword.length < 8) return setError("Escolha uma senha com pelo menos 8 caracteres.");
    setBusy(true); setError("");
    const { error: updateError } = await client.auth.updateUser({ password: newPassword });
    if (updateError) setError(describeAuthError(updateError.message));
    else { setMode("login"); setNewPassword(""); setMessage("Senha atualizada com sucesso."); }
    setBusy(false);
  };

  const submitMfa = async (event: FormEvent) => {
    event.preventDefault();
    const client = supabase;
    if (!client || busy || !factorId) return;
    setBusy(true); setError("");
    const { error: mfaError } = await client.auth.mfa.challengeAndVerify({ factorId, code: mfaCode.trim() });
    if (mfaError) setError(describeAuthError(mfaError.message));
    else { setMfaCode(""); setVerifiedMfa((old) => old + 1); }
    setBusy(false);
  };

  // The Emergent local preview can still run unchanged when no Supabase env is supplied.
  if (!supabase) return <>{children(undefined, async () => undefined)}</>;
  if (loading || (session && checking)) return <div className="flex min-h-svh items-center justify-center bg-black text-purple-200"><LoaderCircle className="mr-3 size-6 animate-spin" /> Verificando acesso ao Lux...</div>;
  if (session && account && account.is_active !== false && account.account_status === "active" && !requiresMfa && mode !== "new-password") {
    return <>{children(session.user.id, signOut)}</>;
  }

  const content = session && mode !== "new-password"
    ? requiresMfa
      ? <form onSubmit={(event) => void submitMfa(event)} className="mt-8 space-y-4" data-testid="lux-mfa-form">
          <div className="flex items-center gap-2 text-purple-200"><ShieldCheck className="size-5" /> Verificação em duas etapas</div>
          <p className="text-sm text-zinc-400">Digite o código de 6 dígitos do seu autenticador.</p>
          <Input value={mfaCode} onChange={(event) => setMfaCode(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" placeholder="000000" maxLength={6} required className="h-12 border-white/10 bg-white/[0.05] text-center tracking-[0.3em]" />
          {!factorId && <p className="text-sm text-rose-300">Não foi encontrado um autenticador ativo. Contate o administrador.</p>}
          <Button disabled={busy || !factorId || mfaCode.length !== 6} type="submit" className="h-11 w-full bg-purple-600 text-white hover:bg-purple-500">Validar código</Button>
        </form>
      : <div className="mt-8 space-y-4" data-testid="lux-account-pending">
          <p className="text-sm text-zinc-300">{!account ? "O perfil desta conta não foi encontrado. Contate o administrador." : account.is_active === false ? "Esta conta está desativada." : "Esta conta está aguardando ativação pelo administrador."}</p>
          <Button type="button" onClick={() => void signOut()} variant="outline" className="w-full border-white/20 text-white">Sair da conta</Button>
        </div>
    : mode === "new-password"
    ? <form onSubmit={(event) => void submitNewPassword(event)} className="mt-8 space-y-4">
        <label htmlFor="lux-new-password" className="text-sm text-zinc-300">Nova senha</label>
        <Input id="lux-new-password" type="password" autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} minLength={8} required className="h-12 border-white/10 bg-white/[0.05]" />
        <Button disabled={busy} type="submit" className="h-11 w-full bg-purple-600">Alterar senha</Button>
      </form>
    : <form onSubmit={(event) => void (mode === "recover" ? submitRecovery(event) : submitLogin(event))} className="mt-8 space-y-4" data-testid="lux-account-login">
        <div><label htmlFor="lux-identifier" className="text-sm text-zinc-300">{mode === "recover" ? "E-mail" : "E-mail ou Lux ID"}</label>
          <Input id="lux-identifier" autoComplete="username" value={identifier} onChange={(event) => setIdentifier(event.target.value)} placeholder={mode === "recover" ? "seu@email.com" : "Seu usuário ou e-mail"} required className="mt-2 h-12 border-white/10 bg-white/[0.05]" /></div>
        {mode === "login" && <div><label htmlFor="lux-password" className="text-sm text-zinc-300">Senha</label>
          <Input id="lux-password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required className="mt-2 h-12 border-white/10 bg-white/[0.05]" /></div>}
        <Button disabled={busy} type="submit" className="h-12 w-full bg-purple-600 text-white hover:bg-purple-500">{busy ? <LoaderCircle className="animate-spin" /> : mode === "recover" ? <KeyRound /> : <LogIn />}{mode === "recover" ? "Enviar recuperação" : "Entrar no Lux"}</Button>
        <button type="button" onClick={() => { setMode(mode === "recover" ? "login" : "recover"); setError(""); setMessage(""); }} className="w-full py-1 text-center text-sm text-purple-300 hover:text-white">{mode === "recover" ? "Voltar ao login" : "Esqueceu sua senha?"}</button>
      </form>;

  return <main className="flex min-h-svh items-center justify-center bg-black px-5 py-12 text-white" data-testid="lux-auth-gate">
    <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_80%_0%,rgba(147,51,234,0.24),transparent_35%),radial-gradient(circle_at_0%_100%,rgba(126,34,206,0.16),transparent_35%)]" />
    <div className="relative w-full max-w-md rounded-3xl border border-white/10 bg-[#0c0a11] p-7 shadow-2xl shadow-purple-950/25 sm:p-9">
      <div className="mb-6 flex items-center gap-2 text-xs font-bold tracking-[0.32em] text-purple-300"><Sparkles className="size-5" /> LUX PLAYER 3.0</div>
      <div className="mb-3 flex size-12 items-center justify-center rounded-xl bg-purple-600/20 text-purple-300"><LockKeyhole className="size-6" /></div>
      <h1 className="font-heading text-3xl font-semibold tracking-tight">{mode === "recover" ? "Recuperar acesso" : mode === "new-password" ? "Escolha uma nova senha" : requiresMfa ? "Confirme sua identidade" : "Seu espaço começa aqui."}</h1>
      <p className="mt-3 text-sm leading-6 text-zinc-400">{mode === "login" && !session ? "Entre com sua conta Lux para acessar sua biblioteca." : "Suas informações de acesso são protegidas pelo Supabase Auth."}</p>
      {content}
      {error && <p role="alert" className="mt-5 rounded-lg border border-red-400/20 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</p>}
      {message && <p className="mt-5 rounded-lg border border-purple-400/20 bg-purple-500/10 px-3 py-2 text-sm text-purple-200">{message}</p>}
    </div>
  </main>;
}
