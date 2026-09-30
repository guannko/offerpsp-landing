import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import PageMeta from "../../components/common/PageMeta";
import { useControlBridge } from "../../context/ControlBridgeContext";
import { hasSupabaseConfig, supabase } from "../../lib/supabase";

export default function ControlSignIn() {
  const { user, staff } = useControlBridge();
  const navigate = useNavigate();
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const authBaseUrl = new URL(import.meta.env.BASE_URL, window.location.origin);
  const authRedirectUrl = new URL("signin", authBaseUrl).toString();

  useEffect(() => {
    if (!user || !staff) return;
    const stored = window.sessionStorage.getItem("offerpsp_post_auth_redirect") || "/";
    window.sessionStorage.removeItem("offerpsp_post_auth_redirect");
    const destination = stored.startsWith("/") && !stored.startsWith("//") ? stored : "/";
    navigate(destination, { replace: true });
  }, [user, staff, navigate]);

  async function googleLogin() {
    setBusy(true); setStatus("");
    if (!hasSupabaseConfig) {
      setStatus("Конфигурация входа не загружена. Обновите production deployment.");
      setBusy(false);
      return;
    }
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: authRedirectUrl,
        queryParams: {
          prompt: "select_account",
        },
      },
    });
    if (error) { setStatus(error.message); setBusy(false); }
  }

  return <div className="grid min-h-screen bg-gray-950 lg:grid-cols-2"><PageMeta title="Вход | OfferPSP Control Bridge" description="Защищённая операционная панель OfferPSP."/><div className="hidden flex-col justify-between overflow-hidden bg-gradient-to-br from-[#111827] via-[#19152b] to-[#34142d] p-12 text-white lg:flex"><div><img src="/brand/offerpsp-logo-horizontal-transparent.png" alt="OfferPSP" className="h-14 w-auto max-w-[260px] object-contain"/><span className="mt-2 block text-xs uppercase tracking-[0.22em] text-white/50">Control Bridge</span></div><div><p className="text-sm font-semibold uppercase tracking-[0.2em] text-theme-pink-500">Captain's Bridge</p><h1 className="mt-5 max-w-xl text-5xl font-semibold leading-tight">Мерчи, PSP, офферы и сделки — в одной системе.</h1><p className="mt-6 max-w-lg text-lg text-white/60">Закрытая операционная панель команды OfferPSP. Настоящие поставщики и ставки защищены до контролируемого знакомства.</p></div><span className="text-xs text-white/30">offerpsp.com · Internal operations</span></div><div className="flex items-center justify-center bg-white p-6 dark:bg-gray-900"><div className="w-full max-w-md"><div className="mb-8 lg:hidden"><img src="/brand/offerpsp-logo-square-dark.png" alt="OfferPSP" className="h-14 w-14 rounded-xl object-cover"/></div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-500">Private workspace</p><h2 className="mt-3 text-3xl font-semibold text-gray-900 dark:text-white">Войти в Control Bridge</h2><p className="mt-2 text-sm text-gray-500">Используйте авторизованный Google-аккаунт.</p><button onClick={()=>void googleLogin()} disabled={busy} className="mt-6 flex w-full items-center justify-center gap-3 rounded-lg bg-brand-500 px-4 py-3 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50"><span className="font-bold">G</span>{busy ? "Перенаправляю…" : "Войти через Google"}</button>{status && <p className="mt-4 rounded-lg bg-warning-50 p-3 text-sm text-warning-700 dark:bg-warning-500/10 dark:text-warning-300">{status}</p>}</div></div></div>;
}
