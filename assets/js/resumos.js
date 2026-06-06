/* ============================================================================
 *  Site de RESUMOS (resumos.html)
 *  - Protege o acesso (login)
 *  - Filtro "o que mais cai" por prova (ou visão geral): reordena o gráfico e
 *    os resumos, ocultando o que não foi cobrado naquela prova.
 *  - Barra de busca para localizar assuntos.
 *  - Destaca o item da navegação da seção visível (scrollspy).
 * ========================================================================== */
(function () {
  "use strict";

  if (!window.Auth || !window.Auth.requireAuth("index.html")) return;

  var YEARS = ["2023.2", "2024.1", "2024.2", "2025.1", "2025.2"];

  // Frequência EXATA por especialidade e por prova (para o gráfico e a ordenação
  // das seções). A "key" coincide com o id da seção correspondente em resumos.html.
  var TOPICS = [
    { key: "obstetricia",     label: "Obstetrícia",      c: { "2023.2": 4, "2024.1": 12, "2024.2": 15, "2025.1": 12, "2025.2": 10 } },
    { key: "gastro",          label: "Gastro / Abdome",  c: { "2023.2": 7, "2024.1": 8,  "2024.2": 7,  "2025.1": 7,  "2025.2": 4 } },
    { key: "infecto",         label: "Infectologia",     c: { "2023.2": 6, "2024.1": 4,  "2024.2": 7,  "2025.1": 6,  "2025.2": 9 } },
    { key: "pediatria",       label: "Pediatria",        c: { "2023.2": 9, "2024.1": 5,  "2024.2": 3,  "2025.1": 6,  "2025.2": 6 } },
    { key: "saude-mental",    label: "Saúde Mental",     c: { "2023.2": 9, "2024.1": 7,  "2024.2": 5,  "2025.1": 3,  "2025.2": 4 } },
    { key: "nefrologia",      label: "Nefrologia",       c: { "2023.2": 5, "2024.1": 3,  "2024.2": 3,  "2025.1": 4,  "2025.2": 6 } },
    { key: "hematologia",     label: "Hematologia",      c: { "2023.2": 5, "2024.1": 4,  "2024.2": 3,  "2025.1": 4,  "2025.2": 1 } },
    { key: "cirurgia",        label: "Cirurgia",         c: { "2023.2": 3, "2024.1": 2,  "2024.2": 2,  "2025.1": 2,  "2025.2": 4 } },
    { key: "ginecologia",     label: "Ginecologia",      c: { "2023.2": 3, "2024.1": 2,  "2024.2": 2,  "2025.1": 2,  "2025.2": 0 } },
    { key: "pneumologia",     label: "Pneumologia",      c: { "2023.2": 0, "2024.1": 0,  "2024.2": 0,  "2025.1": 1,  "2025.2": 3 } },
    { key: "urologia",        label: "Urologia",         c: { "2023.2": 0, "2024.1": 2,  "2024.2": 1,  "2025.1": 0,  "2025.2": 0 } },
    { key: "neurologia",      label: "Neurologia",       c: { "2023.2": 0, "2024.1": 0,  "2024.2": 1,  "2025.1": 1,  "2025.2": 1 } },
    { key: "atencao-primaria",label: "Atenção Primária", c: { "2023.2": 1, "2024.1": 0,  "2024.2": 0,  "2025.1": 1,  "2025.2": 1 } }
  ];
  TOPICS.forEach(function (t) { t.total = YEARS.reduce(function (a, y) { return a + (t.c[y] || 0); }, 0); });
  var TOPIC_TOTAL = 248;

  // Assuntos NA MESMA ORDEM dos cards em resumos.html, com a contagem por prova
  // (derivada da análise das questões). count > 0 = caiu naquela prova.
  var SUBJECTS = [
    { id: "pre-natal-torch",        c: { "2023.2": 0, "2024.1": 4, "2024.2": 3, "2025.1": 3, "2025.2": 4 } },
    { id: "hipertensiva",           c: { "2023.2": 0, "2024.1": 1, "2024.2": 4, "2025.1": 2, "2025.2": 3 } },
    { id: "abortamento",            c: { "2023.2": 0, "2024.1": 2, "2024.2": 4, "2025.1": 4, "2025.2": 2 } },
    { id: "hemorragia-2a",          c: { "2023.2": 1, "2024.1": 0, "2024.2": 1, "2025.1": 0, "2025.2": 1 } },
    { id: "tpp-rpm",                c: { "2023.2": 1, "2024.1": 2, "2024.2": 7, "2025.1": 4, "2025.2": 3 } },
    { id: "parto-partograma",       c: { "2023.2": 0, "2024.1": 4, "2024.2": 4, "2025.1": 3, "2025.2": 4 } },
    { id: "hpp",                    c: { "2023.2": 0, "2024.1": 0, "2024.2": 0, "2025.1": 0, "2025.2": 0 } },
    { id: "puerperio",              c: { "2023.2": 0, "2024.1": 2, "2024.2": 1, "2025.1": 0, "2025.2": 1 } },
    { id: "reanimacao-neonatal",    c: { "2023.2": 3, "2024.1": 3, "2024.2": 4, "2025.1": 3, "2025.2": 3 } },
    { id: "abdome-agudo",           c: { "2023.2": 7, "2024.1": 5, "2024.2": 4, "2025.1": 4, "2025.2": 4 } },
    { id: "hemorragia-digestiva",   c: { "2023.2": 1, "2024.1": 4, "2024.2": 3, "2025.1": 3, "2025.2": 1 } },
    { id: "anorretal",              c: { "2023.2": 3, "2024.1": 3, "2024.2": 2, "2025.1": 2, "2025.2": 1 } },
    { id: "sepse",                  c: { "2023.2": 3, "2024.1": 3, "2024.2": 3, "2025.1": 9, "2025.2": 11 } },
    { id: "hiv-aids",               c: { "2023.2": 1, "2024.1": 5, "2024.2": 3, "2025.1": 3, "2025.2": 4 } },
    { id: "neurodesenvolvimento",   c: { "2023.2": 4, "2024.1": 2, "2024.2": 2, "2025.1": 2, "2025.2": 2 } },
    { id: "maus-tratos",            c: { "2023.2": 5, "2024.1": 2, "2024.2": 1, "2025.1": 3, "2025.2": 1 } },
    { id: "emergencia-resp-ped",    c: { "2023.2": 2, "2024.1": 2, "2024.2": 0, "2025.1": 5, "2025.2": 4 } },
    { id: "depressao-suicidio",     c: { "2023.2": 4, "2024.1": 5, "2024.2": 3, "2025.1": 3, "2025.2": 4 } },
    { id: "transtornos-psiq",       c: { "2023.2": 6, "2024.1": 1, "2024.2": 3, "2025.1": 4, "2025.2": 2 } },
    { id: "transtornos-alimentares",c: { "2023.2": 2, "2024.1": 3, "2024.2": 2, "2025.1": 0, "2025.2": 0 } },
    { id: "glomerulopatias",        c: { "2023.2": 2, "2024.1": 3, "2024.2": 2, "2025.1": 4, "2025.2": 3 } },
    { id: "ira-drc",                c: { "2023.2": 5, "2024.1": 3, "2024.2": 3, "2025.1": 2, "2025.2": 4 } },
    { id: "acido-base",             c: { "2023.2": 3, "2024.1": 5, "2024.2": 4, "2025.1": 1, "2025.2": 10 } },
    { id: "anemias",                c: { "2023.2": 2, "2024.1": 6, "2024.2": 2, "2025.1": 5, "2025.2": 2 } },
    { id: "coagulacao",             c: { "2023.2": 5, "2024.1": 5, "2024.2": 4, "2025.1": 5, "2025.2": 2 } },
    { id: "parede-posop",           c: { "2023.2": 1, "2024.1": 0, "2024.2": 1, "2025.1": 1, "2025.2": 3 } },
    { id: "choque",                 c: { "2023.2": 1, "2024.1": 4, "2024.2": 8, "2025.1": 9, "2025.2": 12 } },
    { id: "sangramento-vaginal",    c: { "2023.2": 3, "2024.1": 2, "2024.2": 2, "2025.1": 2, "2025.2": 0 } },
    { id: "dor-lombar",             c: { "2023.2": 0, "2024.1": 2, "2024.2": 2, "2025.1": 1, "2025.2": 2 } }
  ];

  function norm(s) { return (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase(); }
  function topicByKey(k) { for (var i = 0; i < TOPICS.length; i++) if (TOPICS[i].key === k) return TOPICS[i]; return null; }
  function setText(id, txt) { var el = document.getElementById(id); if (el) el.textContent = txt; }

  function init() {
    var bars = document.getElementById("bars");
    var examChips = Array.prototype.slice.call(document.querySelectorAll(".exam-chip"));
    var searchInput = document.getElementById("searchInput");
    var searchClear = document.getElementById("searchClear");
    var insights = document.getElementById("insights");
    var noResults = document.getElementById("noResults");
    var filterStatus = document.getElementById("filterStatus");

    // Mapeia os links da navegação por id de seção.
    var navMap = {};
    document.querySelectorAll(".nav-links a").forEach(function (a) {
      navMap[a.getAttribute("href").slice(1)] = a;
    });

    // Liga cada card de assunto ao seu registro em SUBJECTS (ordem do DOM).
    var sectionEls = Array.prototype.slice.call(document.querySelectorAll("#specialties .specialty"));
    var sections = sectionEls.map(function (sec, idx) {
      return { el: sec, id: sec.id, defaultOrder: idx, link: navMap[sec.id] };
    });

    var cards = [];
    sectionEls.forEach(function (sec) {
      var locals = sec.querySelectorAll(".subject");
      Array.prototype.forEach.call(locals, function (el, li) {
        cards.push({ el: el, sectionId: sec.id, localIndex: li, search: norm(el.textContent), data: null });
      });
    });
    if (cards.length === SUBJECTS.length) {
      cards.forEach(function (c, i) { c.data = SUBJECTS[i]; c.el.setAttribute("data-subject", SUBJECTS[i].id); });
    } else {
      console.warn("Resumos: nº de cards (" + cards.length + ") != SUBJECTS (" + SUBJECTS.length + ")");
      // fallback: usa contagem zero para não quebrar
      cards.forEach(function (c) { if (!c.data) c.data = { id: "?", c: {} }; });
    }

    var state = { exam: "overview", query: "" };

    function renderBars(exam) {
      var data = TOPICS.map(function (t) {
        return { label: t.label, n: exam === "overview" ? t.total : (t.c[exam] || 0) };
      });
      if (exam !== "overview") data = data.filter(function (d) { return d.n > 0; });
      data.sort(function (a, b) { return b.n - a.n; });
      var max = data.length ? data[0].n : 1;
      bars.innerHTML = data.map(function (d) {
        var w = Math.max(4, Math.round(d.n / max * 100));
        var muted = (exam === "overview" ? d.n <= 4 : d.n <= 2) ? " muted" : "";
        return '<div class="bar-row' + muted + '"><span class="bl">' + d.label +
          '</span><div class="bar-track"><div class="bar-fill" style="width:' + w + '%"></div></div>' +
          '<span class="bn">' + d.n + "</span></div>";
      }).join("");
    }

    function renderStats(exam) {
      if (exam === "overview") {
        setText("sc-count", "248");
        setText("sc-scope", "Visão geral");
        setText("sc-top", "Obstetrícia");
        setText("sc-top-k", "assunto nº 1 (21%)");
        setText("sc-spec", "13");
        return;
      }
      var tot = TOPICS.reduce(function (a, t) { return a + (t.c[exam] || 0); }, 0);
      var sorted = TOPICS.slice().sort(function (a, b) { return (b.c[exam] || 0) - (a.c[exam] || 0); });
      var top = sorted[0];
      var pct = tot ? Math.round((top.c[exam] || 0) / tot * 100) : 0;
      var nspec = TOPICS.filter(function (t) { return (t.c[exam] || 0) > 0; }).length;
      setText("sc-count", String(tot));
      setText("sc-scope", "Prova " + exam);
      setText("sc-top", top.label);
      setText("sc-top-k", "assunto nº 1 (" + pct + "%)");
      setText("sc-spec", String(nspec));
    }

    function applyFilter() {
      var exam = state.exam;
      var q = norm(state.query.trim());
      var anyVisible = false;
      var secCount = {};

      cards.forEach(function (card) {
        var passExam = (exam === "overview") || ((card.data.c[exam] || 0) > 0);
        var passSearch = !q || card.search.indexOf(q) >= 0;
        var vis = passExam && passSearch;
        card.el.style.display = vis ? "" : "none";
        if (vis) {
          anyVisible = true;
          card.el.style.order = (exam === "overview")
            ? (card.localIndex + 1)
            : (50 - (card.data.c[exam] || 0));
          secCount[card.sectionId] = (secCount[card.sectionId] || 0) + 1;
        }
      });

      sections.forEach(function (s) {
        var n = secCount[s.id] || 0;
        s.el.style.display = n > 0 ? "" : "none";
        s.el.style.order = (exam === "overview")
          ? s.defaultOrder
          : (60 - (topicByKey(s.id) ? (topicByKey(s.id).c[exam] || 0) : 0));
        if (s.link) s.link.style.display = n > 0 ? "" : "none";
      });

      renderBars(exam);
      renderStats(exam);
      if (insights) insights.style.display = (exam === "overview" && !q) ? "" : "none";
      if (noResults) noResults.hidden = anyVisible;

      // status
      var visN = cards.filter(function (c) { return c.el.style.display !== "none"; }).length;
      if (!anyVisible) {
        filterStatus.textContent = "";
      } else {
        var parts = [];
        if (exam !== "overview") parts.push("Prova " + exam);
        if (state.query.trim()) parts.push('busca: "' + state.query.trim() + '"');
        parts.push(visN + " assunto" + (visN !== 1 ? "s" : ""));
        filterStatus.textContent = (exam === "overview" && !state.query.trim())
          ? "Mostrando todos os " + visN + " resumos"
          : parts.join("  ·  ");
      }
    }

    // --- Eventos ---
    examChips.forEach(function (ch) {
      ch.addEventListener("click", function () {
        examChips.forEach(function (c) { c.classList.remove("active"); });
        ch.classList.add("active");
        state.exam = ch.getAttribute("data-exam");
        applyFilter();
        // leva o usuário ao topo da lista reorganizada
        var anchor = document.getElementById("visao-geral");
        if (anchor) anchor.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });

    searchInput.addEventListener("input", function () {
      state.query = searchInput.value;
      searchClear.hidden = !searchInput.value;
      applyFilter();
    });
    searchClear.addEventListener("click", function () {
      searchInput.value = ""; state.query = ""; searchClear.hidden = true;
      applyFilter(); searchInput.focus();
    });

    applyFilter();
    setupScrollSpy(navMap);
  }

  function setupScrollSpy(navMap) {
    var links = Object.keys(navMap).map(function (id) { return navMap[id]; });
    var sections = Object.keys(navMap)
      .map(function (id) { return document.getElementById(id); })
      .filter(Boolean);
    if (!("IntersectionObserver" in window) || sections.length === 0) return;

    var current = null;
    var obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting && current !== e.target.id) {
          current = e.target.id;
          links.forEach(function (a) { a.classList.remove("active"); });
          if (navMap[current]) {
            navMap[current].classList.add("active");
            navMap[current].scrollIntoView({ block: "nearest", inline: "center" });
          }
        }
      });
    }, { rootMargin: "-45% 0px -50% 0px", threshold: 0 });
    sections.forEach(function (s) { obs.observe(s); });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
