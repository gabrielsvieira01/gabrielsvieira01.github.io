// =============================================================================
// Semana Padrão — 8º Período — app.js
// Lê window.SCHEDULE_DATA (gerado por scripts/extract_schedule.py) e monta:
//   - o grid principal (dias x horários)
//   - a barra de filtros (categoria + grupo)
//   - o tema claro/escuro
//   - o "modo foto" (nova aba, grid escalado / lista)
// =============================================================================

(function () {
  "use strict";

  const DATA = window.SCHEDULE_DATA;
  if (!DATA) {
    document.getElementById("agenda-inner").innerHTML =
      '<div class="empty-state">Não foi possível carregar output/events.js. Rode o script de extração novamente.</div>';
    return;
  }

  const DAY_ORDER = ["SEGUNDA", "TERCA", "QUARTA", "QUINTA", "SEXTA"];
  const DAY_LABEL_SHORT = {
    SEGUNDA: "Seg",
    TERCA: "Ter",
    QUARTA: "Qua",
    QUINTA: "Qui",
    SEXTA: "Sex",
  };
  // getDay(): 0=domingo ... 6=sábado
  const JS_WEEKDAY_TO_KEY = { 1: "SEGUNDA", 2: "TERCA", 3: "QUARTA", 4: "QUINTA", 5: "SEXTA" };

  const CATEGORY_ORDER = ["HAM", "CI_PRATICA", "PIEPE", "IESC_COMUNIDADES", "CI_MARC_PALESTRA"];
  const CATEGORY_META = {
    HAM: { label: "HAM", color: "var(--cat-ham)", filterable: true },
    CI_PRATICA: { label: "CI Prática", color: "var(--cat-ci)", filterable: true },
    PIEPE: { label: "PIEPE", color: "var(--cat-piepe)", filterable: true },
    IESC_COMUNIDADES: { label: "IESC / Comunidades", color: "var(--cat-iesc)", filterable: true },
    CI_MARC_PALESTRA: { label: "CI MARC / Palestra", color: "var(--cat-marc)", filterable: false },
  };

  // ---------------------------------------------------------------------
  // Helpers de tempo
  // ---------------------------------------------------------------------
  function toMinutes(hhmm) {
    const [h, m] = hhmm.split(":").map(Number);
    return h * 60 + m;
  }
  function fmtRange(a, b) {
    return a + "–" + b;
  }
  function timesOverlap(aStart, aEnd, bStart, bEnd) {
    return toMinutes(aStart) < toMinutes(bEnd) && toMinutes(bStart) < toMinutes(aEnd);
  }

  // Chave estável de um evento, usada pra persistir a marcação manual de
  // semana 1/2 (ver CATEGORY_DEPENDENCIES mais abaixo pro outro uso de
  // colisão de horário). Não usa o "id" sequencial do events.js porque
  // esse id muda toda vez que a planilha é reextraída — dia+horário+grupo
  // já identificam a prática de forma estável entre reextrações.
  function weekKey(ev) {
    return [ev.category, ev.day, ev.start, ev.end, ev.group].join("|");
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
      return DATA.events.some(
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
  const MARC_SPLIT_DAYS = (function () {
    const result = {};
    DAY_ORDER.forEach((day) => {
      const palestra = DATA.events.find(
        (ev) => ev.category === "CI_MARC_PALESTRA" && ev.subtype === "CI Palestra" && ev.day === day
      );
      if (!palestra) return;
      const marcs = DATA.events.filter(
        (ev) => ev.category === "CI_MARC_PALESTRA" && ev.subtype === "CI MARC" && ev.day === day
      );
      const before = marcs.filter((ev) => toMinutes(ev.start) < toMinutes(palestra.start));
      const after = marcs.filter((ev) => toMinutes(ev.start) >= toMinutes(palestra.start));
      if (before.length && after.length) {
        result[day] = { before, after };
      }
    });
    return result;
  })();

  // Um grupo só pode ESCOLHER o horário se nenhum dos dois blocos colidir
  // com a própria prática dele (se colidisse, o bloco "antes" já estaria
  // oculto por isHiddenByDependency, e não haveria escolha real).
  function isEligibleForMarcChoice(day, state) {
    const clusters = MARC_SPLIT_DAYS[day];
    if (!clusters) return false;
    return !clusters.before.some((ev) => isHiddenByDependency(ev, state));
  }

  function marcTimeRangeLabel(events) {
    const sorted = events.slice().sort((a, b) => toMinutes(a.start) - toMinutes(b.start));
    return fmtRange(sorted[0].start, sorted[sorted.length - 1].end);
  }

  // ---------------------------------------------------------------------
  // Título / subtítulo de exibição por evento
  // ---------------------------------------------------------------------
  function titleFor(ev) {
    switch (ev.category) {
      case "HAM":
        return "HAM – " + ev.subtype;
      case "CI_PRATICA":
        return "CI Prática – " + (ev.subtype || "");
      case "PIEPE":
        return "PIEPE";
      case "IESC_COMUNIDADES":
        return ev.subtype === "Palestra" ? "IESC – Palestra" : "Comunidades – Prática";
      case "CI_MARC_PALESTRA":
        return "Clínica Integrada – " + ev.subtype;
      default:
        return ev.category_label;
    }
  }
  function subtitleFor(ev) {
    const who = ev.preceptor || "";
    if (!ev.group || ev.group === "TODOS") {
      return "Todos os grupos" + (who ? " · " + who : "");
    }
    return "Grupo " + ev.group + (who ? " · " + who : "");
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
  // Estado compartilhável via URL (?state=...)
  // Reaproveita a mesma forma de filterState (enabled/group) + tema.
  // Não usa nenhuma lista fixa: serializa só as chaves que já existem
  // em filterState/DATA em tempo de execução, então acompanha
  // automaticamente novas categorias/grupos/horários no futuro.
  // ---------------------------------------------------------------------
  const STATE_PARAM = "state";

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

    if (urlState.m && typeof urlState.m === "object") {
      Object.keys(urlState.m).forEach((day) => {
        const v = urlState.m[day];
        if (MARC_SPLIT_DAYS[day] && (v === "before" || v === "after")) {
          filterState.marcSlot[day] = v;
          applied = true;
        }
      });
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
      if (MARC_SPLIT_DAYS[day] && (v === "before" || v === "after")) {
        m[day] = v;
      }
    });
    if (Object.keys(m).length) compact.m = m;

    const theme = document.documentElement.getAttribute("data-theme") || "light";
    if (theme === "dark") compact.t = "dark";

    return compact;
  }

  function buildShareUrl() {
    const url = new URL(window.location.href);
    url.search = "?" + STATE_PARAM + "=" + encodeState(currentShareState());
    url.hash = "";
    return url.toString();
  }

  function isEventVisible(ev, state) {
    if (!state.enabled[ev.category]) return false;
    if (isHiddenByDependency(ev, state)) return false;

    if (ev.category === "CI_MARC_PALESTRA" && ev.subtype === "CI MARC") {
      const clusters = MARC_SPLIT_DAYS[ev.day];
      const pref = state.marcSlot && state.marcSlot[ev.day];
      // só aplica a preferência salva se o grupo ATUAL realmente tem
      // escolha nesse dia; se não tem (ex: trocou pra um grupo com
      // conflito), ignora — senão o único horário que sobra pra esse
      // grupo também seria escondido por uma preferência de outro grupo.
      if (clusters && (pref === "before" || pref === "after") && isEligibleForMarcChoice(ev.day, state)) {
        if (clusters[pref].indexOf(ev) === -1) return false;
      }
    }

    const meta = CATEGORY_META[ev.category];
    if (!meta.filterable) return true; // CI MARC/Palestra: só checkbox
    if (!ev.group || ev.group === "TODOS") return true; // comum a todos (ex: HAM Palestra, IESC Palestra)
    return ev.group === state.group[ev.category];
  }

  // ---------------------------------------------------------------------
  // Layout de sobreposição (colunas lado a lado por cluster de overlap)
  // ---------------------------------------------------------------------
  function layoutOverlaps(events) {
    const sorted = events.slice().sort((a, b) => toMinutes(a.start) - toMinutes(b.start));
    const clusters = [];
    let current = null;
    let currentEnd = -1;

    sorted.forEach((ev) => {
      const s = toMinutes(ev.start);
      const e = toMinutes(ev.end);
      if (!current || s >= currentEnd) {
        current = [];
        clusters.push(current);
        currentEnd = e;
      } else {
        currentEnd = Math.max(currentEnd, e);
      }
      current.push(ev);
    });

    const positioned = [];
    clusters.forEach((cluster) => {
      const columns = []; // cada item: minuto de término da última evento naquela coluna
      const colOf = new Map();
      cluster.forEach((ev) => {
        const s = toMinutes(ev.start);
        const e = toMinutes(ev.end);
        let placedCol = -1;
        for (let c = 0; c < columns.length; c++) {
          if (columns[c] <= s) {
            placedCol = c;
            break;
          }
        }
        if (placedCol === -1) {
          placedCol = columns.length;
          columns.push(e);
        } else {
          columns[placedCol] = e;
        }
        colOf.set(ev, placedCol);
      });
      const colCount = columns.length;
      cluster.forEach((ev) => {
        positioned.push({ ev, col: colOf.get(ev), colCount });
      });
    });
    return positioned;
  }

  // ---------------------------------------------------------------------
  // Cálculo dos limites de horário do grid (com base em TODOS os eventos,
  // pra grid não "pular" de tamanho ao alternar filtros)
  // ---------------------------------------------------------------------
  function computeBounds() {
    let min = Infinity;
    let max = -Infinity;
    DATA.events.forEach((ev) => {
      min = Math.min(min, toMinutes(ev.start));
      max = Math.max(max, toMinutes(ev.end));
    });
    const startHour = Math.floor(min / 60);
    const endHour = Math.ceil(max / 60);
    return { startHour, endHour };
  }

  const BOUNDS = computeBounds();

  function hourPx() {
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
  function weekClassFor(ev) {
    if (ev.category !== "CI_PRATICA") return null;
    const w = filterState.weekAssignment[weekKey(ev)];
    return w === "1" || w === "2" ? "week-" + w : null;
  }

  function renderEventBlock(ev, col, colCount, px) {
    const s = toMinutes(ev.start) - BOUNDS.startHour * 60;
    const e = toMinutes(ev.end) - BOUNDS.startHour * 60;
    const top = (s / 60) * px;
    const height = Math.max(((e - s) / 60) * px, 20);

    const block = document.createElement("div");
    block.className = "event-block cat-" + ev.category;
    if (height < 40) block.classList.add("compact");
    else if (height < 58) block.classList.add("brief");
    const wc = weekClassFor(ev);
    if (wc) block.classList.add(wc);

    const widthPct = 100 / colCount;
    const leftPct = col * widthPct;
    block.style.top = top + "px";
    block.style.height = height + "px";
    block.style.left = "calc(" + leftPct + "% + 2px)";
    block.style.width = "calc(" + widthPct + "% - 4px)";
    block.style.zIndex = String(2 + col);

    block.innerHTML =
      '<div class="ev-time">' + fmtRange(ev.start, ev.end) + "</div>" +
      '<div class="ev-title">' + escapeHtml(titleFor(ev)) + "</div>" +
      '<div class="ev-sub">' + escapeHtml(subtitleFor(ev)) + "</div>";
    block.title =
      titleFor(ev) + "\n" + fmtRange(ev.start, ev.end) + "\n" + subtitleFor(ev) +
      (wc ? "\n" + (wc === "week-1" ? "Semana 1" : "Semana 2") : "");

    // Clique/toque expande temporariamente o card (largura e altura),
    // útil quando o evento está espremido numa coluna estreita por causa
    // de sobreposição, ou numa tela pequena (ex: embutido no Notion).
    block.addEventListener("click", (evt) => {
      evt.stopPropagation();
      const wasExpanded = block.classList.contains("expanded");
      document.querySelectorAll(".event-block.expanded").forEach((b) => {
        b.classList.remove("expanded");
      });
      if (!wasExpanded) block.classList.add("expanded");
    });

    return block;
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str == null ? "" : String(str);
    return div.innerHTML;
  }

  function renderGrid() {
    const px = hourPx();
    document.documentElement.style.setProperty("--hour-height", px + "px");
    const numHours = BOUNDS.endHour - BOUNDS.startHour;
    const totalHeight = numHours * px;

    agendaInner.innerHTML = "";

    // canto superior esquerdo
    const corner = document.createElement("div");
    corner.className = "corner-head";
    agendaInner.appendChild(corner);

    // cabeçalhos dos dias
    const todayKey = JS_WEEKDAY_TO_KEY[new Date().getDay()];
    DAY_ORDER.forEach((day) => {
      const head = document.createElement("div");
      head.className = "day-head" + (day === todayKey ? " today" : "");
      head.textContent = DAY_LABEL_SHORT[day];
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
    const visibleEvents = DATA.events.filter((ev) => isEventVisible(ev, filterState));

    DAY_ORDER.forEach((day) => {
      const col = document.createElement("div");
      col.className = "day-col";
      col.style.height = totalHeight + "px";
      buildHourTicks(col, totalHeight, px);

      const dayEvents = visibleEvents.filter((ev) => ev.day === day);
      const positioned = layoutOverlaps(dayEvents);
      positioned.forEach(({ ev, col: c, colCount }) => {
        col.appendChild(renderEventBlock(ev, c, colCount, px));
      });

      if (day === todayKey) {
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

      agendaInner.appendChild(col);
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
    const events = DATA.events
      .filter((ev) => ev.category === "CI_PRATICA" && ev.group === group)
      .slice()
      .sort((a, b) => {
        const dayDiff = DAY_ORDER.indexOf(a.day) - DAY_ORDER.indexOf(b.day);
        return dayDiff !== 0 ? dayDiff : toMinutes(a.start) - toMinutes(b.start);
      });

    const hint = document.createElement("p");
    hint.className = "week-panel-hint";
    hint.textContent = group
      ? "Marque quais dessas práticas do grupo " + group + " são da semana 1 e quais são da semana 2."
      : "Selecione um grupo de CI Prática nos filtros pra marcar as semanas.";
    panel.appendChild(hint);

    events.forEach((ev) => {
      const row = document.createElement("div");
      row.className = "week-panel-row";

      const label = document.createElement("div");
      label.className = "wp-label";
      label.innerHTML =
        escapeHtml(ev.day_label + " " + fmtRange(ev.start, ev.end)) +
        '<span class="wp-sub">' + escapeHtml(ev.type_label_raw || "") + "</span>";
      row.appendChild(label);

      const toggle = document.createElement("div");
      toggle.className = "wp-toggle";
      ["1", "2"].forEach((w) => {
        const b = document.createElement("button");
        b.type = "button";
        b.dataset.week = w;
        b.textContent = "Semana " + w;
        const current = filterState.weekAssignment[weekKey(ev)];
        if (current === w) b.classList.add("active");
        b.addEventListener("click", () => {
          const key = weekKey(ev);
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
  }

  function setupWeekPanelButton() {
    const btn = document.getElementById("week-config-btn");
    const panel = document.getElementById("week-panel");
    btn.addEventListener("click", () => {
      panel.hidden = !panel.hidden;
      if (!panel.hidden) renderWeekPanel();
    });
  }

  // ---------------------------------------------------------------------
  // Painel "Horário do MARC" — só aparece pra grupos de CI Prática que NÃO
  // têm conflito com o horário de MARC mais cedo (ver MARC_SPLIT_DAYS /
  // isEligibleForMarcChoice). Deixa o aluno escolher entre os dois blocos
  // em vez de ver os dois juntos; "Ambos" volta pro comportamento padrão.
  // ---------------------------------------------------------------------
  function eligibleMarcDays() {
    return Object.keys(MARC_SPLIT_DAYS).filter((day) => isEligibleForMarcChoice(day, filterState));
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
      const clusters = MARC_SPLIT_DAYS[day];
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
    const panel = document.getElementById("marc-panel");
    btn.addEventListener("click", () => {
      panel.hidden = !panel.hidden;
      if (!panel.hidden) renderMarcPanel();
    });
    updateMarcButtonVisibility();
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
  // Barra de ações: "Semanas" + "Horário do MARC" (esquerda) e "Copiar
  // link" (direita) — fica entre a barra de filtros e os painéis.
  // ---------------------------------------------------------------------
  function setupShareButton() {
    const actionBar = document.createElement("div");
    actionBar.className = "share-bar";

    const left = document.createElement("div");
    left.className = "action-bar-left";

    const weekBtn = document.createElement("button");
    weekBtn.className = "icon-btn";
    weekBtn.type = "button";
    weekBtn.id = "week-config-btn";
    weekBtn.title = "Marcar semana 1 / semana 2 das práticas de CI";
    weekBtn.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>' +
      "<span>Semanas</span>";
    left.appendChild(weekBtn);

    const marcBtn = document.createElement("button");
    marcBtn.className = "icon-btn";
    marcBtn.type = "button";
    marcBtn.id = "marc-config-btn";
    marcBtn.title = "Escolher horário do MARC";
    marcBtn.hidden = true; // updateMarcButtonVisibility() decide se mostra
    marcBtn.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>' +
      "<span>Horário do MARC</span>";
    left.appendChild(marcBtn);

    actionBar.appendChild(left);

    const right = document.createElement("div");
    right.className = "action-bar-right";
    const shareBtn = document.createElement("button");
    shareBtn.className = "icon-btn";
    shareBtn.type = "button";
    shareBtn.id = "share-link-btn";
    shareBtn.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.6" y1="10.5" x2="15.4" y2="6.5"></line><line x1="8.6" y1="13.5" x2="15.4" y2="17.5"></line></svg>' +
      "<span>Copiar link desta visualização</span>";
    shareBtn.addEventListener("click", () => copyShareLink());
    right.appendChild(shareBtn);
    actionBar.appendChild(right);

    const weekPanel = document.getElementById("week-panel");
    weekPanel.parentNode.insertBefore(actionBar, weekPanel);

    setupWeekPanelButton();
    setupMarcPanelButton();
  }

  async function copyShareLink() {
    const url = buildShareUrl();
    let copied = false;
    try {
      await navigator.clipboard.writeText(url);
      copied = true;
    } catch (e) {
      copied = fallbackCopy(url);
    }
    showToast(copied ? "Link copiado!" : "Não consegui copiar automaticamente.");
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
    const visibleEvents = DATA.events
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
      "<script>" + PHOTO_APP_SRC + "<" + "/script>" +
      "</body></html>"
    );
  }

  // Código do app da aba de "modo foto" (embutido como string pra funcionar
  // dentro do Blob standalone, sem depender de outro arquivo externo).
  const PHOTO_APP_SRC = `
(function(){
  "use strict";
  const DATA = window.PHOTO_DATA;
  const root = document.getElementById("photo-root");

  const CATEGORY_META = {
    HAM: { label: "HAM" },
    CI_PRATICA: { label: "CI Prática" },
    PIEPE: { label: "PIEPE" },
    IESC_COMUNIDADES: { label: "IESC / Comunidades" },
    CI_MARC_PALESTRA: { label: "CI MARC / Palestra" },
  };

  function toMinutes(hhmm){ const [h,m]=hhmm.split(":").map(Number); return h*60+m; }
  function fmtRange(a,b){ return a + "\u2013" + b; }
  function escapeHtml(str){ const d=document.createElement("div"); d.textContent = str==null?"":String(str); return d.innerHTML; }

  function titleFor(ev) {
    switch (ev.category) {
      case "HAM": return "HAM \u2013 " + ev.subtype;
      case "CI_PRATICA": return "CI Prática \u2013 " + (ev.subtype || "");
      case "PIEPE": return "PIEPE";
      case "IESC_COMUNIDADES": return ev.subtype === "Palestra" ? "IESC \u2013 Palestra" : "Comunidades \u2013 Prática";
      case "CI_MARC_PALESTRA": return "Clínica Integrada \u2013 " + ev.subtype;
      default: return ev.category_label;
    }
  }
  function subtitleFor(ev) {
    const who = ev.preceptor || "";
    if (!ev.group || ev.group === "TODOS") return "Todos os grupos" + (who ? " · " + who : "");
    return "Grupo " + ev.group + (who ? " · " + who : "");
  }

  function layoutOverlaps(events) {
    const sorted = events.slice().sort((a,b)=>toMinutes(a.start)-toMinutes(b.start));
    const clusters = [];
    let current = null, currentEnd = -1;
    sorted.forEach((ev) => {
      const s = toMinutes(ev.start), e = toMinutes(ev.end);
      if (!current || s >= currentEnd) { current = []; clusters.push(current); currentEnd = e; }
      else { currentEnd = Math.max(currentEnd, e); }
      current.push(ev);
    });
    const positioned = [];
    clusters.forEach((cluster) => {
      const columns = []; const colOf = new Map();
      cluster.forEach((ev) => {
        const s = toMinutes(ev.start), e = toMinutes(ev.end);
        let placedCol = -1;
        for (let c=0;c<columns.length;c++){ if (columns[c] <= s) { placedCol = c; break; } }
        if (placedCol === -1) { placedCol = columns.length; columns.push(e); }
        else { columns[placedCol] = e; }
        colOf.set(ev, placedCol);
      });
      const colCount = columns.length;
      cluster.forEach((ev) => positioned.push({ ev, col: colOf.get(ev), colCount }));
    });
    return positioned;
  }

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
      positioned.forEach(({ev, col:c, colCount}) => {
        const s = toMinutes(ev.start) - DATA.bounds.startHour*60;
        const e = toMinutes(ev.end) - DATA.bounds.startHour*60;
        const top = (s/60)*px;
        const height = Math.max(((e-s)/60)*px, 20);
        const block = document.createElement("div");
        block.className = "event-block cat-" + ev.category;
        if (height < 40) block.classList.add("compact");
        else if (height < 58) block.classList.add("brief");
        if (ev.weekClass) block.classList.add(ev.weekClass);
        const widthPct = 100/colCount;
        const leftPct = c*widthPct;
        block.style.top = top+"px";
        block.style.height = height+"px";
        block.style.left = "calc(" + leftPct + "% + 2px)";
        block.style.width = "calc(" + widthPct + "% - 4px)";
        block.style.zIndex = String(2+c);
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
    DATA.dayOrder.forEach((day) => {
      const section = document.createElement("div");
      section.className = "list-day";
      const h3 = document.createElement("h3");
      h3.textContent = DATA.dayLabels[day] || day;
      section.appendChild(h3);

      const dayEvents = DATA.events.filter((ev) => ev.day === day)
        .slice().sort((a,b)=>toMinutes(a.start)-toMinutes(b.start));

      if (dayEvents.length === 0) {
        const empty = document.createElement("div");
        empty.className = "empty";
        empty.textContent = "Sem eventos com os filtros atuais.";
        section.appendChild(empty);
      }

      dayEvents.forEach((ev) => {
        const card = document.createElement("div");
        card.className = "list-card";
        const dot = document.createElement("div");
        dot.className = "dot";
        dot.style.background = "var(--cat-" + ({HAM:"ham",CI_PRATICA:"ci",PIEPE:"piepe",IESC_COMUNIDADES:"iesc",CI_MARC_PALESTRA:"marc"}[ev.category]) + ")";
        const time = document.createElement("div");
        time.className = "lc-time";
        time.textContent = fmtRange(ev.start, ev.end);
        const body = document.createElement("div");
        body.className = "lc-body";
        body.innerHTML = "<div class='lc-title'>"+escapeHtml(titleFor(ev))+"</div>"+
          "<div class='lc-sub'>"+escapeHtml(subtitleFor(ev))+"</div>";
        card.appendChild(dot);
        card.appendChild(time);
        card.appendChild(body);
        section.appendChild(card);
      });
      stage.appendChild(section);
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
  function enterEmbedMode() {
    document.body.classList.add("embed-mode");

    const agenda = document.getElementById("agenda");
    const scaler = document.createElement("div");
    scaler.id = "embed-scaler";
    agenda.parentNode.insertBefore(scaler, agenda);
    scaler.appendChild(agenda);

    scheduleEmbedFit();
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
    if (!stage || !scaler) return;

    scaler.style.transform = "none"; // reseta pra medir o tamanho natural
    const PAD = 24; // 12px de respiro de cada lado
    const availW = stage.clientWidth - PAD;
    const availH = stage.clientHeight - PAD;
    const natW = scaler.scrollWidth;
    const natH = scaler.scrollHeight;
    if (!natW || !natH || availW <= 0 || availH <= 0) return;

    // pequena folga (2%) pra absorver arredondamento e não cortar borda
    const scale = Math.min(availW / natW, availH / natH, 2) * 0.98;
    scaler.style.transform = "scale(" + scale + ")";
  }

  // ---------------------------------------------------------------------
  // Inicialização
  // ---------------------------------------------------------------------
  function handleResize() {
    renderGrid();
    fitEmbedGrid();
  }

  function init() {
    const urlState = readStateFromUrl();
    const isSharedView = urlState ? applyUrlState(urlState) : false;

    initTheme(isSharedView ? (urlState.t === "dark" ? "dark" : "light") : null);
    renderFilters();
    renderGrid();
    setupShareButton();

    if (isSharedView) {
      enterEmbedMode();
    } else {
      document.getElementById("photo-mode-btn").addEventListener("click", openPhotoMode);
    }

    window.addEventListener("resize", debounce(handleResize, 150));
    setInterval(handleResize, 60000); // atualiza a linha de "agora" a cada minuto

    document.addEventListener("click", () => {
      document.querySelectorAll(".event-block.expanded").forEach((b) => {
        b.classList.remove("expanded");
      });
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
