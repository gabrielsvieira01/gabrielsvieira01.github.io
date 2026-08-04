// =============================================================================
// Semana Padrão — 8º Período — app.js
// Lê window.SCHEDULE_DATA (gerado por scripts/extract_schedule.py) e monta:
//   - o grid principal (semana inteira ou um dia só)
//   - a barra de filtros (categoria + grupo)
//   - o tema claro/escuro
//   - o "modo foto" (nova aba, grid escalado / lista)
//   - exportação .ics e modo embed
//
// As funções puras (horário, texto, layout de sobreposição) vivem em
// assets/shared.js, porque o modo foto também precisa delas.
// =============================================================================

(function () {
  "use strict";

  const DATA = window.SCHEDULE_DATA;
  const SHARED = window.AgendaShared;
  if (!DATA || !SHARED) {
    document.getElementById("agenda-inner").innerHTML =
      '<div class="empty-state">Não foi possível carregar ' +
      (SHARED ? "output/events.js" : "assets/shared.js") +
      ". Recarregue a página (ou rode o script de extração novamente).</div>";
    return;
  }

  const toMinutes = SHARED.toMinutes;
  const fmtRange = SHARED.fmtRange;
  const timesOverlap = SHARED.timesOverlap;
  const escapeHtml = SHARED.escapeHtml;
  const titleFor = SHARED.titleFor;
  const subtitleFor = SHARED.subtitleFor;
  const layoutOverlaps = SHARED.layoutOverlaps;
  const blockGeometry = SHARED.blockGeometry;

  const DAY_ORDER = ["SEGUNDA", "TERCA", "QUARTA", "QUINTA", "SEXTA"];
  const DAY_LABEL_SHORT = {
    SEGUNDA: "Seg",
    TERCA: "Ter",
    QUARTA: "Qua",
    QUINTA: "Qui",
    SEXTA: "Sex",
  };
  const DAY_LABEL_FULL = {
    SEGUNDA: "Segunda-feira",
    TERCA: "Terça-feira",
    QUARTA: "Quarta-feira",
    QUINTA: "Quinta-feira",
    SEXTA: "Sexta-feira",
  };
  // getDay(): 0=domingo ... 6=sábado
  const JS_WEEKDAY_TO_KEY = { 1: "SEGUNDA", 2: "TERCA", 3: "QUARTA", 4: "QUINTA", 5: "SEXTA" };

  const CATEGORY_ORDER = ["HAM", "CI_PRATICA", "PIEPE", "IESC_COMUNIDADES", "CI_MARC_PALESTRA", "PESSOAL"];
  const CATEGORY_META = {
    HAM: { label: "HAM", color: "var(--cat-ham)", filterable: true },
    CI_PRATICA: { label: "CI Prática", color: "var(--cat-ci)", filterable: true },
    PIEPE: { label: "PIEPE", color: "var(--cat-piepe)", filterable: true },
    IESC_COMUNIDADES: { label: "IESC / Comunidades", color: "var(--cat-iesc)", filterable: true },
    CI_MARC_PALESTRA: { label: "CI MARC / Palestra", color: "var(--cat-marc)", filterable: false },
    // Compromissos que a própria pessoa adiciona (estudo, outras aulas etc.)
    // - não vem da planilha, não tem grupo/preceptor, por isso filterable:false
    // (só liga/desliga, igual CI MARC/Palestra).
    PESSOAL: { label: "Pessoal", color: "var(--cat-pessoal)", filterable: false },
  };

  // Chave estável de um evento, usada pra persistir a marcação manual de
  // semana 1/2 (ver CATEGORY_DEPENDENCIES mais abaixo pro outro uso de
  // colisão de horário). Não usa o "id" sequencial do events.js porque
  // esse id muda toda vez que a planilha é reextraída — dia+horário+grupo
  // já identificam a prática de forma estável entre reextrações.
  function weekKey(ev) {
    return [ev.category, ev.day, ev.start, ev.end, ev.group].join("|");
  }

  // ---------------------------------------------------------------------
  // Ajuste manual de horário
  //
  // Alguns horários da planilha colidem entre si (o PIEPE é o caso
  // clássico) e a solução real acaba sendo a turma combinar outro horário
  // direto com o professor. A planilha continua com o horário oficial,
  // então quem precisa é a pessoa: aqui ela sobrescreve dia/início/fim de
  // um evento, e o ajuste vale em todo lugar (grid, lista, modo foto,
  // embed, .ics baixado).
  //
  // A chave é a MESMA weekKey, ou seja, montada com os valores ORIGINAIS
  // do evento — nunca com os ajustados. Assim o ajuste continua colado no
  // evento certo mesmo depois de aplicado. Se a planilha mudar aquele
  // horário, a chave deixa de bater e o ajuste é ignorado: o horário
  // oficial mudou, faz sentido recombinar.
  // ---------------------------------------------------------------------
  const OVERRIDES_KEY = "semana-padrao-time-overrides-v1";

  function loadOverrides() {
    try {
      const parsed = JSON.parse(localStorage.getItem(OVERRIDES_KEY) || "{}");
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (e) {
      return {};
    }
  }

  function saveOverrides() {
    try {
      localStorage.setItem(OVERRIDES_KEY, JSON.stringify(timeOverrides));
    } catch (e) {
      /* ignore */
    }
  }

  let timeOverrides = loadOverrides();

  // Devolve o evento como ele deve ser exibido. Se não há ajuste, devolve
  // o próprio objeto (sem cópia) — isso importa porque várias partes do
  // código comparam eventos por identidade (ex.: os clusters de MARC).
  function applyOverride(ev) {
    const o = timeOverrides[weekKey(ev)];
    if (!o) return ev;
    return Object.assign({}, ev, {
      day: o.day || ev.day,
      day_label: DAY_LABEL_FULL[o.day || ev.day],
      start: o.start || ev.start,
      end: o.end || ev.end,
      adjusted: true,
      original: { day: ev.day, start: ev.start, end: ev.end },
    });
  }

  function hasOverride(ev) {
    return !!timeOverrides[weekKey(ev)];
  }

  function commitOverrides() {
    overridesRevision++; // invalida o cache de marcSplitDays()
    saveOverrides();
    refreshBounds();
    renderGrid();
    renderAdjustPanel();
    updateMarcButtonVisibility();
    updateAdjustBadge();
  }

  function setOverride(ev, day, start, end) {
    const key = weekKey(ev);
    if (day === ev.day && start === ev.start && end === ev.end) {
      delete timeOverrides[key]; // voltou ao oficial: não guarda nada
    } else {
      timeOverrides[key] = { day: day, start: start, end: end };
    }
    commitOverrides();
  }

  function clearOverride(ev) {
    delete timeOverrides[weekKey(ev)];
    commitOverrides();
  }

  // ---------------------------------------------------------------------
  // Dependência entre categorias: um evento de "dependentCategory" (e,
  // opcionalmente, "dependentSubtype") fica oculto se colidir no horário
  // (mesmo dia) com algum evento de "sourceCategory" do grupo atualmente
  // selecionado nessa categoria de origem. Não há grupos/horários
  // hardcoded aqui — a colisão é sempre calculada contra os dados reais,
  // então sobrevive a mudanças de horário/grupo na planilha.
  //
  // Regra atual (pedida pelo usuário): quem tem prática de CI Prática na
  // sexta à tarde não consegue ir no MARC das 15h, então esse bloco de
  // MARC some pra quem tiver esse conflito — sem tocar na Palestra nem
  // nos demais grupos.
  // ---------------------------------------------------------------------
  const CATEGORY_DEPENDENCIES = [
    {
      dependentCategory: "CI_MARC_PALESTRA",
      dependentSubtype: "CI MARC",
      sourceCategory: "CI_PRATICA",
    },
  ];

  function isHiddenByDependency(ev, state) {
    return CATEGORY_DEPENDENCIES.some((dep) => {
      if (ev.category !== dep.dependentCategory) return false;
      if (dep.dependentSubtype && ev.subtype !== dep.dependentSubtype) return false;
      const group = state.group[dep.sourceCategory];
      if (!group) return false;
      // officialEvents(), não DATA.events: se a pessoa remarcou a prática
      // de CI, é o horário remarcado que define se há conflito.
      return officialEvents().some(
        (other) =>
          other.category === dep.sourceCategory &&
          other.day === ev.day &&
          other.group === group &&
          timesOverlap(ev.start, ev.end, other.start, other.end)
      );
    });
  }

  // ---------------------------------------------------------------------
  // Escolha de horário do MARC (pra quem NÃO tem conflito de CI Prática):
  // em dias onde os eventos de "CI MARC" se dividem em dois blocos — um
  // antes da Palestra do dia e outro depois — o aluno pode escolher qual
  // dos dois quer ver, em vez de ver os dois juntos. Calculado uma vez a
  // partir dos dados (sem hardcodar dia/horário: hoje só a sexta tem essa
  // divisão, mas se a planilha criar outro dia assim, funciona sozinho).
  // ---------------------------------------------------------------------
  // Deixou de ser constante porque um ajuste manual de horário pode mudar
  // quais blocos de MARC ficam antes/depois da Palestra. Recalcular é
  // barato (5 dias × algumas dezenas de eventos), mas como roda em laço de
  // render fica memoizado até algum override mudar.
  let marcSplitCache = null;
  let overridesRevision = 0;
  let marcSplitCacheRevision = -1;

  function marcSplitDays() {
    if (marcSplitCache && marcSplitCacheRevision === overridesRevision) {
      return marcSplitCache;
    }
    const source = officialEvents();
    const result = {};
    DAY_ORDER.forEach((day) => {
      const palestra = source.find(
        (ev) => ev.category === "CI_MARC_PALESTRA" && ev.subtype === "CI Palestra" && ev.day === day
      );
      if (!palestra) return;
      const marcs = source.filter(
        (ev) => ev.category === "CI_MARC_PALESTRA" && ev.subtype === "CI MARC" && ev.day === day
      );
      const before = marcs.filter((ev) => toMinutes(ev.start) < toMinutes(palestra.start));
      const after = marcs.filter((ev) => toMinutes(ev.start) >= toMinutes(palestra.start));
      if (before.length && after.length) {
        result[day] = { before, after };
      }
    });
    marcSplitCache = result;
    marcSplitCacheRevision = overridesRevision;
    return result;
  }

  // Um grupo só pode ESCOLHER o horário se nenhum dos dois blocos colidir
  // com a própria prática dele (se colidisse, o bloco "antes" já estaria
  // oculto por isHiddenByDependency, e não haveria escolha real).
  function isEligibleForMarcChoice(day, state) {
    const clusters = marcSplitDays()[day];
    if (!clusters) return false;
    return !clusters.before.some((ev) => isHiddenByDependency(ev, state));
  }

  function marcTimeRangeLabel(events) {
    const sorted = events.slice().sort((a, b) => toMinutes(a.start) - toMinutes(b.start));
    return fmtRange(sorted[0].start, sorted[sorted.length - 1].end);
  }

  // ---------------------------------------------------------------------
  // Estado de filtros (persistido em localStorage)
  // ---------------------------------------------------------------------
  const STORAGE_KEY = "semana-padrao-filters-v1";
  const THEME_KEY = "semana-padrao-theme-v1";

  function loadFilterState() {
    let saved = null;
    try {
      saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    } catch (e) {
      saved = null;
    }
    const state = {
      enabled: {},
      group: Object.assign({}, DATA.default_filters),
      weekAssignment: {},
      marcSlot: {},
    };
    CATEGORY_ORDER.forEach((cat) => {
      state.enabled[cat] = true;
    });
    if (saved) {
      if (saved.enabled) Object.assign(state.enabled, saved.enabled);
      if (saved.group) Object.assign(state.group, saved.group);
      if (saved.weekAssignment) Object.assign(state.weekAssignment, saved.weekAssignment);
      if (saved.marcSlot) Object.assign(state.marcSlot, saved.marcSlot);
      if (saved.weekAnchor) state.weekAnchor = saved.weekAnchor;
    }
    return state;
  }

  function saveFilterState(state) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      /* ignore */
    }
  }

  let filterState = loadFilterState();

  // ---------------------------------------------------------------------
  // Visão: semana inteira ou um dia só.
  //
  // O grid da semana tem min-width de 820px, então num celular de 375px
  // aparecem 2 dias de 5 e o resto exige rolagem horizontal — inútil pra
  // responder "o que eu tenho hoje?", que é a pergunta que a pessoa faz no
  // corredor. Por isso a visão de dia é o padrão em tela estreita, já
  // aberta no dia de hoje.
  // ---------------------------------------------------------------------
  const VIEW_KEY = "semana-padrao-view-v1";
  const NARROW_BREAKPOINT = 720;

  function todayKey() {
    return JS_WEEKDAY_TO_KEY[new Date().getDay()] || null;
  }

  function loadViewState() {
    let saved = null;
    try {
      saved = JSON.parse(localStorage.getItem(VIEW_KEY) || "null");
    } catch (e) {
      saved = null;
    }
    const explicit = !!(saved && (saved.mode === "day" || saved.mode === "week"));
    return {
      // Sem escolha explícita salva, a largura da tela decide.
      mode: explicit ? saved.mode : defaultModeForWidth(),
      // O dia NÃO é lembrado entre visitas: abrir a agenda é quase sempre
      // pra ver hoje. Se ficasse salvo, quem tivesse navegado até sexta
      // voltaria na sexta no dia seguinte. No fim de semana, cai na
      // segunda (não há sábado/domingo na grade).
      day: todayKey() || "SEGUNDA",
      // Enquanto a pessoa não escolher Semana/Dia na mão, o modo continua
      // acompanhando a largura da tela (girar o celular, redimensionar a
      // janela). Depois da primeira escolha, a escolha manda.
      explicit: explicit,
    };
  }

  function defaultModeForWidth() {
    return window.innerWidth <= NARROW_BREAKPOINT ? "day" : "week";
  }

  // Só faz efeito enquanto viewState.explicit for false. Retorna true se o
  // modo mudou, pra quem chamou saber que precisa redesenhar os controles.
  function syncModeToWidth() {
    if (viewState.explicit) return false;
    const next = defaultModeForWidth();
    if (next === viewState.mode) return false;
    if (next === "day") viewState.day = todayKey() || viewState.day;
    viewState.mode = next;
    return true;
  }

  function saveViewState() {
    try {
      localStorage.setItem(VIEW_KEY, JSON.stringify(viewState));
    } catch (e) {
      /* ignore */
    }
  }

  let viewState = loadViewState();

  function visibleDays() {
    return viewState.mode === "day" ? [viewState.day] : DAY_ORDER;
  }

  function setView(mode, day) {
    // Entrar na visão de dia sempre cai em HOJE. Antes reaproveitava o
    // último dia visitado, então quem tinha navegado até sexta clicava em
    // "Dia" na terça e caía na sexta. Navegar com as setas continua
    // funcionando normalmente depois disso.
    const enteringDayView = mode === "day" && viewState.mode !== "day";
    viewState.mode = mode;
    if (day) viewState.day = day;
    else if (enteringDayView) viewState.day = todayKey() || viewState.day;
    viewState.explicit = true;
    saveViewState();
    renderViewToggle();
    renderGrid();
  }

  function stepDay(delta) {
    const i = DAY_ORDER.indexOf(viewState.day);
    const next = DAY_ORDER[Math.min(DAY_ORDER.length - 1, Math.max(0, i + delta))];
    if (next !== viewState.day) setView("day", next);
  }

  function buildViewToggle() {
    const wrap = document.createElement("div");
    wrap.className = "view-toggle";
    wrap.id = "view-toggle";
    return wrap;
  }

  function renderViewToggle() {
    const wrap = document.getElementById("view-toggle");
    if (!wrap) return;
    wrap.innerHTML = "";

    const seg = document.createElement("div");
    seg.className = "photo-toggle";
    [
      { mode: "week", text: "Semana" },
      { mode: "day", text: "Dia" },
    ].forEach((opt) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = opt.text;
      b.setAttribute("aria-pressed", String(viewState.mode === opt.mode));
      if (viewState.mode === opt.mode) b.classList.add("active");
      b.addEventListener("click", () => setView(opt.mode));
      seg.appendChild(b);
    });
    wrap.appendChild(seg);

    if (viewState.mode !== "day") return;

    const nav = document.createElement("div");
    nav.className = "day-nav";
    const i = DAY_ORDER.indexOf(viewState.day);

    const prev = document.createElement("button");
    prev.type = "button";
    prev.className = "day-nav-btn";
    prev.setAttribute("aria-label", "Dia anterior");
    prev.textContent = "‹";
    prev.disabled = i <= 0;
    prev.addEventListener("click", () => stepDay(-1));

    const name = document.createElement("span");
    name.className = "day-nav-label";
    name.textContent = DAY_LABEL_FULL[viewState.day];
    if (viewState.day === todayKey()) name.classList.add("is-today");

    const next = document.createElement("button");
    next.type = "button";
    next.className = "day-nav-btn";
    next.setAttribute("aria-label", "Próximo dia");
    next.textContent = "›";
    next.disabled = i >= DAY_ORDER.length - 1;
    next.addEventListener("click", () => stepDay(1));

    nav.appendChild(prev);
    nav.appendChild(name);
    nav.appendChild(next);
    wrap.appendChild(nav);
  }

  // ---------------------------------------------------------------------
  // Compromissos pessoais (a pessoa adiciona os próprios - estudo, outras
  // aulas, o que quiser). Não vem da planilha, fica só no navegador dela.
  // ---------------------------------------------------------------------
  const CUSTOM_EVENTS_KEY = "semana-padrao-custom-events-v1";
  const MAX_CUSTOM_EVENTS = 30;

  // Paleta fixa pros compromissos pessoais. Não é seletor livre de cor de
  // propósito: cor arbitrária costuma cair em contraste ruim com o texto
  // branco do card, ou ficar idêntica a uma categoria oficial e confundir.
  // Todas estas passam em AA (>= 4.5:1 com branco) e foram escolhidas
  // longe das cores de categoria (HAM azul, CI verde, PIEPE laranja,
  // IESC roxo, MARC ciano).
  const PERSONAL_COLORS = [
    { hex: "#d6336c", label: "Rosa" },
    { hex: "#c92a2a", label: "Vermelho" },
    { hex: "#a16207", label: "Âmbar" },
    { hex: "#4d7c0f", label: "Oliva" },
    { hex: "#087f5b", label: "Esmeralda" },
    { hex: "#1e3a8a", label: "Azul" },
    { hex: "#6741d9", label: "Violeta" },
    { hex: "#495057", label: "Grafite" },
  ];
  const DEFAULT_PERSONAL_COLOR = PERSONAL_COLORS[0].hex;

  function loadCustomEvents() {
    try {
      const parsed = JSON.parse(localStorage.getItem(CUSTOM_EVENTS_KEY) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }

  function saveCustomEvents(list) {
    try {
      localStorage.setItem(CUSTOM_EVENTS_KEY, JSON.stringify(list));
    } catch (e) {
      /* ignore */
    }
  }

  let customEvents = loadCustomEvents();

  // Todos os eventos (planilha oficial + pessoais) - é isso que o grid, o
  // cálculo de limites de horário e o modo foto devem usar, nunca
  // DATA.events sozinho.
  // Eventos da planilha COM os ajustes manuais de horário aplicados. É
  // isto que todo o resto deve enxergar — nunca DATA.events cru.
  function officialEvents() {
    return DATA.events.map(applyOverride);
  }

  function allEvents() {
    return officialEvents().concat(customEvents);
  }

  // ---------------------------------------------------------------------
  // Estado compartilhável via URL (?state=...)
  // Reaproveita a mesma forma de filterState (enabled/group) + tema.
  // Não usa nenhuma lista fixa: serializa só as chaves que já existem
  // em filterState/DATA em tempo de execução, então acompanha
  // automaticamente novas categorias/grupos/horários no futuro.
  // ---------------------------------------------------------------------
  const STATE_PARAM = "state";
  // Marcador explícito de "abrir travado, só o calendário" (pro bloco de
  // Embed do Notion). Antes o modo embed era inferido de "o link mudou
  // algum filtro?", o que era instável: um link gerado com todos os
  // filtros no padrão não muda nada, então não entrava em modo embed e
  // abria a página inteira. Agora quem manda é este parâmetro.
  const EMBED_PARAM = "embed";

  function encodeState(obj) {
    const json = JSON.stringify(obj);
    return btoa(unescape(encodeURIComponent(json)))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  }

  function decodeState(str) {
    try {
      let b64 = str.replace(/-/g, "+").replace(/_/g, "/");
      while (b64.length % 4) b64 += "=";
      return JSON.parse(decodeURIComponent(escape(atob(b64))));
    } catch (e) {
      return null;
    }
  }

  function readStateFromUrl() {
    const raw = new URLSearchParams(window.location.search).get(STATE_PARAM);
    return raw ? decodeState(raw) : null;
  }

  function isEmbedRequested() {
    return new URLSearchParams(window.location.search).get(EMBED_PARAM) === "1";
  }

  // Aplica um estado vindo da URL em cima do filterState já carregado.
  // Só aceita categorias/grupos que existem de fato agora (ignora o resto
  // silenciosamente), e NUNCA persiste em localStorage — é só pra essa
  // visualização compartilhada, sem sobrescrever as preferências salvas
  // de quem está abrindo o link.
  // Formato compacto do link compartilhável (item 5): em vez do estado
  // inteiro, manda só o que difere do padrão — e usa chaves de 1 letra.
  //   e: lista de categorias DESLIGADAS (a maioria fica ligada = default)
  //   g: { categoria: grupo } só onde o grupo difere de default_filters
  //   w: { "DIA|HORA_INICIO": "1"|"2" } só das práticas do grupo de CI
  //      Prática atualmente selecionado (dia+hora já bastam pra
  //      identificar univocamente dentro de um grupo — não precisa
  //      repetir "CI_PRATICA" nem o grupo em cada chave)
  //   t: "dark" só quando o tema não é o padrão (light)
  function applyUrlState(urlState) {
    if (!urlState || typeof urlState !== "object") return false;
    let applied = false;

    if (Array.isArray(urlState.e)) {
      urlState.e.forEach((cat) => {
        if (Object.prototype.hasOwnProperty.call(filterState.enabled, cat)) {
          filterState.enabled[cat] = false;
          applied = true;
        }
      });
    }

    if (urlState.g && typeof urlState.g === "object") {
      Object.keys(urlState.g).forEach((cat) => {
        const options = DATA.group_options[cat];
        if (options && options.indexOf(urlState.g[cat]) !== -1) {
          filterState.group[cat] = urlState.g[cat];
          applied = true;
        }
      });
    }

    if (urlState.t === "dark" || urlState.t === "light") {
      applied = true;
    }

    if (urlState.w && typeof urlState.w === "object") {
      // resolvido DEPOIS do "g" acima, pra já usar o grupo de CI Prática
      // vindo do próprio link (não o salvo localmente de quem abriu)
      const ciGroup = filterState.group["CI_PRATICA"];
      const byDayStart = {};
      DATA.events
        .filter((ev) => ev.category === "CI_PRATICA" && ev.group === ciGroup)
        .forEach((ev) => {
          byDayStart[ev.day + "|" + ev.start] = ev;
        });
      Object.keys(urlState.w).forEach((shortKey) => {
        const w = urlState.w[shortKey];
        const ev = byDayStart[shortKey];
        if (ev && (w === "1" || w === "2")) {
          filterState.weekAssignment[weekKey(ev)] = w;
          applied = true;
        }
      });
    }

    if (typeof urlState.a === "string" && /^\d{4}-\d{2}-\d{2}$/.test(urlState.a)) {
      filterState.weekAnchor = urlState.a;
      applied = true;
    }

    if (urlState.m && typeof urlState.m === "object") {
      Object.keys(urlState.m).forEach((day) => {
        const v = urlState.m[day];
        if (marcSplitDays()[day] && (v === "before" || v === "after")) {
          filterState.marcSlot[day] = v;
          applied = true;
        }
      });
    }

    // Ajustes de horário. Só aceita chaves que correspondem a um evento
    // que existe AGORA: se a planilha foi reextraída e aquele horário
    // mudou, o ajuste do link é ignorado em silêncio, igual acontece com o
    // ajuste salvo localmente.
    if (urlState.o && typeof urlState.o === "object") {
      const known = {};
      DATA.events.forEach((ev) => {
        known[weekKey(ev)] = true;
      });
      let anyOverride = false;
      Object.keys(urlState.o).forEach((key) => {
        const v = urlState.o[key];
        if (!known[key] || !Array.isArray(v) || v.length !== 3) return;
        if (DAY_ORDER.indexOf(v[0]) === -1) return;
        timeOverrides[key] = { day: v[0], start: v[1], end: v[2] };
        anyOverride = true;
      });
      if (anyOverride) {
        applied = true;
        overridesRevision++;
        refreshBounds(); // um ajuste pode jogar a aula pra fora do intervalo atual
      }
    }

    return applied;
  }

  function currentShareState() {
    const compact = {};

    const disabledCats = CATEGORY_ORDER.filter((cat) => !filterState.enabled[cat]);
    if (disabledCats.length) compact.e = disabledCats;

    const groupDiffs = {};
    Object.keys(filterState.group).forEach((cat) => {
      if (filterState.group[cat] !== DATA.default_filters[cat]) {
        groupDiffs[cat] = filterState.group[cat];
      }
    });
    if (Object.keys(groupDiffs).length) compact.g = groupDiffs;

    const ciGroup = filterState.group["CI_PRATICA"];
    const w = {};
    Object.keys(filterState.weekAssignment).forEach((key) => {
      const parts = key.split("|"); // [category, day, start, end, group]
      if (parts[0] === "CI_PRATICA" && parts[4] === ciGroup) {
        w[parts[1] + "|" + parts[2]] = filterState.weekAssignment[key];
      }
    });
    if (Object.keys(w).length) compact.w = w;

    const m = {};
    Object.keys(filterState.marcSlot).forEach((day) => {
      const v = filterState.marcSlot[day];
      if (marcSplitDays()[day] && (v === "before" || v === "after")) {
        m[day] = v;
      }
    });
    if (Object.keys(m).length) compact.m = m;

    // Ajustes manuais de horário. Vão no link porque é justamente o
    // horário real de quem compartilha — sem isso o embed do Notion
    // mostraria o horário oficial, que a turma já combinou de trocar.
    // Valor compacto: [dia, início, fim].
    const o = {};
    Object.keys(timeOverrides).forEach((key) => {
      const v = timeOverrides[key];
      o[key] = [v.day, v.start, v.end];
    });
    if (Object.keys(o).length) compact.o = o;

    // acompanha o "w": sem a âncora, a marcação de quinzena não vira
    // recorrência quinzenal no .ics de quem receber o link
    if (filterState.weekAnchor) compact.a = filterState.weekAnchor;

    const theme = document.documentElement.getAttribute("data-theme") || "light";
    if (theme === "dark") compact.t = "dark";

    return compact;
  }

  // embed=true -> link travado só com o calendário (pro Notion).
  // embed=false -> mesma visualização, mas com a página inteira e os
  // filtros liberados, pra quem recebe poder ajustar.
  function buildShareUrl(embed) {
    const url = new URL(window.location.href);
    url.search =
      "?" + STATE_PARAM + "=" + encodeState(currentShareState()) +
      (embed ? "&" + EMBED_PARAM + "=1" : "");
    url.hash = "";
    return url.toString();
  }

  function isEventVisible(ev, state) {
    if (!state.enabled[ev.category]) return false;
    if (isHiddenByDependency(ev, state)) return false;

    if (ev.category === "CI_MARC_PALESTRA" && ev.subtype === "CI MARC") {
      const clusters = marcSplitDays()[ev.day];
      const pref = state.marcSlot && state.marcSlot[ev.day];
      // só aplica a preferência salva se o grupo ATUAL realmente tem
      // escolha nesse dia; se não tem (ex: trocou pra um grupo com
      // conflito), ignora — senão o único horário que sobra pra esse
      // grupo também seria escondido por uma preferência de outro grupo.
      if (clusters && (pref === "before" || pref === "after") && isEligibleForMarcChoice(ev.day, state)) {
        // Compara por id, não por identidade de objeto: applyOverride()
        // devolve uma cópia quando há ajuste manual, e um indexOf() por
        // referência não a encontraria — escondendo o evento sem querer.
        if (!clusters[pref].some((x) => x.id === ev.id)) return false;
      }
    }

    const meta = CATEGORY_META[ev.category];
    if (!meta.filterable) return true; // CI MARC/Palestra: só checkbox
    if (!ev.group || ev.group === "TODOS") return true; // comum a todos (ex: HAM Palestra, IESC Palestra)
    return ev.group === state.group[ev.category];
  }

  // ---------------------------------------------------------------------
  // Cálculo dos limites de horário do grid (com base em TODOS os eventos,
  // pra grid não "pular" de tamanho ao alternar filtros)
  // ---------------------------------------------------------------------
  function computeBounds() {
    let min = Infinity;
    let max = -Infinity;
    allEvents().forEach((ev) => {
      min = Math.min(min, toMinutes(ev.start));
      max = Math.max(max, toMinutes(ev.end));
    });
    const startHour = Math.floor(min / 60);
    const endHour = Math.ceil(max / 60);
    return { startHour, endHour };
  }

  const BOUNDS = computeBounds();

  // Recalcula BOUNDS in-place (o objeto é const, só as propriedades mudam)
  // - necessário quando um compromisso pessoal cai fora do intervalo de
  // horário atual do grid (ex.: estudo às 6h, antes de qualquer aula).
  function refreshBounds() {
    const b = computeBounds();
    BOUNDS.startHour = b.startHour;
    BOUNDS.endHour = b.endHour;
  }

  function hourPx() {
    // No embed a grade é encurtada (46px/hora em vez de 64). A grade
    // cobre ~15h, então a 64px/hora ela nasce com ~1000px de altura e
    // precisaria ser reduzida a ~0.6 pra caber num bloco típico do
    // Notion — o que deixa o texto em ~7px. Encurtando a grade, o mesmo
    // bloco cabe a ~0.80 e o texto fica legível. As classes compact/brief
    // são por DURAÇÃO (não por pixels), então isso não muda o que cada
    // card mostra.
    if (document.body.classList.contains("embed-mode")) return 46;
    return window.innerWidth <= 480 ? 52 : 64;
  }

  // ---------------------------------------------------------------------
  // Render do grid principal
  // ---------------------------------------------------------------------
  const agendaInner = document.getElementById("agenda-inner");
  const scrollWrap = document.getElementById("grid-scroll-wrap");

  function buildHourTicks(container, totalMinutes, px) {
    const hourHeight = px;
    const numHours = (BOUNDS.endHour - BOUNDS.startHour);
    for (let i = 0; i <= numHours; i++) {
      const row = document.createElement("div");
      row.className = "hour-row";
      row.style.top = i * hourHeight + "px";
      container.appendChild(row);
      if (i < numHours) {
        const half = document.createElement("div");
        half.className = "hour-row half";
        half.style.top = i * hourHeight + hourHeight / 2 + "px";
        container.appendChild(half);
      }
    }
  }

  // Classe CSS de semana (week-1/week-2) pra um evento de CI Prática, com
  // base no que o aluno marcou manualmente no painel "Semanas". Retorna
  // null se não for CI Prática ou se ainda não foi marcado.
  // Chave original de um evento que talvez já esteja com horário ajustado.
  // Tudo o que é persistido (marcação de semana, o próprio ajuste) é
  // indexado pelos valores ORIGINAIS — usar weekKey() direto num evento já
  // ajustado geraria uma chave que não existe em lugar nenhum.
  function originalWeekKey(ev) {
    if (!ev.original) return weekKey(ev);
    return [ev.category, ev.original.day, ev.original.start, ev.original.end, ev.group].join("|");
  }

  // Quinzena de um evento: null (toda semana), "1" ou "2".
  // Compromissos pessoais guardam no próprio evento (é dado da pessoa); as
  // práticas de CI guardam em filterState.weekAssignment, porque o evento
  // vem da planilha e não pode ser alterado.
  function weekMarkFor(ev) {
    const w = ev.category === "PESSOAL"
      ? ev.week
      : ev.category === "CI_PRATICA"
        ? filterState.weekAssignment[originalWeekKey(ev)]
        : null;
    return w === "1" || w === "2" ? w : null;
  }

  function weekClassFor(ev) {
    const w = weekMarkFor(ev);
    return w ? "week-" + w : null;
  }

  // ---------------------------------------------------------------------
  // Âncora da quinzena
  //
  // Marcar "semana 1" e "semana 2" diz quais aulas se alternam, mas não
  // diz QUAL semana do calendário é a 1 — isso não está na planilha nem dá
  // pra deduzir. Sem essa referência a exportação não tem como emitir uma
  // recorrência quinzenal, e cai pra semanal.
  //
  // Guardamos a segunda-feira de uma semana que a pessoa afirma ser
  // "semana 1"; o resto se deriva pela paridade em relação a ela.
  // ---------------------------------------------------------------------
  function mondayOf(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // 0=domingo -> 6
    return d;
  }

  function weekAnchorDate() {
    const raw = filterState.weekAnchor;
    if (!raw) return null;
    const parts = String(raw).split("-").map(Number);
    if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) return null;
    const d = new Date(parts[0], parts[1] - 1, parts[2]);
    return isNaN(d.getTime()) ? null : mondayOf(d);
  }

  // Primeira data (>= hoje) em que o evento acontece. Com quinzena e
  // âncora definidas, respeita a paridade da semana; senão devolve a
  // próxima ocorrência simples daquele dia da semana.
  function nextOccurrence(dayKey, week, anchorMonday) {
    const targetJs = Number(
      Object.keys(JS_WEEKDAY_TO_KEY).find((k) => JS_WEEKDAY_TO_KEY[k] === dayKey)
    );
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    // 21 dias cobrem qualquer combinação de dia da semana × paridade
    for (let i = 0; i < 21; i++) {
      if (d.getDay() === targetJs) {
        if (!week || !anchorMonday) return d;
        const weeks = Math.round((mondayOf(d) - anchorMonday) / 604800000);
        const parity = ((weeks % 2) + 2) % 2;
        if (parity === (week === "2" ? 1 : 0)) return d;
      }
      d.setDate(d.getDate() + 1);
    }
    return null;
  }

  function renderEventBlock(ev, col, colCount, overlay, px, dayColEl, totalHeight) {
    const s = toMinutes(ev.start) - BOUNDS.startHour * 60;
    const e = toMinutes(ev.end) - BOUNDS.startHour * 60;
    const top = (s / 60) * px;
    const height = Math.max(((e - s) / 60) * px, 20);

    // Quanto o card mostra depende da DURAÇÃO do evento, não da altura em
    // pixels. Antes era por pixels, então a mesma aula virava "compact"
    // ou não conforme o zoom/altura de hora — e no embed (hora mais
    // baixa) todo evento de 50min perderia o preceptor sem motivo.
    const durationMin = toMinutes(ev.end) - toMinutes(ev.start);
    const isCompact = durationMin < 35;
    const isBrief = !isCompact && durationMin < 55;

    const block = document.createElement("div");
    block.className = "event-block cat-" + ev.category;
    if (isCompact) block.classList.add("compact");
    else if (isBrief) block.classList.add("brief");
    if (overlay) block.classList.add("overlay");
    if (ev.adjusted) block.classList.add("adjusted");
    const wc = weekClassFor(ev);
    if (wc) block.classList.add(wc);
    // Cor escolhida pela pessoa (só compromissos pessoais têm). Tem que ser
    // backgroundColor, não o atalho `background`: o atalho zeraria o
    // background-image e sumiria com a hachura da semana 2.
    if (ev.color) block.style.backgroundColor = ev.color;

    // Na visão de dia a coluna é larga; não faz sentido recuar os blocos
    // sobrepostos, já cabe tudo lado a lado.
    const geo = blockGeometry(col, colCount, overlay && viewState.mode !== "day");
    const baseLeft = geo.left;
    const baseWidth = geo.width;
    block.style.top = top + "px";
    block.style.height = height + "px";
    block.style.left = baseLeft;
    block.style.width = baseWidth;
    block.style.zIndex = String(geo.zIndex);

    const label =
      titleFor(ev) + ", " + fmtRange(ev.start, ev.end) + ", " + subtitleFor(ev) +
      (wc ? ", " + (wc === "week-1" ? "Semana 1" : "Semana 2") : "");

    block.innerHTML =
      '<div class="ev-time">' + fmtRange(ev.start, ev.end) + "</div>" +
      '<div class="ev-title">' + escapeHtml(titleFor(ev)) + "</div>" +
      '<div class="ev-sub">' + escapeHtml(subtitleFor(ev)) + "</div>";
    block.title = label.split(", ").join("\n");

    // Os cards eram <div> com onclick: invisíveis pro teclado e pro leitor
    // de tela, e o title= (tooltip) não existe no celular. Agora são
    // botões de verdade.
    block.setAttribute("role", "button");
    block.setAttribute("tabindex", "0");
    block.setAttribute("aria-label", label);
    block.addEventListener("keydown", (evt) => {
      if (evt.key === "Enter" || evt.key === " " || evt.key === "Spacebar") {
        evt.preventDefault();
        block.click();
      } else if (evt.key === "Escape" && block.classList.contains("expanded")) {
        block.click();
      }
    });

    // O bloco precisa estar de verdade no DOM (dentro da coluna do dia,
    // que já está anexada à página) antes de medir, senão o navegador
    // não calcula largura/altura reais do texto.
    dayColEl.appendChild(block);

    const timeEl = block.querySelector(".ev-time");
    const titleEl = block.querySelector(".ev-title");
    const subEl = block.querySelector(".ev-sub");

    // Antes de medir, garante exibição em bloco normal (o -webkit-box do
    // CSS, sem um line-clamp definido, distorceria a medição real).
    titleEl.style.display = "block";
    subEl.style.display = "block";

    // Mede quantas linhas cabem de verdade (em vez de estimar), pra nunca
    // cortar um caractere no meio nem desperdiçar espaço disponível.
    function measureLines(el) {
      const lh = parseFloat(getComputedStyle(el).lineHeight) || 14;
      return { lineHeight: lh, naturalLines: Math.max(1, Math.round(el.scrollHeight / lh)) };
    }

    const padTop = parseFloat(getComputedStyle(block).paddingTop) || 5;
    const padBottom = parseFloat(getComputedStyle(block).paddingBottom) || 5;
    const titleMarginTop = parseFloat(getComputedStyle(titleEl).marginTop) || 0;

    const timeH = isCompact ? 0 : timeEl.getBoundingClientRect().height;
    const { lineHeight: titleLH, naturalLines: titleNaturalLines } = measureLines(titleEl);
    const { lineHeight: subLH, naturalLines: subNaturalLines } = measureLines(subEl);

    let available = height - padTop - padBottom - timeH - titleMarginTop;
    const titleLines = Math.max(1, Math.min(titleNaturalLines, Math.floor(available / titleLH) || 1));
    available -= titleLines * titleLH;
    const subLines = (isCompact || isBrief)
      ? 0
      : Math.max(0, Math.min(subNaturalLines, Math.floor(available / subLH)));

    function applyClamp() {
      if (titleLines >= titleNaturalLines) {
        titleEl.style.display = "block";
        titleEl.style.webkitLineClamp = "unset";
        titleEl.style.overflow = "visible";
      } else {
        titleEl.style.display = "-webkit-box";
        titleEl.style.webkitLineClamp = String(titleLines);
        titleEl.style.overflow = "hidden";
      }
      if (subLines > 0) {
        if (subLines >= subNaturalLines) {
          subEl.style.display = "block";
          subEl.style.webkitLineClamp = "unset";
          subEl.style.overflow = "visible";
        } else {
          subEl.style.display = "-webkit-box";
          subEl.style.webkitLineClamp = String(subLines);
          subEl.style.overflow = "hidden";
        }
      } else {
        subEl.style.display = "none";
      }
    }
    applyClamp();

    // Clique/toque expande temporariamente o card: ele ocupa toda a
    // largura da coluna do dia e cresce em altura o suficiente pra
    // mostrar o texto inteiro, mas nunca além do limite de baixo do
    // próprio calendário (usa scroll interno no raro caso de não caber).
    function collapse() {
      block.classList.remove("expanded");
      block.setAttribute("aria-expanded", "false");
      block.style.left = baseLeft;
      block.style.width = baseWidth;
      block.style.height = height + "px";
      block.style.maxHeight = "";
      block.style.overflowY = "";
      timeEl.style.display = "";
      applyClamp();
    }

    block.addEventListener("click", (evt) => {
      evt.stopPropagation();
      const wasExpanded = block.classList.contains("expanded");
      document.querySelectorAll(".event-block.expanded").forEach((b) => {
        if (b !== block && b._collapse) b._collapse();
      });
      if (wasExpanded) {
        collapse();
        return;
      }
      block.classList.add("expanded");
      block.setAttribute("aria-expanded", "true");
      timeEl.style.display = "block";
      subEl.style.display = "-webkit-box";
      titleEl.style.webkitLineClamp = "unset";
      titleEl.style.overflow = "visible";
      subEl.style.webkitLineClamp = "unset";
      subEl.style.overflow = "visible";

      // Limita a altura pra não passar do fundo do calendário.
      const roomBelow = totalHeight - top;
      block.style.maxHeight = roomBelow + "px";
      requestAnimationFrame(() => {
        if (block.scrollHeight > roomBelow) block.style.overflowY = "auto";
      });
    });
    block._collapse = collapse;

    return block;
  }

  function renderGrid() {
    const px = hourPx();
    document.documentElement.style.setProperty("--hour-height", px + "px");
    const numHours = BOUNDS.endHour - BOUNDS.startHour;
    const totalHeight = numHours * px;

    agendaInner.innerHTML = "";

    // Na visão de dia sobra largura: uma coluna só, sem min-width de
    // semana, pra caber inteira num celular sem rolagem horizontal.
    const days = visibleDays();
    const isDayView = viewState.mode === "day";
    agendaInner.style.gridTemplateColumns =
      "56px repeat(" + days.length + ", minmax(" + (isDayView ? "0" : "150px") + ", 1fr))";
    agendaInner.style.minWidth = isDayView ? "0" : "820px";

    // canto superior esquerdo
    const corner = document.createElement("div");
    corner.className = "corner-head";
    agendaInner.appendChild(corner);

    // cabeçalhos dos dias
    const today = todayKey();
    days.forEach((day) => {
      const head = document.createElement("div");
      head.className = "day-head" + (day === today ? " today" : "");
      head.textContent = isDayView ? DAY_LABEL_FULL[day] : DAY_LABEL_SHORT[day];
      agendaInner.appendChild(head);
    });

    // eixo de horários
    const axis = document.createElement("div");
    axis.className = "time-axis";
    axis.style.height = totalHeight + "px";
    for (let i = 0; i <= numHours; i++) {
      const tick = document.createElement("div");
      tick.className = "tick";
      tick.style.height = px + "px";
      const hh = BOUNDS.startHour + i;
      if (i < numHours) {
        const span = document.createElement("span");
        span.textContent = String(hh).padStart(2, "0") + ":00";
        tick.appendChild(span);
      }
      axis.appendChild(tick);
    }
    agendaInner.appendChild(axis);

    // colunas dos dias
    const visibleEvents = allEvents().filter((ev) => isEventVisible(ev, filterState));

    days.forEach((day) => {
      const col = document.createElement("div");
      col.className = "day-col";
      col.style.height = totalHeight + "px";
      buildHourTicks(col, totalHeight, px);
      agendaInner.appendChild(col);

      const dayEvents = visibleEvents.filter((ev) => ev.day === day);
      const positioned = layoutOverlaps(dayEvents);
      positioned.forEach(({ ev, col: c, colCount, overlay }) => {
        renderEventBlock(ev, c, colCount, overlay, px, col, totalHeight);
      });

      if (day === today) {
        const nowLine = buildNowLine(px);
        if (nowLine) col.appendChild(nowLine);
      }

      if (dayEvents.length === 0) {
        const empty = document.createElement("div");
        empty.className = "empty-state";
        empty.style.position = "absolute";
        empty.style.top = "8px";
        empty.style.left = "0";
        empty.style.right = "0";
        empty.style.fontSize = "0.72rem";
        empty.style.padding = "0 6px";
        empty.textContent = "Sem eventos com os filtros atuais.";
        col.appendChild(empty);
      }
    });

    updateScrollHint();
  }

  function buildNowLine(px) {
    const now = new Date();
    const mins = now.getHours() * 60 + now.getMinutes();
    const startMin = BOUNDS.startHour * 60;
    const endMin = BOUNDS.endHour * 60;
    if (mins < startMin || mins > endMin) return null;
    const line = document.createElement("div");
    line.className = "now-line";
    line.style.top = ((mins - startMin) / 60) * px + "px";
    return line;
  }

  function updateScrollHint() {
    const agenda = document.getElementById("agenda");
    if (agenda.scrollWidth > agenda.clientWidth + 2) {
      scrollWrap.classList.add("scrollable");
    } else {
      scrollWrap.classList.remove("scrollable");
    }
  }

  // ---------------------------------------------------------------------
  // Barra de filtros
  // ---------------------------------------------------------------------
  function renderFilters() {
    const bar = document.getElementById("filters-bar");
    bar.innerHTML = "";

    CATEGORY_ORDER.forEach((cat) => {
      const meta = CATEGORY_META[cat];
      const chip = document.createElement("div");
      chip.className = "filter-chip";

      const swatch = document.createElement("span");
      swatch.className = "swatch";
      swatch.style.background = meta.color;
      chip.appendChild(swatch);

      const label = document.createElement("label");
      label.className = "chip-label";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = filterState.enabled[cat];
      checkbox.addEventListener("change", () => {
        filterState.enabled[cat] = checkbox.checked;
        if (select) select.disabled = !checkbox.checked;
        saveFilterState(filterState);
        updateFiltersBadge();
        renderGrid();
      });
      label.appendChild(checkbox);
      const textSpan = document.createElement("span");
      textSpan.textContent = meta.label;
      label.appendChild(textSpan);
      chip.appendChild(label);

      let select = null;
      if (meta.filterable) {
        select = document.createElement("select");
        select.disabled = !filterState.enabled[cat];
        (DATA.group_options[cat] || []).forEach((g) => {
          const opt = document.createElement("option");
          opt.value = g;
          opt.textContent = "Grupo " + g;
          if (g === filterState.group[cat]) opt.selected = true;
          select.appendChild(opt);
        });
        select.addEventListener("change", () => {
          filterState.group[cat] = select.value;
          saveFilterState(filterState);
          renderGrid();
          if (cat === "CI_PRATICA") {
            renderWeekPanel();
            updateMarcButtonVisibility();
            const marcPanel = document.getElementById("marc-panel");
            if (!marcPanel.hidden) renderMarcPanel();
          }
        });
        chip.appendChild(select);
      }

      bar.appendChild(chip);
    });
  }

  // ---------------------------------------------------------------------
  // Painel "Semanas" — marcação manual de semana 1/2 das práticas de CI
  // Prática do grupo atualmente selecionado. Não há como derivar isso da
  // planilha (ela é só um template de semana padrão), então quem marca é
  // o próprio aluno; a marcação fica salva em localStorage por dia+
  // horário+grupo (ver weekKey), sobrevivendo a reextrações da planilha.
  // ---------------------------------------------------------------------
  function renderWeekPanel() {
    const panel = document.getElementById("week-panel");
    panel.innerHTML = "";

    const group = filterState.group["CI_PRATICA"];
    // Percorre os eventos ORIGINAIS porque a chave da marcação de semana
    // (weekKey) é montada com os valores originais — mas exibe o horário
    // ajustado, senão a linha mostraria um horário que não existe mais no
    // grid de quem remarcou a prática.
    const events = DATA.events
      .filter((ev) => ev.category === "CI_PRATICA" && ev.group === group)
      .map((orig) => ({ orig: orig, shown: applyOverride(orig) }))
      .sort((a, b) => {
        const dayDiff = DAY_ORDER.indexOf(a.shown.day) - DAY_ORDER.indexOf(b.shown.day);
        return dayDiff !== 0 ? dayDiff : toMinutes(a.shown.start) - toMinutes(b.shown.start);
      });

    const hint = document.createElement("p");
    hint.className = "week-panel-hint";
    hint.textContent = group
      ? "Marque quais dessas práticas do grupo " + group + " são da semana 1 e quais são da semana 2."
      : "Selecione um grupo de CI Prática nos filtros pra marcar as semanas.";
    panel.appendChild(hint);

    events.forEach(({ orig, shown }) => {
      const row = document.createElement("div");
      row.className = "week-panel-row";

      const label = document.createElement("div");
      label.className = "wp-label";
      label.innerHTML =
        escapeHtml(shown.day_label + " " + fmtRange(shown.start, shown.end)) +
        (shown.adjusted ? ' <span class="adjust-original">(ajustado)</span>' : "") +
        '<span class="wp-sub">' + escapeHtml(shown.type_label_raw || "") + "</span>";
      row.appendChild(label);

      const toggle = document.createElement("div");
      toggle.className = "wp-toggle";
      ["1", "2"].forEach((w) => {
        const b = document.createElement("button");
        b.type = "button";
        b.dataset.week = w;
        b.textContent = "Semana " + w;
        const current = filterState.weekAssignment[weekKey(orig)];
        if (current === w) b.classList.add("active");
        b.addEventListener("click", () => {
          const key = weekKey(orig);
          filterState.weekAssignment[key] =
            filterState.weekAssignment[key] === w ? null : w;
          if (!filterState.weekAssignment[key]) delete filterState.weekAssignment[key];
          saveFilterState(filterState);
          renderWeekPanel();
          renderGrid();
        });
        toggle.appendChild(b);
      });
      row.appendChild(toggle);
      panel.appendChild(row);
    });

    const legend = document.createElement("div");
    legend.className = "week-legend";
    legend.innerHTML =
      '<span class="wl-item"><span class="wl-swatch"></span>Semana 1</span>' +
      '<span class="wl-item"><span class="wl-swatch wl-2"></span>Semana 2</span>';
    panel.appendChild(legend);

    panel.appendChild(buildWeekAnchorRow());
  }

  // Sem esta data, "semana 1 / semana 2" só serve pra colorir o grid: a
  // exportação não tem como saber qual semana do calendário é a 1, e cai
  // pra recorrência semanal.
  function buildWeekAnchorRow() {
    const wrap = document.createElement("div");
    wrap.className = "week-anchor";

    const label = document.createElement("label");
    label.className = "wp-label";
    label.htmlFor = "week-anchor-input";
    label.innerHTML =
      "Uma segunda-feira de <strong>semana 1</strong>" +
      '<span class="wp-sub">Só é preciso pra exportar a quinzena pro calendário. ' +
      "Sem isso, aulas quinzenais saem como semanais no .ics.</span>";
    wrap.appendChild(label);

    const input = document.createElement("input");
    input.type = "date";
    input.id = "week-anchor-input";
    input.className = "personal-input";
    input.value = filterState.weekAnchor || "";
    input.addEventListener("change", () => {
      if (!input.value) {
        delete filterState.weekAnchor;
      } else {
        // normaliza pra segunda-feira daquela semana, pra não depender de
        // a pessoa ter escolhido exatamente uma segunda
        const parts = input.value.split("-").map(Number);
        const monday = mondayOf(new Date(parts[0], parts[1] - 1, parts[2]));
        filterState.weekAnchor =
          monday.getFullYear() + "-" + pad2(monday.getMonth() + 1) + "-" + pad2(monday.getDate());
        input.value = filterState.weekAnchor;
      }
      saveFilterState(filterState);
    });
    wrap.appendChild(input);

    return wrap;
  }

  function setupWeekPanelButton() {
    const btn = document.getElementById("week-config-btn");
    btn.setAttribute("aria-controls", "week-panel");
    btn.setAttribute("aria-expanded", "false");
    btn.addEventListener("click", () => togglePanel("week-panel", renderWeekPanel));
  }

  // ---------------------------------------------------------------------
  // Painel "Horário do MARC" — só aparece pra grupos de CI Prática que NÃO
  // têm conflito com o horário de MARC mais cedo (ver marcSplitDays() /
  // isEligibleForMarcChoice). Deixa o aluno escolher entre os dois blocos
  // em vez de ver os dois juntos; "Ambos" volta pro comportamento padrão.
  // ---------------------------------------------------------------------
  function eligibleMarcDays() {
    return Object.keys(marcSplitDays()).filter((day) => isEligibleForMarcChoice(day, filterState));
  }

  function renderMarcPanel() {
    const panel = document.getElementById("marc-panel");
    panel.innerHTML = "";

    const days = eligibleMarcDays();

    const hint = document.createElement("p");
    hint.className = "week-panel-hint";
    hint.textContent = "Escolha qual horário de MARC você costuma ir (ou deixe em \"Ambos\" pra ver os dois).";
    panel.appendChild(hint);

    days.forEach((day) => {
      const clusters = marcSplitDays()[day];
      const row = document.createElement("div");
      row.className = "week-panel-row";

      const label = document.createElement("div");
      label.className = "wp-label";
      const dayLabel = (clusters.before[0] && clusters.before[0].day_label) || day;
      label.innerHTML = escapeHtml(dayLabel) + '<span class="wp-sub">Clínica Integrada – CI MARC</span>';
      row.appendChild(label);

      const toggle = document.createElement("div");
      toggle.className = "wp-toggle";
      const options = [
        { slot: null, text: "Ambos" },
        { slot: "before", text: marcTimeRangeLabel(clusters.before) },
        { slot: "after", text: marcTimeRangeLabel(clusters.after) },
      ];
      options.forEach((opt) => {
        const b = document.createElement("button");
        b.type = "button";
        if (opt.slot) b.dataset.slot = opt.slot;
        b.textContent = opt.text;
        const current = filterState.marcSlot[day] || null;
        if (current === opt.slot) b.classList.add("active");
        b.addEventListener("click", () => {
          if (opt.slot) {
            filterState.marcSlot[day] = opt.slot;
          } else {
            delete filterState.marcSlot[day];
          }
          saveFilterState(filterState);
          renderMarcPanel();
          renderGrid();
        });
        toggle.appendChild(b);
      });
      row.appendChild(toggle);
      panel.appendChild(row);
    });
  }

  // Mostra/esconde o botão "Horário do MARC" conforme o grupo de CI
  // Prática selecionado tenha ou não escolha real de horário.
  function updateMarcButtonVisibility() {
    const btn = document.getElementById("marc-config-btn");
    const panel = document.getElementById("marc-panel");
    const hasChoice = eligibleMarcDays().length > 0;
    btn.hidden = !hasChoice;
    if (!hasChoice) panel.hidden = true;
  }

  function setupMarcPanelButton() {
    const btn = document.getElementById("marc-config-btn");
    btn.setAttribute("aria-controls", "marc-panel");
    btn.setAttribute("aria-expanded", "false");
    btn.addEventListener("click", () => togglePanel("marc-panel", renderMarcPanel));
    updateMarcButtonVisibility();
  }

  // ---------------------------------------------------------------------
  // Painel "Meus horários" — compromissos pessoais (estudo, outras aulas,
  // o que a pessoa quiser). Ficam só no localStorage dela, somados aos
  // eventos oficiais em todo lugar que usa allEvents() (grid, limites de
  // horário, modo foto).
  // ---------------------------------------------------------------------
  function personalEventsSorted() {
    return customEvents.slice().sort((a, b) => {
      const da = DAY_ORDER.indexOf(a.day), db = DAY_ORDER.indexOf(b.day);
      if (da !== db) return da - db;
      return toMinutes(a.start) - toMinutes(b.start);
    });
  }

  function addCustomEvent(day, start, end, title, color, week) {
    const entry = {
      id: "pe" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      day: day,
      day_label: DAY_LABEL_FULL[day],
      category: "PESSOAL",
      category_label: "Pessoal",
      title: title,
      start: start,
      end: end,
      color: color || DEFAULT_PERSONAL_COLOR,
      // null = toda semana; "1"/"2" = quinzenal, nas semanas 1 ou 2
      week: week === "1" || week === "2" ? week : null,
    };
    customEvents.push(entry);
    saveCustomEvents(customEvents);
    refreshBounds();
    renderGrid();
    renderPersonalPanel();
  }

  function setCustomEventColor(id, hex) {
    const ev = customEvents.find((e) => e.id === id);
    if (!ev) return;
    ev.color = hex;
    saveCustomEvents(customEvents);
    renderGrid();
    renderPersonalPanel();
  }

  function setCustomEventWeek(id, week) {
    const ev = customEvents.find((e) => e.id === id);
    if (!ev) return;
    ev.week = week === "1" || week === "2" ? week : null;
    saveCustomEvents(customEvents);
    renderGrid();
    renderPersonalPanel();
  }

  // Botões "Toda semana / Semana 1 / Semana 2". Reaproveita o visual do
  // painel "Semanas" (.wp-toggle), que já é exatamente essa escolha.
  function buildWeekToggle(current, onPick) {
    const wrap = document.createElement("div");
    wrap.className = "wp-toggle";
    [
      { value: null, text: "Toda semana" },
      { value: "1", text: "Semana 1" },
      { value: "2", text: "Semana 2" },
    ].forEach((opt) => {
      const b = document.createElement("button");
      b.type = "button";
      if (opt.value) b.dataset.week = opt.value;
      b.textContent = opt.text;
      const active = (current || null) === opt.value;
      b.setAttribute("aria-pressed", String(active));
      if (active) b.classList.add("active");
      b.addEventListener("click", () => onPick(opt.value));
      wrap.appendChild(b);
    });
    return wrap;
  }

  // Compromissos salvos antes da paleta existir não têm `color`; caem na
  // cor padrão, que é a mesma que a categoria já usava.
  function personalColorOf(ev) {
    return ev.color || DEFAULT_PERSONAL_COLOR;
  }

  // Fileira de bolinhas de cor. `onPick` recebe o hex escolhido.
  function buildColorPalette(selectedHex, onPick) {
    const wrap = document.createElement("div");
    wrap.className = "color-palette";
    wrap.setAttribute("role", "radiogroup");
    wrap.setAttribute("aria-label", "Cor do compromisso");
    PERSONAL_COLORS.forEach((c) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "color-swatch";
      b.style.background = c.hex;
      b.title = c.label;
      b.setAttribute("role", "radio");
      b.setAttribute("aria-label", c.label);
      const isSel = c.hex.toLowerCase() === String(selectedHex).toLowerCase();
      b.setAttribute("aria-checked", String(isSel));
      if (isSel) b.classList.add("selected");
      b.addEventListener("click", () => onPick(c.hex));
      wrap.appendChild(b);
    });
    return wrap;
  }

  function removeCustomEvent(id) {
    customEvents = customEvents.filter((e) => e.id !== id);
    saveCustomEvents(customEvents);
    refreshBounds();
    renderGrid();
    renderPersonalPanel();
  }

  function renderPersonalPanel() {
    const panel = document.getElementById("personal-panel");
    panel.innerHTML = "";

    const hint = document.createElement("p");
    hint.className = "week-panel-hint";
    hint.textContent = "Adicione seus próprios compromissos (estudo, outras aulas etc.) - eles aparecem no grid junto com o resto, só que só você vê.";
    panel.appendChild(hint);

    const form = document.createElement("div");
    form.className = "personal-form";

    const daySelect = document.createElement("select");
    daySelect.className = "personal-input";
    DAY_ORDER.forEach((day) => {
      const opt = document.createElement("option");
      opt.value = day;
      opt.textContent = DAY_LABEL_FULL[day];
      daySelect.appendChild(opt);
    });

    const startInput = document.createElement("input");
    startInput.type = "time";
    startInput.className = "personal-input";

    const endInput = document.createElement("input");
    endInput.type = "time";
    endInput.className = "personal-input";

    const titleInput = document.createElement("input");
    titleInput.type = "text";
    titleInput.className = "personal-input personal-input-title";
    titleInput.placeholder = "Ex: Estudo, Inglês...";
    titleInput.maxLength = 40;

    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "personal-add-btn";
    addBtn.textContent = "Adicionar";

    const row1 = document.createElement("div");
    row1.className = "personal-form-row";
    row1.appendChild(daySelect);
    row1.appendChild(startInput);
    row1.appendChild(endInput);

    const row2 = document.createElement("div");
    row2.className = "personal-form-row";
    row2.appendChild(titleInput);
    row2.appendChild(addBtn);

    let pendingColor = DEFAULT_PERSONAL_COLOR;
    const row3 = document.createElement("div");
    row3.className = "personal-form-row personal-color-row";
    const colorLabel = document.createElement("span");
    colorLabel.className = "personal-color-label";
    colorLabel.textContent = "Cor:";
    row3.appendChild(colorLabel);
    const palette = buildColorPalette(pendingColor, (hex) => {
      pendingColor = hex;
      const swatches = palette.querySelectorAll(".color-swatch");
      PERSONAL_COLORS.forEach((c, i) => {
        const on = c.hex === hex;
        swatches[i].classList.toggle("selected", on);
        swatches[i].setAttribute("aria-checked", String(on));
      });
      // o botão "Adicionar" já mostra a cor que o compromisso vai ter
      addBtn.style.background = hex;
    });
    row3.appendChild(palette);
    addBtn.style.background = pendingColor;

    let pendingWeek = null;
    const row4 = document.createElement("div");
    row4.className = "personal-form-row personal-color-row";
    const weekLabel = document.createElement("span");
    weekLabel.className = "personal-color-label";
    weekLabel.textContent = "Repete:";
    row4.appendChild(weekLabel);

    // O toggle é reconstruído a cada escolha (é barato: 3 botões) em vez de
    // alternar classes na mão.
    let weekToggle = null;
    function mountWeekToggle() {
      const next = buildWeekToggle(pendingWeek, (v) => {
        pendingWeek = v;
        mountWeekToggle();
      });
      if (weekToggle) row4.replaceChild(next, weekToggle);
      else row4.appendChild(next);
      weekToggle = next;
    }
    mountWeekToggle();

    form.appendChild(row1);
    form.appendChild(row2);
    form.appendChild(row3);
    form.appendChild(row4);
    panel.appendChild(form);

    if (customEvents.length >= MAX_CUSTOM_EVENTS) {
      addBtn.disabled = true;
      addBtn.title = "Máximo de " + MAX_CUSTOM_EVENTS + " compromissos pessoais";
    }

    addBtn.addEventListener("click", () => {
      if (customEvents.length >= MAX_CUSTOM_EVENTS) return;
      if (!startInput.value || !endInput.value) {
        (startInput.value ? endInput : startInput).focus();
        return;
      }
      if (toMinutes(endInput.value) <= toMinutes(startInput.value)) {
        endInput.focus();
        return;
      }
      const title = titleInput.value.trim() || "Compromisso";
      addCustomEvent(
        daySelect.value, startInput.value, endInput.value, title, pendingColor, pendingWeek
      );
      titleInput.value = "";
      startInput.value = "";
      endInput.value = "";
    });

    const list = personalEventsSorted();
    if (list.length === 0) return;

    const listWrap = document.createElement("div");
    listWrap.className = "personal-list";
    list.forEach((ev) => {
      const row = document.createElement("div");
      row.className = "week-panel-row personal-list-row";

      // Bolinha da cor atual: clicar abre a paleta na própria linha.
      const colorBtn = document.createElement("button");
      colorBtn.type = "button";
      colorBtn.className = "personal-color-btn";
      colorBtn.style.background = personalColorOf(ev);
      colorBtn.title = "Mudar a cor";
      colorBtn.setAttribute("aria-label", "Mudar a cor de " + ev.title);
      colorBtn.setAttribute("aria-expanded", "false");
      row.appendChild(colorBtn);

      const label = document.createElement("div");
      label.className = "wp-label";
      label.innerHTML =
        escapeHtml(ev.title) +
        '<span class="wp-sub">' + escapeHtml(DAY_LABEL_FULL[ev.day]) + " · " + fmtRange(ev.start, ev.end) +
        (ev.week ? " · quinzenal (semana " + ev.week + ")" : "") + "</span>";
      row.appendChild(label);

      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "personal-remove-btn";
      removeBtn.textContent = "Remover";
      removeBtn.addEventListener("click", () => removeCustomEvent(ev.id));
      row.appendChild(removeBtn);

      const paletteRow = document.createElement("div");
      paletteRow.className = "personal-palette-row";
      paletteRow.hidden = true;
      paletteRow.appendChild(
        buildColorPalette(personalColorOf(ev), (hex) => setCustomEventColor(ev.id, hex))
      );
      paletteRow.appendChild(
        buildWeekToggle(ev.week, (v) => setCustomEventWeek(ev.id, v))
      );

      colorBtn.addEventListener("click", () => {
        const opening = paletteRow.hidden;
        paletteRow.hidden = !opening;
        colorBtn.setAttribute("aria-expanded", String(opening));
      });
      colorBtn.title = "Mudar cor e repetição";
      colorBtn.setAttribute("aria-label", "Mudar cor e repetição de " + ev.title);

      listWrap.appendChild(row);
      listWrap.appendChild(paletteRow);
    });
    panel.appendChild(listWrap);
  }

  // ---------------------------------------------------------------------
  // Painel "Ajustar horários" — sobrescreve dia/hora de um evento oficial.
  //
  // Lista só o que está visível com os filtros atuais: ajustar um horário
  // de um grupo que não é o seu não faria sentido, e a lista inteira teria
  // 43 linhas.
  // ---------------------------------------------------------------------
  function adjustableEvents() {
    return DATA.events
      .map((orig) => ({ orig: orig, shown: applyOverride(orig) }))
      .filter((pair) => isEventVisible(pair.shown, filterState))
      .sort((a, b) => {
        const d = DAY_ORDER.indexOf(a.shown.day) - DAY_ORDER.indexOf(b.shown.day);
        return d !== 0 ? d : toMinutes(a.shown.start) - toMinutes(b.shown.start);
      });
  }

  function overrideCount() {
    return Object.keys(timeOverrides).length;
  }

  function updateAdjustBadge() {
    const badge = document.getElementById("adjust-badge");
    if (!badge) return;
    const n = overrideCount();
    badge.textContent = n ? String(n) : "";
    badge.hidden = !n;
  }

  function renderAdjustPanel() {
    const panel = document.getElementById("adjust-panel");
    if (!panel || panel.hidden) return;
    panel.innerHTML = "";

    const hint = document.createElement("p");
    hint.className = "week-panel-hint";
    hint.textContent =
      "Combinou outro horário com o professor? Ajuste aqui. Vale só pra você e entra no grid, no modo foto, no link e no .ics baixado.";
    panel.appendChild(hint);

    const pairs = adjustableEvents();
    if (!pairs.length) {
      const empty = document.createElement("p");
      empty.className = "week-panel-hint";
      empty.textContent = "Nenhum evento visível com os filtros atuais.";
      panel.appendChild(empty);
      return;
    }

    pairs.forEach(({ orig, shown }) => {
      const row = document.createElement("div");
      row.className = "week-panel-row adjust-row";

      const label = document.createElement("div");
      label.className = "wp-label";
      const adjusted = hasOverride(orig);
      label.innerHTML =
        escapeHtml(titleFor(shown)) +
        '<span class="wp-sub">' +
        escapeHtml(subtitleFor(shown)) +
        (adjusted
          ? ' · <span class="adjust-original">oficial: ' +
            escapeHtml(DAY_LABEL_SHORT[orig.day] + " " + fmtRange(orig.start, orig.end)) +
            "</span>"
          : "") +
        "</span>";
      row.appendChild(label);

      const controls = document.createElement("div");
      controls.className = "adjust-controls";

      const daySel = document.createElement("select");
      daySel.className = "personal-input";
      daySel.setAttribute("aria-label", "Dia");
      DAY_ORDER.forEach((d) => {
        const opt = document.createElement("option");
        opt.value = d;
        opt.textContent = DAY_LABEL_SHORT[d];
        if (d === shown.day) opt.selected = true;
        daySel.appendChild(opt);
      });

      const startIn = document.createElement("input");
      startIn.type = "time";
      startIn.className = "personal-input";
      startIn.value = shown.start;
      startIn.setAttribute("aria-label", "Início");

      const endIn = document.createElement("input");
      endIn.type = "time";
      endIn.className = "personal-input";
      endIn.value = shown.end;
      endIn.setAttribute("aria-label", "Fim");

      function apply() {
        if (!startIn.value || !endIn.value) return;
        if (toMinutes(endIn.value) <= toMinutes(startIn.value)) {
          endIn.setCustomValidity("O fim tem que ser depois do início");
          endIn.reportValidity();
          return;
        }
        endIn.setCustomValidity("");
        setOverride(orig, daySel.value, startIn.value, endIn.value);
      }
      [daySel, startIn, endIn].forEach((el) => el.addEventListener("change", apply));

      controls.appendChild(daySel);
      controls.appendChild(startIn);
      controls.appendChild(endIn);

      if (adjusted) {
        const reset = document.createElement("button");
        reset.type = "button";
        reset.className = "personal-remove-btn";
        reset.textContent = "Restaurar";
        reset.title = "Voltar ao horário da planilha";
        reset.addEventListener("click", () => clearOverride(orig));
        controls.appendChild(reset);
      }

      row.appendChild(controls);
      if (adjusted) row.classList.add("is-adjusted");
      panel.appendChild(row);
    });
  }

  function setupAdjustPanelButton() {
    const btn = document.getElementById("adjust-config-btn");
    btn.setAttribute("aria-controls", "adjust-panel");
    btn.setAttribute("aria-expanded", "false");
    btn.addEventListener("click", () => togglePanel("adjust-panel", renderAdjustPanel));
    updateAdjustBadge();
  }

  function setupPersonalPanelButton() {
    const btn = document.getElementById("personal-config-btn");
    btn.setAttribute("aria-controls", "personal-panel");
    btn.setAttribute("aria-expanded", "false");
    btn.addEventListener("click", () => togglePanel("personal-panel", renderPersonalPanel));
  }

  // ---------------------------------------------------------------------
  // Tema claro / escuro
  // ---------------------------------------------------------------------
  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    const btn = document.getElementById("theme-toggle");
    if (btn) btn.querySelector(".theme-label").textContent = theme === "dark" ? "Escuro" : "Claro";
  }

  function initTheme(forcedTheme) {
    let theme;
    if (forcedTheme === "dark" || forcedTheme === "light") {
      theme = forcedTheme;
    } else {
      let saved = null;
      try {
        saved = localStorage.getItem(THEME_KEY);
      } catch (e) {
        saved = null;
      }
      theme = saved || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    }
    applyTheme(theme);

    document.getElementById("theme-toggle").addEventListener("click", () => {
      const cur = document.documentElement.getAttribute("data-theme");
      const next = cur === "dark" ? "light" : "dark";
      applyTheme(next);
      try {
        localStorage.setItem(THEME_KEY, next);
      } catch (e) {
        /* ignore */
      }
    });
  }

  // ---------------------------------------------------------------------
  // Barra de ações. Fica entre o cabeçalho e os painéis colapsáveis.
  //
  // Todo painel de configuração (filtros, semanas, MARC, meus horários,
  // compartilhar) começa fechado: antes a barra de filtros sozinha comia
  // ~120px no desktop e ~370px no celular, e o calendário — que é o
  // conteúdo — só começava depois disso.
  // ---------------------------------------------------------------------
  function setupActionBar() {
    const actionBar = document.createElement("div");
    actionBar.className = "share-bar";

    const left = document.createElement("div");
    left.className = "action-bar-left";

    left.appendChild(buildViewToggle());

    const filtersBtn = document.createElement("button");
    filtersBtn.className = "icon-btn";
    filtersBtn.type = "button";
    filtersBtn.id = "filters-toggle-btn";
    filtersBtn.title = "Mostrar/esconder os filtros de categoria e grupo";
    filtersBtn.setAttribute("aria-label", "Filtros");
    filtersBtn.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z"></path></svg>' +
      '<span>Filtros</span><span class="btn-badge" id="filters-badge"></span>';
    left.appendChild(filtersBtn);

    const weekBtn = document.createElement("button");
    weekBtn.className = "icon-btn";
    weekBtn.type = "button";
    weekBtn.id = "week-config-btn";
    weekBtn.title = "Marcar semana 1 / semana 2 das práticas de CI";
    weekBtn.setAttribute("aria-label", "Semanas");
    weekBtn.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>' +
      "<span>Semanas</span>";
    left.appendChild(weekBtn);

    const marcBtn = document.createElement("button");
    marcBtn.className = "icon-btn";
    marcBtn.type = "button";
    marcBtn.id = "marc-config-btn";
    marcBtn.title = "Escolher horário do MARC";
    marcBtn.setAttribute("aria-label", "Horário do MARC");
    marcBtn.hidden = true; // updateMarcButtonVisibility() decide se mostra
    marcBtn.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>' +
      "<span>Horário do MARC</span>";
    left.appendChild(marcBtn);

    const adjustBtn = document.createElement("button");
    adjustBtn.className = "icon-btn";
    adjustBtn.type = "button";
    adjustBtn.id = "adjust-config-btn";
    adjustBtn.title = "Ajustar horários combinados com o professor";
    adjustBtn.setAttribute("aria-label", "Ajustar horários");
    adjustBtn.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle><polyline points="12 7 12 12 15.5 14"></polyline></svg>' +
      '<span>Ajustar horários</span><span class="btn-badge" id="adjust-badge" hidden></span>';
    left.appendChild(adjustBtn);

    const personalBtn = document.createElement("button");
    personalBtn.className = "icon-btn";
    personalBtn.type = "button";
    personalBtn.id = "personal-config-btn";
    personalBtn.title = "Adicionar seus próprios compromissos (estudo, outras aulas etc.)";
    personalBtn.setAttribute("aria-label", "Meus horários");
    personalBtn.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"></path></svg>' +
      "<span>Meus horários</span>";
    left.appendChild(personalBtn);

    actionBar.appendChild(left);

    const right = document.createElement("div");
    right.className = "action-bar-right";
    const shareBtn = document.createElement("button");
    shareBtn.className = "icon-btn";
    shareBtn.type = "button";
    shareBtn.id = "share-config-btn";
    shareBtn.title = "Compartilhar, incorporar no Notion ou exportar pro calendário";
    shareBtn.setAttribute("aria-label", "Compartilhar");
    shareBtn.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.6" y1="10.5" x2="15.4" y2="6.5"></line><line x1="8.6" y1="13.5" x2="15.4" y2="17.5"></line></svg>' +
      "<span>Compartilhar</span>";
    right.appendChild(shareBtn);
    actionBar.appendChild(right);

    const filtersBar = document.getElementById("filters-bar");
    filtersBar.parentNode.insertBefore(actionBar, filtersBar);

    setupFiltersToggle();
    setupWeekPanelButton();
    setupMarcPanelButton();
    setupAdjustPanelButton();
    setupPersonalPanelButton();
    setupSharePanelButton();
  }

  // Painéis são mutuamente exclusivos: abrir um fecha os outros, senão
  // empilhavam e empurravam o calendário pra fora da tela.
  const PANEL_IDS = [
    "filters-bar",
    "week-panel",
    "marc-panel",
    "adjust-panel",
    "personal-panel",
    "share-panel",
  ];

  function togglePanel(id, onOpen) {
    const target = document.getElementById(id);
    const opening = target.hidden;
    PANEL_IDS.forEach((pid) => {
      const el = document.getElementById(pid);
      if (el) el.hidden = true;
      const btn = document.querySelector('[aria-controls="' + pid + '"]');
      if (btn) btn.setAttribute("aria-expanded", "false");
    });
    target.hidden = !opening;
    const btn = document.querySelector('[aria-controls="' + id + '"]');
    if (btn) btn.setAttribute("aria-expanded", String(opening));
    if (opening && onOpen) onOpen();
    fitEmbedGrid();
  }

  function setupFiltersToggle() {
    const btn = document.getElementById("filters-toggle-btn");
    btn.setAttribute("aria-controls", "filters-bar");
    btn.setAttribute("aria-expanded", "false");
    btn.addEventListener("click", () => togglePanel("filters-bar"));
    updateFiltersBadge();
  }

  function updateFiltersBadge() {
    const badge = document.getElementById("filters-badge");
    if (!badge) return;
    const on = CATEGORY_ORDER.filter((cat) => filterState.enabled[cat]).length;
    badge.textContent = on + "/" + CATEGORY_ORDER.length;
    badge.classList.toggle("partial", on < CATEGORY_ORDER.length);
  }

  // ---------------------------------------------------------------------
  // Painel "Compartilhar" — link normal, link de embed e exportar .ics
  // ---------------------------------------------------------------------
  function renderSharePanel() {
    const panel = document.getElementById("share-panel");
    panel.innerHTML = "";

    const hint = document.createElement("p");
    hint.className = "week-panel-hint";
    hint.textContent =
      "Os links guardam os filtros, as semanas marcadas e o tema que você está vendo agora.";
    panel.appendChild(hint);

    const actions = [
      {
        label: "Copiar link",
        sub: "Abre a página inteira, com os filtros liberados pra quem receber",
        run: () => copyShareLink(false),
      },
      {
        label: "Copiar link de embed",
        sub: "Só o calendário, travado — pro bloco de Embed do Notion",
        run: () => copyShareLink(true),
      },
      {
        label: "Baixar .ics",
        sub: "Leva tudo o que você está vendo pro Google Agenda ou Apple Calendário",
        run: () => downloadIcs(),
      },
    ];

    actions.forEach((action) => {
      const row = document.createElement("div");
      row.className = "week-panel-row";

      const label = document.createElement("div");
      label.className = "wp-label";
      label.innerHTML =
        escapeHtml(action.label) + '<span class="wp-sub">' + escapeHtml(action.sub) + "</span>";
      row.appendChild(label);

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "personal-remove-btn";
      btn.textContent = action.label.startsWith("Baixar") ? "Baixar" : "Copiar";
      btn.addEventListener("click", action.run);
      row.appendChild(btn);

      panel.appendChild(row);
    });

    renderIcsHelp(panel);
  }

  // ---------------------------------------------------------------------
  // "O que é esse arquivo?" — explicação do .ics dentro do próprio painel.
  //
  // Começa fechado: quem já sabe não precisa ver, e quem não sabe não vai
  // achar sozinho num README.
  // ---------------------------------------------------------------------
  function renderIcsHelp(panel) {
    const details = document.createElement("details");
    details.className = "ics-help";

    const summary = document.createElement("summary");
    summary.textContent = "O que é o .ics e como importar";
    details.appendChild(summary);

    const untilLabel = icsUntilLabel();

    const body = document.createElement("div");
    body.className = "ics-help-body";
    body.innerHTML =
      "<p><strong>.ics</strong> é o formato padrão de calendário — Google Agenda, " +
      "Apple Calendário e Outlook abrem todos. O arquivo leva as aulas dos filtros " +
      "que você deixou ligados, seus compromissos pessoais e seus ajustes de horário, " +
      "como eventos que se repetem toda semana" +
      (untilLabel ? " até <strong>" + escapeHtml(untilLabel) + "</strong>" : "") +
      ".</p>" +

      "<p class='ics-help-step'><strong>Google Agenda</strong> — precisa ser no " +
      "computador: o aplicativo de celular não importa arquivos.<br>" +
      "Engrenagem → Configurações → Importar e exportar → Importar → escolha o " +
      "arquivo e a agenda de destino.</p>" +

      "<p class='ics-help-step'><strong>Apple Calendário</strong><br>" +
      "No Mac: Arquivo → Importar. No iPhone: toque no arquivo e escolha " +
      "“Adicionar tudo”.</p>" +

      "<p class='ics-help-tip'><strong>Crie um calendário só pra isso</strong>, " +
      "não use o principal. Quando o horário mudar, baixe de novo e importe no " +
      "mesmo calendário: os eventos se atualizam no lugar, sem duplicar. O que não " +
      "some sozinho é aula retirada da grade — se acumular, apague o calendário " +
      "inteiro e importe de novo.</p>";

    details.appendChild(body);
    panel.appendChild(details);
  }


  function setupSharePanelButton() {
    const btn = document.getElementById("share-config-btn");
    btn.setAttribute("aria-controls", "share-panel");
    btn.setAttribute("aria-expanded", "false");
    btn.addEventListener("click", () => togglePanel("share-panel", renderSharePanel));
  }

  async function copyShareLink(embed) {
    const url = buildShareUrl(embed);
    let copied = false;
    try {
      await navigator.clipboard.writeText(url);
      copied = true;
    } catch (e) {
      copied = fallbackCopy(url);
    }
    showToast(
      copied
        ? embed ? "Link de embed copiado!" : "Link copiado!"
        : "Não consegui copiar automaticamente."
    );
  }

  // ---------------------------------------------------------------------
  // Exportação .ics
  //
  // A planilha é um template de "semana padrão" — não tem datas, só dias da
  // semana. Então cada evento vira um VEVENT recorrente semanal (RRULE),
  // ancorado na próxima ocorrência daquele dia a partir de hoje.
  //
  // Horários vão como "floating time" (sem Z e sem TZID): é exatamente o
  // que se quer aqui — 09:00 é 09:00 no fuso de quem abrir, sem precisar
  // embutir uma VTIMEZONE inteira no arquivo.
  // ---------------------------------------------------------------------
  const ICS_BYDAY = { SEGUNDA: "MO", TERCA: "TU", QUARTA: "WE", QUINTA: "TH", SEXTA: "FR" };

  // A recorrência termina em 30/11 — último dia da última semana de
  // novembro. É uma DATA fixa, não uma contagem de semanas: quem baixar em
  // setembro e quem baixar em outubro recebem o mesmo fim.
  const ICS_UNTIL_MONTH = 11; // 1-12
  const ICS_UNTIL_DAY = 30;

  function icsUntilDate() {
    const now = new Date();
    const past =
      now.getMonth() + 1 > ICS_UNTIL_MONTH ||
      (now.getMonth() + 1 === ICS_UNTIL_MONTH && now.getDate() > ICS_UNTIL_DAY);
    return new Date(now.getFullYear() + (past ? 1 : 0), ICS_UNTIL_MONTH - 1, ICS_UNTIL_DAY);
  }

  function icsUntilStamp() {
    const d = icsUntilDate();
    return d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()) + "T235959";
  }

  function icsUntilLabel() {
    const d = icsUntilDate();
    return pad2(d.getDate()) + "/" + pad2(d.getMonth() + 1) + "/" + d.getFullYear();
  }

  function icsEscape(text) {
    return String(text == null ? "" : text)
      .replace(/\\/g, "\\\\")
      .replace(/;/g, "\\;")
      .replace(/,/g, "\\,")
      .replace(/\r?\n/g, "\\n");
  }

  // O RFC 5545 limita cada linha a 75 octetos; o excedente continua na
  // linha seguinte começando por um espaço.
  const ICS_ENCODER = new TextEncoder();

  function icsFold(line) {
    const chunks = [];
    let out = "";
    let len = 0;
    // Itera por code point (for...of), não por índice: quebrar no meio de
    // um caractere acentuado corromperia o arquivo.
    for (const ch of line) {
      const size = ICS_ENCODER.encode(ch).length;
      if (len + size > 73) {
        chunks.push(out);
        out = " ";
        len = 1;
      }
      out += ch;
      len += size;
    }
    chunks.push(out);
    return chunks.join("\r\n");
  }

  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  function icsStamp(date) {
    return (
      date.getUTCFullYear() + pad2(date.getUTCMonth() + 1) + pad2(date.getUTCDate()) +
      "T" + pad2(date.getUTCHours()) + pad2(date.getUTCMinutes()) + pad2(date.getUTCSeconds()) + "Z"
    );
  }

  // ---------------------------------------------------------------------
  // UID — a identidade do evento pro app de calendário.
  //
  // É o que decide se reimportar o arquivo ATUALIZA o evento que já existe
  // ou cria um duplicado ao lado. Por isso o UID tem que ser estável em
  // tudo o que NÃO é a identidade da aula:
  //
  //  - não usa o `id` da planilha (ev001, ev002...), que é sequencial e
  //    muda inteiro a cada reextração;
  //  - não usa dia/hora ATUAIS, senão remarcar uma aula (ou corrigir o
  //    horário na planilha) criaria um evento novo e deixaria o antigo
  //    encalhado no calendário — exatamente o que a gente quer evitar.
  //
  // Usa a identidade ORIGINAL: categoria + dia/hora de planilha + grupo +
  // subtipo. O subtipo é indispensável: o grupo 7/8 tem duas práticas de
  // CI na quinta no MESMO horário, em locais diferentes (Policlínica
  // Regional e Clínica Acadêmica). Sem ele as duas dividiriam o mesmo UID
  // e uma sobrescreveria a outra no calendário.
  //
  // Compromissos pessoais já têm id próprio, gerado uma vez e salvo.
  // ---------------------------------------------------------------------
  const ICS_DOMAIN = "@gabrielsvieira01.github.io";

  function icsUid(ev, index) {
    if (ev.category === "PESSOAL") {
      return (ev.id || "pe" + index) + ICS_DOMAIN;
    }
    const base = ev.original || ev;
    return (
      [ev.category, base.day, base.start, ev.group || "todos", ev.subtype || ""]
        .join("-")
        .replace(/[^A-Za-z0-9_-]/g, "") + ICS_DOMAIN
    );
  }

  function icsLocal(date, hhmm) {
    const [h, m] = hhmm.split(":").map(Number);
    return (
      date.getFullYear() + pad2(date.getMonth() + 1) + pad2(date.getDate()) +
      "T" + pad2(h) + pad2(m) + "00"
    );
  }

  function buildIcs(events) {
    const stamp = icsStamp(new Date());
    const until = icsUntilStamp();
    const lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Semana Padrao 8P//gabrielsvieira01.github.io//PT-BR",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "X-WR-CALNAME:" + icsEscape("Semana Padrão — 8º Período"),
    ];

    const anchor = weekAnchorDate();

    events.forEach((ev, i) => {
      const week = weekMarkFor(ev);
      // Só dá pra emitir recorrência quinzenal se soubermos qual semana do
      // calendário é a "semana 1". Sem âncora, o evento marcado cai pra
      // semanal — melhor aparecer a mais do que sumir.
      const biweekly = !!(week && anchor);
      const first = nextOccurrence(ev.day, biweekly ? week : null, anchor);
      if (!first) return;

      const notes = [subtitleFor(ev)];
      if (ev.subtype) notes.push(ev.subtype);
      if (week) {
        notes.push(
          biweekly
            ? "Quinzenal (semana " + week + ")"
            : "Semana " + week + " — sem data de referência, exportado como semanal"
        );
      }
      notes.push("Gerado pela agenda da Semana Padrão — confira mudanças na planilha oficial.");

      lines.push(
        "BEGIN:VEVENT",
        "UID:" + icsUid(ev, i),
        "DTSTAMP:" + stamp,
        "DTSTART:" + icsLocal(first, ev.start),
        "DTEND:" + icsLocal(first, ev.end),
        // WKST=MO é obrigatório com INTERVAL>1: o RFC 5545 conta os
        // intervalos a partir do início da semana, e o padrão é domingo.
        "RRULE:FREQ=WEEKLY;" + (biweekly ? "INTERVAL=2;WKST=MO;" : "") +
          "BYDAY=" + ICS_BYDAY[ev.day] + ";UNTIL=" + until,
        "SUMMARY:" + icsEscape(titleFor(ev)),
        "DESCRIPTION:" + icsEscape(notes.join(" · ")),
        "CATEGORIES:" + icsEscape(ev.category_label || ev.category),
        "END:VEVENT"
      );
    });

    lines.push("END:VCALENDAR");
    return lines.map(icsFold).join("\r\n") + "\r\n";
  }

  function downloadIcs() {
    const events = allEvents().filter((ev) => isEventVisible(ev, filterState));
    if (!events.length) {
      showToast("Nenhum evento com os filtros atuais.");
      return;
    }
    const blob = new Blob([buildIcs(events)], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "semana-padrao-8p.ics";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast(events.length + " eventos exportados");
  }

  function fallbackCopy(text) {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch (e) {
      ok = false;
    }
    document.body.removeChild(ta);
    return ok;
  }

  let toastTimer = null;
  function showToast(message) {
    let toast = document.getElementById("app-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "app-toast";
      toast.className = "app-toast";
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add("visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("visible"), 2200);
  }

  // ---------------------------------------------------------------------
  // Modo foto (nova aba)
  // ---------------------------------------------------------------------
  function openPhotoMode() {
    const visibleEvents = allEvents()
      .filter((ev) => isEventVisible(ev, filterState))
      .map((ev) => Object.assign({}, ev, { weekClass: weekClassFor(ev) }));
    const theme = document.documentElement.getAttribute("data-theme") || "light";
    const payload = {
      bounds: BOUNDS,
      dayOrder: DAY_ORDER,
      dayLabels: DATA.events.reduce((acc, ev) => {
        acc[ev.day] = ev.day_label;
        return acc;
      }, {}),
      dayLabelShort: DAY_LABEL_SHORT,
      events: visibleEvents,
      theme: theme,
      // Sem marca de "agora" aqui de propósito: o modo foto existe pra
      // virar print, e um print com "estamos às 09:37" nasce velho.
    };
    const html = buildPhotoDocument(payload);
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
  }

  function buildPhotoDocument(payload) {
    const css = document.getElementById("main-styles").textContent;
    return (
      "<!DOCTYPE html><html lang='pt-BR'><head><meta charset='utf-8'>" +
      "<meta name='viewport' content='width=device-width, initial-scale=1'>" +
      "<title>Semana Padrão — Modo Foto</title><style>" + css + "</style></head>" +
      "<body class='photo-mode' data-theme='" + payload.theme + "'>" +
      "<div id='photo-root'></div>" +
      "<script>window.PHOTO_DATA = " + JSON.stringify(payload) + ";<" + "/script>" +
      // As funções compartilhadas entram serializadas: o documento é um
      // Blob standalone, não consegue carregar assets/shared.js.
      "<script>" + SHARED.serialize() + "<" + "/script>" +
      "<script>" + PHOTO_APP_SRC + "<" + "/script>" +
      "</body></html>"
    );
  }

  // Código específico da aba de "modo foto" (embutido como string pra
  // funcionar dentro do Blob standalone). Só a parte de RENDER mora aqui —
  // toMinutes / fmtRange / escapeHtml / titleFor / subtitleFor /
  // layoutOverlaps / blockGeometry vêm de SHARED.serialize(), injetado
  // logo acima. Antes eram cópias literais mantidas à mão, e foi assim que
  // a bolinha de "Pessoal" ficou sem cor: a categoria tinha sido
  // adicionada só de um lado.
  const PHOTO_APP_SRC = `
(function(){
  "use strict";
  const DATA = window.PHOTO_DATA;
  const root = document.getElementById("photo-root");

  function buildToolbar(mode) {
    const bar = document.createElement("div");
    bar.className = "photo-toolbar";
    bar.innerHTML =
      "<h2>Semana Padrão \u2014 Modo Foto</h2>" +
      "<div class='photo-toggle'>" +
      "<button data-mode='grid'" + (mode==="grid"?" class='active'":"") + ">Grade</button>" +
      "<button data-mode='list'" + (mode==="list"?" class='active'":"") + ">Lista</button>" +
      "</div>";
    bar.querySelectorAll("button").forEach((btn) => {
      btn.addEventListener("click", () => render(btn.getAttribute("data-mode")));
    });
    return bar;
  }

  function renderGridMode(container) {
    const px = 64;
    const numHours = DATA.bounds.endHour - DATA.bounds.startHour;
    const totalHeight = numHours * px;

    const stage = document.createElement("div");
    stage.className = "photo-stage";
    const scaler = document.createElement("div");
    scaler.className = "photo-grid-scaler";

    const wrap = document.createElement("div");
    wrap.className = "agenda";
    wrap.style.boxShadow = "none";
    const inner = document.createElement("div");
    inner.className = "agenda-inner";
    inner.style.minWidth = "820px";

    const corner = document.createElement("div");
    corner.className = "corner-head";
    inner.appendChild(corner);

    DATA.dayOrder.forEach((day) => {
      const head = document.createElement("div");
      head.className = "day-head";
      head.textContent = DATA.dayLabelShort[day];
      inner.appendChild(head);
    });

    const axis = document.createElement("div");
    axis.className = "time-axis";
    axis.style.height = totalHeight + "px";
    for (let i=0;i<=numHours;i++){
      const tick = document.createElement("div");
      tick.className = "tick";
      tick.style.height = px + "px";
      if (i < numHours) {
        const span = document.createElement("span");
        span.textContent = String(DATA.bounds.startHour + i).padStart(2,"0") + ":00";
        tick.appendChild(span);
      }
      axis.appendChild(tick);
    }
    inner.appendChild(axis);

    DATA.dayOrder.forEach((day) => {
      const col = document.createElement("div");
      col.className = "day-col";
      col.style.height = totalHeight + "px";
      for (let i=0;i<=numHours;i++){
        const row = document.createElement("div");
        row.className = "hour-row";
        row.style.top = (i*px) + "px";
        col.appendChild(row);
      }
      const dayEvents = DATA.events.filter((ev) => ev.day === day);
      const positioned = layoutOverlaps(dayEvents);
      positioned.forEach(({ev, col:c, colCount, overlay}) => {
        const s = toMinutes(ev.start) - DATA.bounds.startHour*60;
        const e = toMinutes(ev.end) - DATA.bounds.startHour*60;
        const top = (s/60)*px;
        const height = Math.max(((e-s)/60)*px, 20);
        const block = document.createElement("div");
        block.className = "event-block cat-" + ev.category;
        // mesmo critério por duração usado no grid principal
        const durationMin = e - s;
        if (durationMin < 35) block.classList.add("compact");
        else if (durationMin < 55) block.classList.add("brief");
        if (ev.color) block.style.backgroundColor = ev.color; // ver nota em renderEventBlock
        if (overlay) block.classList.add("overlay");
        if (ev.weekClass) block.classList.add(ev.weekClass);
        const geo = blockGeometry(c, colCount, overlay);
        block.style.top = top+"px";
        block.style.height = height+"px";
        block.style.left = geo.left;
        block.style.width = geo.width;
        block.style.zIndex = String(geo.zIndex);
        block.innerHTML = "<div class='ev-time'>"+fmtRange(ev.start,ev.end)+"</div>"+
          "<div class='ev-title'>"+escapeHtml(titleFor(ev))+"</div>"+
          "<div class='ev-sub'>"+escapeHtml(subtitleFor(ev))+"</div>";
        col.appendChild(block);
      });
      inner.appendChild(col);
    });

    wrap.appendChild(inner);
    scaler.appendChild(wrap);
    stage.appendChild(scaler);
    container.appendChild(stage);

    // Escala pra caber inteiro na tela, sem rolar (mesmo no celular)
    requestAnimationFrame(() => {
      const availW = stage.clientWidth - 32;
      const availH = stage.clientHeight - 32;
      const natW = wrap.scrollWidth;
      const natH = wrap.scrollHeight;
      const scale = Math.min(availW / natW, availH / natH, 1.4);
      scaler.style.transform = "scale(" + scale + ")";
    });
  }

  function renderListMode(container) {
    const stage = document.createElement("div");
    stage.className = "photo-stage list-mode";
    renderAgendaList(stage, DATA.events, {
      dayOrder: DATA.dayOrder,
      dayLabels: DATA.dayLabels,
    });
    container.appendChild(stage);
  }

  function render(mode) {
    root.innerHTML = "";
    root.appendChild(buildToolbar(mode));
    if (mode === "grid") renderGridMode(root);
    else renderListMode(root);
  }

  render("grid");
  window.addEventListener("resize", () => {
    const activeBtn = document.querySelector(".photo-toggle button.active");
    render(activeBtn ? activeBtn.getAttribute("data-mode") : "grid");
  });
})();
`;

  // ---------------------------------------------------------------------
  // Modo embed: encaixa a grade inteira na tela (igual o modo foto faz),
  // sem precisar rolar dentro do bloco de Embed do Notion.
  // Reaproveita a mesma técnica de scale-to-fit do modo foto, só que
  // aplicada direto no grid ao vivo (#agenda), em vez de um documento
  // separado.
  //
  // Importante: o WebView do Notion (principalmente no app mobile) pode
  // redimensionar o iframe do embed de forma assíncrona, sem disparar um
  // 'resize' de verdade, e fontes podem terminar de carregar depois do
  // primeiro layout. Por isso a gente reforça com ResizeObserver +
  // document.fonts.ready + algumas tentativas espaçadas no início.
  // ---------------------------------------------------------------------
  // Tamanho mínimo, em pixels de tela, que o texto do card pode ter depois
  // de a grade ser escalada pra caber no bloco. Abaixo disso vira borrão
  // — é o que acontecia no WebView do Notion no celular, onde o iframe é
  // estreito e baixo e a grade caía pra ~0.4 de escala (~5px). Quando não
  // dá pra respeitar esse mínimo, troca-se de layout (lista) em vez de
  // continuar encolhendo.
  const EMBED_MIN_FONT_PX = 8.5;

  // Converte esse mínimo na escala correspondente, lendo o tamanho real do
  // card em vez de assumir 0.72rem — se o CSS mudar, o limite acompanha.
  function embedMinScale() {
    const probe = document.querySelector(".event-block");
    const fontPx = probe ? parseFloat(getComputedStyle(probe).fontSize) : 11.52;
    if (!fontPx) return 0.75;
    return EMBED_MIN_FONT_PX / fontPx;
  }

  let embedLayout = null; // "grid" | "list" — evita re-render a cada medição

  function enterEmbedMode() {
    document.body.classList.add("embed-mode");

    // Um embed é sempre "a semana". Sem isso, quem tivesse "Dia" salvo no
    // próprio navegador veria o bloco do Notion com um dia só — e o link
    // renderizaria diferente pra cada pessoa. Não persiste: é só pra esta
    // visualização.
    viewState.mode = "week";
    viewState.explicit = true;

    const agenda = document.getElementById("agenda");
    const scaler = document.createElement("div");
    scaler.id = "embed-scaler";
    agenda.parentNode.insertBefore(scaler, agenda);
    scaler.appendChild(agenda);

    const list = document.createElement("div");
    list.id = "embed-list";
    list.hidden = true;
    scaler.parentNode.appendChild(list);

    // A grade já foi montada antes de a classe embed-mode existir, com a
    // altura de hora normal; remonta pra pegar a altura reduzida do embed
    // (ver hourPx).
    renderGrid();
    scheduleEmbedFit();
  }

  // Onde estamos agora, no formato que renderAgendaList espera. Null no
  // fim de semana (não há dia correspondente na grade).
  function nowInfo() {
    const day = todayKey();
    if (!day) return null;
    const d = new Date();
    return {
      day: day,
      minutes: d.getHours() * 60 + d.getMinutes(),
      label: String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"),
    };
  }

  function renderEmbedList() {
    const list = document.getElementById("embed-list");
    if (!list) return;
    SHARED.renderAgendaList(
      list,
      allEvents().filter((ev) => isEventVisible(ev, filterState)),
      {
        dayOrder: DAY_ORDER,
        dayLabels: DAY_LABEL_FULL,
        // Num embed o espaço é curto: dia sem aula vira só ruído.
        skipEmptyDays: true,
        now: nowInfo(),
      }
    );
  }

  function scheduleEmbedFit() {
    fitEmbedGrid();

    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(fitEmbedGrid).catch(() => {});
    }

    // Retentativas espaçadas: cobre layout tardio do WebView/iframe do
    // Notion, que nem sempre dispara 'resize' quando redimensiona o embed.
    [50, 150, 400, 900, 1800, 3000].forEach((ms) => setTimeout(fitEmbedGrid, ms));

    if (window.ResizeObserver) {
      const stage = document.getElementById("grid-scroll-wrap");
      new ResizeObserver(() => fitEmbedGrid()).observe(stage);
    }
  }

  function fitEmbedGrid() {
    if (!document.body.classList.contains("embed-mode")) return;
    const stage = document.getElementById("grid-scroll-wrap");
    const scaler = document.getElementById("embed-scaler");
    const list = document.getElementById("embed-list");
    if (!stage || !scaler || !list) return;

    // Mede sempre a grade em tamanho natural, mesmo que a lista esteja em
    // uso: é a medição que decide se dá pra voltar pra grade (ex.: alguém
    // esticou o bloco do Notion, ou girou o celular pra horizontal).
    const inner = document.getElementById("agenda-inner");
    scaler.hidden = false;
    scaler.style.transform = "none";
    inner.style.width = "";

    const PAD = 24; // 12px de respiro de cada lado
    const availW = stage.clientWidth - PAD;
    const availH = stage.clientHeight - PAD;
    if (availW <= 0 || availH <= 0) return;

    // Num embed a altura é quase sempre o que limita (a grade cobre ~15h
    // e o bloco do Notion é baixo). Então: descobre a escala imposta pela
    // altura e alarga a grade até que, JÁ escalada, ela preencha a
    // largura do bloco. Sem isso um bloco largo e baixo mostrava a grade
    // espremida no canto esquerdo, com metade da largura sobrando e as
    // colunas estreitas à toa.
    const naturalH = scaler.scrollHeight;
    if (!naturalH) return;
    const heightScale = availH / naturalH;
    const targetW = Math.max(820, availW / heightScale);
    inner.style.width = targetW + "px";

    const natW = scaler.scrollWidth;
    const natH = scaler.scrollHeight;
    if (!natW || !natH) return;

    // pequena folga (2%) pra absorver arredondamento e não cortar borda
    const scale = Math.min(availW / natW, availH / natH, 2) * 0.98;
    const layout = scale < embedMinScale() ? "list" : "grid";

    if (layout === "list") {
      inner.style.width = "";
      scaler.hidden = true;
      list.hidden = false;
      document.body.classList.add("embed-list-mode");
      // Só remonta a lista na TROCA de layout: fitEmbedGrid roda várias
      // vezes (retentativas, ResizeObserver) e re-renderizar a cada
      // medição faria a lista piscar e perder a posição de rolagem.
      if (embedLayout !== "list") renderEmbedList();
      embedLayout = "list";
      return;
    }

    list.hidden = true;
    document.body.classList.remove("embed-list-mode");
    scaler.style.transform = "scale(" + scale + ")";
    embedLayout = "grid";
  }

  // ---------------------------------------------------------------------
  // Inicialização
  // ---------------------------------------------------------------------
  function handleResize() {
    if (syncModeToWidth()) renderViewToggle();
    renderGrid();
    fitEmbedGrid();
  }

  // A linha de "agora" mudava de posição via renderGrid() inteiro a cada
  // minuto — remontava os 40+ cards e, de quebra, fechava qualquer card
  // que estivesse expandido enquanto a pessoa lia. Agora só a linha se
  // move; o grid só é remontado quando ela cruza um dia diferente.
  function tickNowLine() {
    // No embed em modo lista a marca de "agora" fica ENTRE os cards, então
    // mover não resolve: a posição pode ter mudado de lugar na ordem.
    // Remontar a lista é barato (uma dezena de nós) e roda 1x por minuto.
    if (embedLayout === "list") {
      renderEmbedList();
      return;
    }
    const line = document.querySelector(".now-line");
    const today = todayKey();
    const shouldExist = today && visibleDays().indexOf(today) !== -1;
    if (!shouldExist) {
      if (line) line.remove();
      return;
    }
    const fresh = buildNowLine(hourPx());
    if (!fresh) {
      if (line) line.remove();
      return;
    }
    if (line) line.style.top = fresh.style.top;
    else renderGrid();
  }

  function init() {
    const urlState = readStateFromUrl();
    if (urlState) applyUrlState(urlState);

    // Modo embed agora depende só do marcador explícito ?embed=1 — não de
    // "o link por acaso mudou algum filtro?".
    const embed = isEmbedRequested();

    initTheme(urlState && (urlState.t === "dark" || urlState.t === "light") ? urlState.t : null);
    renderFilters();
    setupActionBar();
    renderViewToggle();
    renderGrid();

    if (embed) {
      enterEmbedMode();
    } else {
      document.getElementById("photo-mode-btn").addEventListener("click", openPhotoMode);
    }

    window.addEventListener("resize", debounce(handleResize, 150));
    setInterval(tickNowLine, 60000);

    document.addEventListener("click", () => {
      document.querySelectorAll(".event-block.expanded").forEach((b) => {
        if (b._collapse) b._collapse();
      });
    });

    // Setas ← → navegam entre os dias na visão de dia.
    document.addEventListener("keydown", (evt) => {
      if (viewState.mode !== "day") return;
      if (evt.target.closest("input, select, textarea")) return;
      if (evt.key === "ArrowLeft") stepDay(-1);
      else if (evt.key === "ArrowRight") stepDay(1);
    });
  }

  function debounce(fn, wait) {
    let t;
    return function () {
      clearTimeout(t);
      t = setTimeout(fn, wait);
    };
  }

  document.addEventListener("DOMContentLoaded", init);
})();
