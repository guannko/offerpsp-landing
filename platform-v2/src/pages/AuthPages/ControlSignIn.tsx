import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import PageMeta from "../../components/common/PageMeta";
import { useControlBridge } from "../../context/ControlBridgeContext";
import { supabase } from "../../lib/supabase";

export default function ControlSignIn() {
  const { user, staff } = useControlBridge();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const authRedirectUrl = new URL(import.meta.env.BASE_URL, window.location.origin).toString();

  useEffect(() => { if (user && staff) navigate("/", { replace: true }); }, [user, staff, navigate]);

  async function passwordLogin(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setStatus("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false); if (error) setStatus(error.message);
  }

  async function googleLogin() {
    setBusy(true); setStatus("");
    const { error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: authRedirectUrl } });
    if (error) { setStatus(error.message); setBusy(false); }
  }

  async function magicLink() {
    if (!email) { setStatus("Сначала укажи рабочий email."); return; }
    setBusy(true); setStatus("");
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: authRedirectUrl, shouldCreateUser: false } });
    setBusy(false); setStatus(error ? error.message : "Ссылка отправлена. Проверь почту.");
  }

  return <div className="grid min-h-screen bg-gray-950 lg:grid-cols-2"><PageMeta title="Вход | OfferPSP Control Bridge" description="Защищённая операционная панель OfferPSP."/><div className="hidden flex-col justify-between overflow-hidden bg-gradient-to-br from-[#111827] via-[#19152b] to-[#34142d] p-12 text-white lg:flex"><div className="flex items-center gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-theme-purple-500 font-black">OP</span><div><strong className="block text-lg">OfferPSP</strong><span className="text-xs uppercase tracking-[0.22em] text-white/50">Control Bridge</span></div></div><div><p className="text-sm font-semibold uppercase tracking-[0.2em] text-theme-pink-500">Captain's Bridge</p><h1 className="mt-5 max-w-xl text-5xl font-semibold leading-tight">Мерчи, PSP, офферы и сделки — в одной системе.</h1><p className="mt-6 max-w-lg text-lg text-white/60">Закрытая операционная панель команды OfferPSP. Настоящие поставщики и ставки защищены до контролируемого знакомства.</p></div><span className="text-xs text-white/30">BRAININDEX OÜ · Internal operations</span></div><div className="flex items-center justify-center bg-white p-6 dark:bg-gray-900"><div className="w-full max-w-md"><div className="mb-8 lg:hidden"><span className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-500 font-black text-white">OP</span></div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-500">Secure staff access</p><h2 className="mt-3 text-3xl font-semibold text-gray-900 dark:text-white">Войти в Control Bridge</h2><p className="mt-2 text-sm text-gray-500">Доступ только для подтверждённых сотрудников OfferPSP.</p><button onClick={()=>void googleLogin()} disabled={busy} className="mt-8 flex w-full items-center justify-center gap-3 rounded-lg border border-gray-200 px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-white/5"><span className="font-bold text-brand-500">G</span>Продолжить с Google</button><div className="my-6 flex items-center gap-3"><span className="h-px flex-1 bg-gray-200 dark:bg-gray-800"/><span className="text-xs text-gray-400">или рабочий email</span><span className="h-px flex-1 bg-gray-200 dark:bg-gray-800"/></div><form onSubmit={passwordLogin} className="space-y-4"><label className="block"><span className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Email</span><input value={email} onChange={(event)=>setEmail(event.target.value)} type="email" required className="h-11 w-full rounded-lg border border-gray-200 px-3 text-sm outline-none focus:border-brand-400 dark:border-gray-700 dark:bg-gray-900 dark:text-white"/></label><label className="block"><span className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Пароль</span><input value={password} onChange={(event)=>setPassword(event.target.value)} type="password" className="h-11 w-full rounded-lg border border-gray-200 px-3 text-sm outline-none focus:border-brand-400 dark:border-gray-700 dark:bg-gray-900 dark:text-white"/></label><button disabled={busy} className="w-full rounded-lg bg-brand-500 px-4 py-3 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50">{busy ? "Проверяю…" : "Войти"}</button></form><button onClick={()=>void magicLink()} disabled={busy} className="mt-3 w-full rounded-lg px-4 py-2 text-sm font-medium text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-500/10">Отправить безопасную ссылку</button>{status && <p className="mt-4 rounded-lg bg-warning-50 p-3 text-sm text-warning-700 dark:bg-warning-500/10 dark:text-warning-300">{status}</p>}</div></div></div>;
}
