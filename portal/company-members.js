// Identity resolution never grants membership; all decisions are server-authorized.
export function createCompanyMembersPanel({ client, container, language, onChanged }) {
  let generation = 0;
  let timer = null;
  let loading = false;
  let busy = false;
  let previous = null;
  const ru = () => language() === 'ru';
  const node = (tag, text, className) => {
    const element = document.createElement(tag);
    if (text) element.textContent = text;
    if (className) element.className = className;
    return element;
  };
  function stop() {
    generation += 1;
    clearInterval(timer);
    timer = null;
    loading = false;
    busy = false;
    previous = null;
    container.replaceChildren();
    container.hidden = true;
  }
  async function refresh() {
    if (loading || busy || !timer || document.hidden) return;
    loading = true;
    const current = generation;
    try {
      const result = await client.rpc('get_offerpsp_company_join_requests');
      if (current !== generation) return;
      if (result.error) throw result.error;
      const requests = result.data || [];
      const changedToApproved = previous !== null && requests.some((item) =>
        item.status === 'approved' && previous.get(item.id) !== 'approved');
      previous = new Map(requests.map((item) => [item.id, item.status]));
      container.replaceChildren();
      container.hidden = requests.length === 0;
      if (requests.length) container.append(node('h3', ru() ? 'Доступ сотрудников компании' : 'Company member access'));
      for (const request of requests) {
        const row = node('article', '', 'company-join-row');
        row.append(node('strong', `${request.company} — ${request.name}`));
        row.append(node('p', `${request.email}${request.telegram ? ` · ${request.telegram}` : ''}`));
        const statuses = ru() ? {
          awaiting_verification: 'Сначала подтвердите почту.', pending_owner: 'Ждём одобрения владельца компании. Доступ пока не предоставлен.',
          pending_staff: 'Запрос проверяет команда OfferPSP. Доступ пока не предоставлен.', approved: 'Доступ одобрен.',
          rejected: 'В добавлении отказано. Свяжитесь с владельцем или командой OfferPSP.', expired: 'Срок запроса истёк. Свяжитесь с командой OfferPSP.',
        } : {
          awaiting_verification: 'Verify your email first.', pending_owner: 'Awaiting company owner approval. No workspace access yet.',
          pending_staff: 'OfferPSP is reviewing your request. No workspace access yet.', approved: 'Access approved.',
          rejected: 'Request rejected. Contact your owner or OfferPSP.', expired: 'Request expired. Contact OfferPSP.',
        };
        row.append(node('p', statuses[request.status] || request.status));
        if (request.can_decide) {
          const label = node('label', ru() ? 'Права сотрудника ' : 'Member role ');
          const select = node('select');
          for (const [value, text] of [['viewer', ru() ? 'Просмотр' : 'Viewer'], ['manager', ru() ? 'Менеджер' : 'Manager']]) {
            const option = node('option', text); option.value = value; select.append(option);
          }
          label.append(select); row.append(label);
          const status = node('p', '', 'status'); status.setAttribute('role', 'status');
          const buttons = [];
          for (const approve of [true, false]) {
            const button = node('button', approve ? (ru() ? 'Разрешить' : 'Approve') : (ru() ? 'Отказать' : 'Reject'), 'button secondary');
            button.type = 'button'; buttons.push(button);
            button.addEventListener('click', async () => {
              if (busy) return;
              busy = true; buttons.forEach((item) => { item.disabled = true; }); select.disabled = true;
              try {
                const decision = await client.rpc('decide_offerpsp_company_join_request', {
                  p_request_id: request.id, p_approve: approve, p_role: select.value,
                });
                if (current !== generation) return;
                if (decision.error) throw decision.error;
                await onChanged();
              } catch {
                if (current === generation) status.textContent = ru() ? 'Не удалось подтвердить решение. Повторите попытку.' : 'Could not confirm the decision. Please retry.';
              } finally {
                if (current === generation) {
                  busy = false; buttons.forEach((item) => { item.disabled = false; }); select.disabled = false;
                  await refresh();
                }
              }
            });
            row.append(button);
          }
          row.append(status);
        }
        container.append(row);
      }
      if (changedToApproved) await onChanged();
    } catch {
      if (current === generation) {
        container.hidden = false;
        let error = container.querySelector('[data-join-error]');
        if (!error) { error = node('p'); error.dataset.joinError = 'true'; error.setAttribute('role', 'status'); container.append(error); }
        error.textContent = ru() ? 'Не удалось обновить запросы доступа. Повторяем автоматически.' : 'Could not refresh access requests. Retrying automatically.';
      }
    } finally { if (current === generation) loading = false; }
  }
  function start() {
    stop();
    timer = setInterval(refresh, 15000);
    void refresh();
  }
  return { start, stop, refresh };
}
