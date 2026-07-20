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
    };
    CATEGORY_ORDER.forEach((cat) => {
      state.enabled[cat] = true;
    });
    if (saved) {
      if (saved.enabled) Object.assign(state.enabled, saved.enabled);
      if (saved.group) Object.assign(state.group, saved.group);
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

  function isEventVisible(ev, state) {
    if (!state.enabled[ev.category]) return false;
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

  function renderEventBlock(ev, col, colCount, px) {
    const s = toMinutes(ev.start) - BOUNDS.startHour * 60;
    const e = toMinutes(ev.end) - BOUNDS.startHour * 60;
    const top = (s / 60) * px;
    const height = Math.max(((e - s) / 60) * px, 20);

    const block = document.createElement("div");
    block.className = "event-block cat-" + ev.category;
    if (height < 40) block.classList.add("compact");

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
    block.title = titleFor(ev) + "\n" + fmtRange(ev.start, ev.end) + "\n" + subtitleFor(ev);
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
        });
        chip.appendChild(select);
      }

      bar.appendChild(chip);
    });
  }

  // ---------------------------------------------------------------------
  // Tema claro / escuro
  // ---------------------------------------------------------------------
  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    const btn = document.getElementById("theme-toggle");
    if (btn) btn.querySelector(".theme-label").textContent = theme === "dark" ? "Escuro" : "Claro";
  }

  function initTheme() {
    let saved = null;
    try {
      saved = localStorage.getItem(THEME_KEY);
    } catch (e) {
      saved = null;
    }
    const theme = saved || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
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
  // Modo foto (nova aba)
  // ---------------------------------------------------------------------
  function openPhotoMode() {
    const visibleEvents = DATA.events.filter((ev) => isEventVisible(ev, filterState));
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
  // Inicialização
  // ---------------------------------------------------------------------
  function init() {
    initTheme();
    renderFilters();
    renderGrid();

    document.getElementById("photo-mode-btn").addEventListener("click", openPhotoMode);

    window.addEventListener("resize", debounce(renderGrid, 150));
    setInterval(renderGrid, 60000); // atualiza a linha de "agora" a cada minuto
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
