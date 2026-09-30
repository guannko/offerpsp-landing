const sharedDomains = new Set(["gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "live.com", "yahoo.com", "icloud.com", "me.com", "proton.me", "protonmail.com", "mail.ru", "yandex.ru", "yandex.com", "aol.com", "offerpsp.com"]);

/** Suggest, never auto-link. A company domain is not proof of a person's identity. */
export function mailCompanySuggestion(email: string, records: Array<{ id: number; name?: string | null; website?: string | null; record_state?: string | null }>) {
  const domain = email.trim().toLowerCase().split("@")[1];
  if (!domain || sharedDomains.has(domain)) return null;
  const matches = records.filter((record) => {
    if (record.record_state === "archived" || !record.website) return false;
    try {
      const url = new URL(/^https?:\/\//i.test(record.website) ? record.website : `https://${record.website}`);
      return url.hostname.toLowerCase().replace(/^www\./, "") === domain;
    } catch { return false; }
  });
  return matches.length === 1 ? matches[0] : null;
}
