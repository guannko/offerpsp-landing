import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import PageMeta from "../../components/common/PageMeta";
import { hasSupabaseConfig, supabase } from "../../lib/supabase";

type AuthorizationDetails = {
  authorization_id?: string;
  redirect_url?: string;
  redirect_uri?: string;
  scope?: string;
  client?: { name?: string; client_id?: string };
};

const scopeLabels: Record<string, string> = {
  email: "подтвердить рабочий аккаунт",
  profile: "подтвердить профиль сотрудника",
  openid: "выполнить защищённый вход",
};

export default function OAuthConsent() {
  const [params] = useSearchParams();
  const authorizationId = params.get("authorization_id") || "";
  const [details, setDetails] = useState<AuthorizationDetails | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<"approve" | "deny" | "">("");

  useEffect(() => {
    let active = true;
    async function load() {
      if (!hasSupabaseConfig) { setError("Supabase не настроен."); return; }
      if (!authorizationId) { setError("Отсутствует идентификатор OAuth-запроса."); return; }
      const userResult = await supabase.auth.getUser();
      if (!userResult.data.user) {
        window.sessionStorage.setItem("offerpsp_post_auth_redirect", `${window.location.pathname}${window.location.search}`);
        window.location.assign("/signin");
        return;
      }
      const staffResult = await supabase.from("offerpsp_staff_members").select("user_id").eq("user_id", userResult.data.user.id).eq("active", true).maybeSingle();
      if (staffResult.error || !staffResult.data) { setError("Этот аккаунт не является активным сотрудником OfferPSP."); return; }
      const result = await supabase.auth.oauth.getAuthorizationDetails(authorizationId);
      if (!active) return;
      if (result.error || !result.data) { setError(result.error?.message || "OAuth-запрос недействителен."); return; }
      const value = result.data as AuthorizationDetails;
      if (!value.authorization_id && value.redirect_url) { window.location.assign(value.redirect_url); return; }
      setDetails(value);
    }
    void load();
    return () => { active = false; };
  }, [authorizationId]);

  async function decide(decision: "approve" | "deny") {
    if (!authorizationId) return;
    setBusy(decision); setError("");
    const result = decision === "approve"
      ? await supabase.auth.oauth.approveAuthorization(authorizationId)
      : await supabase.auth.oauth.denyAuthorization(authorizationId);
    if (result.error || !result.data?.redirect_url) {
      setError(result.error?.message || "Не удалось завершить авторизацию."); setBusy(""); return;
    }
    window.location.assign(result.data.redirect_url);
  }

  const scopes = (details?.scope || "email profile").split(/\s+/).filter(Boolean);
  return <div className="flex min-h-screen items-center justify-center bg-gray-950 p-6 text-white">
    <PageMeta title="Подключение OfferPSP Operator" description="Защищённое OAuth-подключение MCP."/>
    <div className="w-full max-w-xl rounded-3xl border border-white/10 bg-gray-900 p-8 shadow-2xl">
      <div className="flex items-center gap-4"><span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-theme-purple-500 text-xl font-black">OP</span><div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-theme-pink-500">OfferPSP MCP</p><h1 className="mt-1 text-2xl font-semibold">Подключить Operator</h1></div></div>
      {!details && !error && <p className="mt-8 text-sm text-white/60">Проверяю аккаунт и запрос подключения…</p>}
      {error && <p className="mt-8 rounded-xl border border-error-500/30 bg-error-500/10 p-4 text-sm text-error-200">{error}</p>}
      {details && <><p className="mt-8 text-sm leading-6 text-white/65"><strong className="text-white">{details.client?.name || "Codex / ChatGPT"}</strong> запрашивает доступ к закрытым инструментам OfferPSP от вашего имени.</p>
        <div className="mt-5 rounded-2xl bg-white/[0.04] p-5"><p className="text-xs font-semibold uppercase tracking-wide text-white/40">Разрешения</p><ul className="mt-3 space-y-2 text-sm text-white/75">{scopes.map((scope)=><li key={scope}>✓ {scopeLabels[scope] || scope}</li>)}<li>✓ читать только данные, доступные вашему staff-аккаунту</li><li>✓ записывать действия в журнал BIXOFFPSP</li></ul></div>
        <p className="mt-5 text-xs leading-5 text-white/45">Service role не передаётся агенту. Письма и Telegram здесь только готовятся; массовые изменения требуют отдельного одноразового токена подтверждения.</p>
        <div className="mt-7 grid grid-cols-2 gap-3"><button disabled={Boolean(busy)} onClick={()=>void decide("deny")} className="rounded-xl border border-white/15 px-4 py-3 text-sm font-semibold disabled:opacity-50">Отказать</button><button disabled={Boolean(busy)} onClick={()=>void decide("approve")} className="rounded-xl bg-brand-500 px-4 py-3 text-sm font-semibold disabled:opacity-50">{busy === "approve" ? "Подключаю…" : "Разрешить"}</button></div>
      </>}
    </div>
  </div>;
}
