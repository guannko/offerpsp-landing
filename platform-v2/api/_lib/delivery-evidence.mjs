function timestamp(value) {
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function newest(items, dateFields) {
  return [...items].sort((left, right) => {
    const leftTime = Math.max(...dateFields.map((field) => timestamp(left?.[field])));
    const rightTime = Math.max(...dateFields.map((field) => timestamp(right?.[field])));
    return rightTime - leftTime;
  })[0] || null;
}

export function latestEmailDelivery(mailCenter) {
  const messages = Array.isArray(mailCenter?.messages) ? mailCenter.messages : [];
  const delivery = newest(messages.filter((message) =>
    message?.direction === "outbound"
      && message?.delivery_status === "sent"
      && String(message?.external_message_id || "").trim()), ["sent_at", "created_at"]);
  if (!delivery) return null;
  return {
    delivered_at: delivery.sent_at || delivery.created_at || null,
    reference: String(delivery.external_message_id),
  };
}

export function latestTelegramDelivery(messages) {
  const rows = Array.isArray(messages) ? messages : [];
  const delivery = newest(rows.filter((message) =>
    message?.status === "sent"
      && String(message?.external_message_id || "").trim()), ["sent_at", "created_at"]);
  if (!delivery) return null;
  return {
    delivered_at: delivery.sent_at || delivery.created_at || null,
    reference: String(delivery.external_message_id),
  };
}

export function attachDeliveryEvidence(check, evidence, channel) {
  if (!evidence) {
    return {
      ...check,
      delivery_tested: false,
      last_delivery_at: null,
      delivery_reference: null,
      delivery_detail: `${channel}: подтверждённая доставка не найдена`,
    };
  }
  return {
    ...check,
    delivery_tested: true,
    last_delivery_at: evidence.delivered_at,
    delivery_reference: evidence.reference,
    delivery_detail: `${channel}: доставка подтверждена сохранённым внешним message ID`,
  };
}
