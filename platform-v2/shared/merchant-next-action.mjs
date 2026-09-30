/** Shared by the staff card and MCP. A send receipt is never compliance clearance. */
export function merchantNextAction({ leadStatus, recordState, complianceStatus, shortlistStatus, hasMatches = false }) {
  if (recordState === "archived" || ["won", "lost", "closed", "spam"].includes(leadStatus)) {
    return { action: "none", blocked: true, tab: "company", detail: "Заявка завершена или в архиве. Сначала явно верните её в работу." };
  }
  if (["pending", "screening"].includes(complianceStatus)) {
    return { action: "wait_screening", blocked: true, tab: "compliance", detail: "Дождитесь результата проверки. Подбор недоступен до допуска." };
  }
  if (["rejected", "spam"].includes(complianceStatus)) {
    return { action: "review_decision", blocked: true, tab: "compliance", detail: "По заявке записан отказ. Проверьте решение; подбор недоступен." };
  }
  if (complianceStatus !== "cleared") {
    return { action: "review_dossier", blocked: true, tab: "compliance", detail: "Сначала завершите проверку заявки и уточните недостающие данные. Подбор доступен после допуска." };
  }
  if (shortlistStatus === "shared") return { action: "wait_client", blocked: false, tab: "communications", detail: "Shortlist уже отправлен. Ждём реакцию клиента." };
  if (shortlistStatus) return { action: "review_shortlist", blocked: false, tab: "preview", detail: "Проверьте созданный shortlist и отправьте его клиенту." };
  return { action: "matching", blocked: false, tab: "matching", detail: hasMatches ? "Выберите подходящие маршруты и создайте shortlist." : "Запустите подбор или выберите офферы вручную." };
}
