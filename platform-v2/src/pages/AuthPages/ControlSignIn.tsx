import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import PageMeta from "../../components/common/PageMeta";
import { useControlBridge } from "../../context/ControlBridgeContext";
import { supabase } from "../../lib/supabase";

export default function ControlSignIn() {
  const { user, staff } = useControlBridge();
  const navigate = useNavigate();
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const authRedirectUrl = new URL(import.meta.env.BASE_URL, window.location.origin).toString();

  useEffect(() => { if (user && staff) navigate("/", { replace: true }); }, [user, staff, navigate]);

  async function googleLogin() {
    setBusy(true); setStatus("");
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: authRedirectUrl,
        queryParams: {
          prompt: "select_account",
          login_hint: "guannko@gmail.com",
        },
      },
    });
    if (error) { setStatus(error.message); setBusy(false); }
  }

  return <div className="grid min-h-screen bg-gray-950 lg:grid-cols-2"><PageMeta title="Вход | OfferPSP Control Bridge" description="Защищённая операционная панель OfferPSP."/><div className="hidden flex-col justify-between overflow-hidden bg-gradient-to-br from-[#111827] via-[#19152b] to-[#34142d] p-12 text-white lg:flex"><div className="flex items-center gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-theme-purple-500 font-black">OP</span><div><strong className="block text-lg">OfferPSP</strong><span className="text-xs uppercase tracking-[0.22em] text-white/50">Control Bridge</span></div></div><div><p className="text-sm font-semibold uppercase tracking-[0.2em] text-theme-pink-500">Captain's Bridge</p><h1 className="mt-5 max-w-xl text-5xl font-semibold leading-tight">Мерчи, PSP, офферы и сделки — в одной системе.</h1><p className="mt-6 max-w-lg text-lg text-white/60">Закрытая операционная панель команды OfferPSP. Настоящие поставщики и ставки защищены до контролируемого знакомства.</p></div><span className="text-xs text-white/30">BRAININDEX OÜ · Internal operations</span></div><div className="flex items-center justify-center bg-white p-6 dark:bg-gray-900"><div className="w-full max-w-md"><div className="mb-8 lg:hidden"><span className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-500 font-black text-white">OP</span></div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-500">Owner access only</p><h2 className="mt-3 text-3xl font-semibold text-gray-900 dark:text-white">Войти в Control Bridge</h2><p className="mt-2 text-sm text-gray-500">Вход разрешён только через Google-аккаунт владельца.</p><div className="mt-6 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-700 dark:bg-white/5"><span className="text-xs uppercase tracking-[0.14em] text-gray-400">Разрешённый аккаунт</span><strong className="mt-1 block text-sm text-gray-800 dark:text-white">guannko@gmail.com</strong></div><button onClick={()=>void googleLogin()} disabled={busy} className="mt-6 flex w-full items-center justify-center gap-3 rounded-lg bg-brand-500 px-4 py-3 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50"><span className="font-bold">G</span>{busy ? "Перенаправляю…" : "Войти через Google"}</button>{status && <p className="mt-4 rounded-lg bg-warning-50 p-3 text-sm text-warning-700 dark:bg-warning-500/10 dark:text-warning-300">{status}</p>}</div></div></div>;
}
