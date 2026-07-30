(() => {
  const STORAGE_KEY = "offerpsp-admin-language";
  const EN_TO_RU = {
    "Private operations desk": "Закрытая рабочая панель",
    "Sign in to the lead desk": "Вход в панель заявок",
    "Merchant requests, matching, tasks and communication in one protected workspace.": "Заявки, подбор PSP, задачи и переписка в одном защищённом кабинете.",
    "Work email": "Рабочий email",
    "Password": "Пароль",
    "Your password": "Ваш пароль",
    "Sign in": "Войти",
    "Continue with Google": "Войти через Google",
    "Email me a secure link": "Получить ссылку на email",
    "Access is limited to approved OfferPSP staff accounts.": "Доступ разрешён только сотрудникам OfferPSP.",
    "Operations": "Управление",
    "Lead desk": "Заявки",
    "Matching": "Подбор PSP",
    "Tasks": "Задачи",
    "Analytics": "Аналитика",
    "Soon": "Скоро",
    "Coming in the next delivery": "Появится в следующем обновлении",
    "Sign out": "Выйти",
    "Open menu": "Открыть меню",
    "Merchant requests": "Заявки мерчантов",
    "Refresh leads": "Обновить заявки",
    "Lead summary": "Сводка по заявкам",
    "Total requests": "Всего заявок",
    "All time": "За всё время",
    "Needs review": "Нужна проверка",
    "New + qualifying": "Новые и на оценке",
    "In matching": "В подборе",
    "Active research": "Идёт подбор",
    "Shortlists ready": "Shortlist готов",
    "Ready to share": "Готов к отправке",
    "Converted": "Конвертировано",
    "Won opportunities": "Успешные сделки",
    "Lead inbox": "Входящие заявки",
    "Loading requests…": "Загружаю заявки…",
    "Search company, email or GEO": "Поиск по компании, email или GEO",
    "Filter by status": "Фильтр по статусу",
    "All statuses": "Все статусы",
    "New": "Новая",
    "Qualifying": "Оценка",
    "Shortlist ready": "Shortlist готов",
    "Shared": "Отправлен клиенту",
    "Negotiating": "Переговоры",
    "Won": "Успешно",
    "Lost": "Потеряна",
    "Loading the lead desk…": "Загружаю панель заявок…",
    "No requests found": "Заявки не найдены",
    "New merchant requests will appear here automatically.": "Новые заявки автоматически появятся здесь.",
    "Merchant": "Мерчант",
    "Operating profile": "Профиль",
    "Volume": "Оборот",
    "Quality": "Качество",
    "Status": "Статус",
    "Received": "Получена",
    "Open": "Открыть",
    "Conversion snapshot": "Конверсия",
    "Live funnel based on the current lead pipeline": "Актуальная воронка по текущим заявкам",
    "Submitted": "Получено",
    "Qualified": "Оценено",
    "Matched": "Подобрано",
    "Introduced": "Представлено",
    "Lead details": "Детали заявки",
    "Merchant request": "Заявка мерчанта",
    "Close": "Закрыть",
    "Pipeline": "Воронка",
    "Quality score": "Оценка качества",
    "Grade": "Категория",
    "Not scored": "Не оценено",
    "A — priority": "A — приоритет",
    "B — qualified": "B — подходит",
    "C — needs work": "C — нужно уточнение",
    "D — low fit": "D — низкое соответствие",
    "Save changes": "Сохранить изменения",
    "PSP matching": "Подбор PSP",
    "Loading candidates…": "Загружаю кандидатов…",
    "Run matching": "Запустить подбор",
    "Share shortlist": "Отправить shortlist",
    "Internal note": "Внутренняя заметка",
    "Add qualification context, PSP requirements or next steps…": "Добавьте контекст, требования к PSP или следующие шаги…",
    "Add to history": "Добавить в историю",
    "e.g. Verify licence and processing history": "Например: проверить лицензию и историю процессинга",
    "Priority": "Приоритет",
    "Normal": "Обычный",
    "High": "Высокий",
    "Urgent": "Срочный",
    "Low": "Низкий",
    "Due date": "Срок",
    "Create task": "Создать задачу",
    "Client conversation": "Переписка с клиентом",
    "Reply in the client cabinet…": "Ответить в кабинете клиента…",
    "Send reply": "Отправить ответ",
    "Activity": "История",
    "Could not load requests": "Не удалось загрузить заявки",
    "Unspecified": "Не указано",
    "Contact": "Контакт",
    "Telegram": "Telegram",
    "Company URL": "Сайт компании",
    "Vertical": "Вертикаль",
    "Monthly volume": "Месячный оборот",
    "Markets / GEOs": "Рынки / GEO",
    "Payment methods": "Платёжные методы",
    "Source": "Источник",
    "Consent": "Согласие",
    "Confirmed": "Подтверждено",
    "Not confirmed": "Не подтверждено",
    "Details": "Детали",
    "Loading activity…": "Загружаю историю…",
    "Loading conversation…": "Загружаю переписку…",
    "No activity yet.": "История пока пуста.",
    "No tasks for this request.": "Для этой заявки задач пока нет.",
    "Reopen task": "Открыть задачу снова",
    "Complete task": "Завершить задачу",
    "Could not load candidates": "Не удалось загрузить кандидатов",
    "No candidates generated yet": "Кандидаты пока не подобраны",
    "Run matching to compare this request with the PSP database.": "Запустите подбор, чтобы сравнить заявку с базой PSP.",
    "Manual verification required": "Требуется ручная проверка",
    "Vertical fit": "Подходит по вертикали",
    "No client messages yet.": "Сообщений от клиента пока нет.",
    "Write a reply first.": "Сначала напишите ответ.",
    "Reply sent in client cabinet": "Ответ отправлен в кабинет клиента",
    "Reply published in the client cabinet.": "Ответ опубликован в кабинете клиента.",
    "Score must be a whole number between 0 and 100.": "Оценка должна быть целым числом от 0 до 100.",
    "Lead qualification updated": "Оценка заявки обновлена",
    "Lead saved, but the activity record failed.": "Заявка сохранена, но запись в историю не добавилась.",
    "Changes saved.": "Изменения сохранены.",
    "Write a note first.": "Сначала напишите заметку.",
    "Note added.": "Заметка добавлена.",
    "Give the task a title.": "Укажите название задачи.",
    "Task created.": "Задача создана.",
    "Enter your password or request a secure email link.": "Введите пароль или запросите безопасную ссылку.",
    "Enter your work email first.": "Сначала введите рабочий email.",
    "Secure link sent. Check your inbox.": "Ссылка отправлена. Проверьте почту.",
    "This account is not approved for the OfferPSP desk.": "Этот аккаунт не имеет доступа к OfferPSP.",
    "Could not verify access.": "Не удалось проверить доступ.",
    "Shortlist shared in the client cabinet.": "Shortlist отправлен в кабинет клиента.",
    "Automated qualification and PSP matching completed": "Автоматическая оценка и подбор PSP завершены",
    "New merchant request submitted": "Получена новая заявка мерчанта",
    "Payment methods missing": "Не указаны платёжные методы",
    "Request details are limited": "Недостаточно деталей заявки",
    "owner": "владелец",
    "staff": "сотрудник",
    "system": "система",
    "pending": "ожидает",
    "done": "выполнена",
    "normal": "обычный",
    "high": "высокий",
    "urgent": "срочный",
    "low": "низкий",
    "Signing in…": "Выполняю вход…",
    "Sending…": "Отправляю…",
    "Opening Google…": "Открываю Google…",
    "Saving…": "Сохраняю…",
    "Matching…": "Подбираю…",
    "Sharing…": "Отправляю…",
    "Adding…": "Добавляю…",
    "Creating…": "Создаю…"
  };

  const RU_TO_EN = Object.fromEntries(
    Object.entries(EN_TO_RU).map(([english, russian]) => [russian, english]),
  );

  let language = localStorage.getItem(STORAGE_KEY) === "en" ? "en" : "ru";

  function pluralRequests(count) {
    const mod10 = count % 10;
    const mod100 = count % 100;
    if (mod10 === 1 && mod100 !== 11) return "заявка";
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "заявки";
    return "заявок";
  }

  function translateDynamic(text, targetLanguage) {
    if (targetLanguage === "ru") {
      let match = text.match(/^Updated (.+)$/);
      if (match) return `Обновлено ${match[1]}`;
      match = text.match(/^(\d+) requests?$/);
      if (match) return `${match[1]} ${pluralRequests(Number(match[1]))}`;
      match = text.match(/^(\d+)% conversion$/);
      if (match) return `${match[1]}% конверсии`;
      match = text.match(/^(\d+) candidates · (shortlist shared|draft shortlist ready)$/);
      if (match) {
        return `${match[1]} кандидатов · ${match[2] === "shortlist shared" ? "shortlist отправлен" : "черновик shortlist готов"}`;
      }
      match = text.match(/^Open (.+)$/);
      if (match) return `Открыть ${match[1]}`;
      match = text.match(/^Status changed to (.+)$/);
      if (match) return `Статус изменён: ${translateText(match[1], "ru")}`;
      match = text.match(/^Task created: (.+)$/);
      if (match) return `Создана задача: ${match[1]}`;
      match = text.match(/^Lead quality: (\d+)\/100 \((.+)\)\. Candidates: (\d+)\.$/);
      if (match) return `Качество лида: ${match[1]}/100 (${match[2]}). Кандидатов: ${match[3]}.`;
      match = text.match(/^Matching complete: (\d+) candidates, grade (.+)\.$/);
      if (match) return `Подбор завершён: ${match[1]} кандидатов, категория ${match[2]}.`;
      match = text.match(/^(.+) · due (.+)$/);
      if (match) return `${translateText(match[1], "ru")} · срок ${match[2]}`;
    }

    return text;
  }

  function translateText(text, targetLanguage = language) {
    const trimmed = text.trim();
    if (!trimmed) return text;
    const leading = text.slice(0, text.indexOf(trimmed));
    const trailing = text.slice(text.indexOf(trimmed) + trimmed.length);
    const direct = targetLanguage === "ru" ? EN_TO_RU[trimmed] : RU_TO_EN[trimmed];
    const translated = direct || translateDynamic(trimmed, targetLanguage);
    return `${leading}${translated}${trailing}`;
  }

  function translateElement(element) {
    if (!(element instanceof Element)) return;
    for (const attribute of ["placeholder", "aria-label", "title"]) {
      if (!element.hasAttribute(attribute)) continue;
      const value = element.getAttribute(attribute);
      const translated = translateText(value);
      if (translated !== value) element.setAttribute(attribute, translated);
    }
  }

  function translateNode(root = document.body) {
    if (!root) return;
    if (root.nodeType === Node.TEXT_NODE) {
      const translated = translateText(root.nodeValue);
      if (translated !== root.nodeValue) root.nodeValue = translated;
      return;
    }
    if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) return;
    if (root.nodeType === Node.ELEMENT_NODE) translateElement(root);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
      if (node.nodeType === Node.TEXT_NODE) {
        const translated = translateText(node.nodeValue);
        if (translated !== node.nodeValue) node.nodeValue = translated;
      } else {
        translateElement(node);
      }
      node = walker.nextNode();
    }
  }

  function updateSwitches() {
    document.querySelectorAll("[data-language]").forEach((button) => {
      const active = button.dataset.language === language;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });
  }

  function setLanguage(nextLanguage) {
    language = nextLanguage === "en" ? "en" : "ru";
    localStorage.setItem(STORAGE_KEY, language);
    document.documentElement.lang = language;
    translateNode();
    updateSwitches();
    window.dispatchEvent(new CustomEvent("offerpsp:languagechange", { detail: { language } }));
  }

  document.querySelectorAll("[data-language]").forEach((button) => {
    button.addEventListener("click", () => setLanguage(button.dataset.language));
  });

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === "characterData") translateNode(mutation.target);
      mutation.addedNodes.forEach((node) => translateNode(node));
    }
  });
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });

  window.offerPspI18n = {
    getLanguage: () => language,
    setLanguage,
    t: (text) => translateText(text),
    translate: translateNode,
  };

  setLanguage(language);
})();
