/* ============================================================================
 *  Página de FILTROS (filtros.html)
 *  Escolhe ano(s) e assunto(s) e redireciona para a página do quiz,
 *  passando a seleção pelo sessionStorage.
 * ========================================================================== */
(function () {
  "use strict";

  // Bloqueia o acesso sem login.
  if (!window.Auth.requireAuth("index.html")) return;

  var FILTERS_KEY = "integradora_filters";
  var QUESTIONS = window.QUESTIONS || [];

  // --- Filtros disponíveis (derivados dos dados) ---
  var ALL_YEARS = ["2023.2", "2024.1", "2024.2", "2025.1", "2025.2"];
  var TOPIC_ORDER = [
    "Obstetrícia", "Ginecologia", "Pediatria", "Saúde Mental",
    "Hematologia", "Nefrologia", "Gastroenterologia", "Infectologia",
    "Cirurgia", "Urologia", "Pneumologia", "Neurologia", "Atenção Primária"
  ];

  // Contagem por ano e assunto
  var yearCounts = {};
  var topicCounts = {};
  QUESTIONS.forEach(function (q) {
    yearCounts[q.year] = (yearCounts[q.year] || 0) + 1;
    topicCounts[q.topic] = (topicCounts[q.topic] || 0) + 1;
  });

  // --- Estado ---
  var state = {
    selectedYears: new Set(ALL_YEARS),
    selectedTopics: new Set(Object.keys(topicCounts))
  };

  // Reaproveita uma seleção anterior, se existir.
  try {
    var saved = JSON.parse(sessionStorage.getItem(FILTERS_KEY));
    if (saved && Array.isArray(saved.years) && Array.isArray(saved.topics)) {
      state.selectedYears = new Set(saved.years);
      state.selectedTopics = new Set(saved.topics);
    }
  } catch (e) { /* ignora */ }

  // --- Utils ---
  function escapeHtml(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function applyFilters() {
    var n = 0;
    QUESTIONS.forEach(function (q) {
      if (state.selectedYears.has(q.year) && state.selectedTopics.has(q.topic)) n++;
    });
    return n;
  }

  // --- Tela de configuração ---
  function renderSetup() {
    document.getElementById("footnote").innerHTML =
      "Configure seu treino. Os filtros podem ser combinados.";

    var total = applyFilters();

    var yearPills = ALL_YEARS.map(function (year) {
      var sel = state.selectedYears.has(year);
      return '<button class="pill year-pill ' + (sel ? "selected" : "") + '" data-year="' + year + '" data-action="toggle-year">' +
        '<span class="pill-dot"></span>' +
        "<span>" + year + "</span>" +
        '<span class="pill-count">' + (yearCounts[year] || 0) + "</span>" +
        "</button>";
    }).join("");

    var topicPills = TOPIC_ORDER
      .filter(function (t) { return topicCounts[t]; })
      .map(function (topic) {
        var sel = state.selectedTopics.has(topic);
        return '<button class="pill ' + (sel ? "selected" : "") + '" data-topic="' + escapeHtml(topic) + '" data-action="toggle-topic">' +
          "<span>" + escapeHtml(topic) + "</span>" +
          '<span class="pill-count">' + topicCounts[topic] + "</span>" +
          "</button>";
      }).join("");

    document.getElementById("main").innerHTML =
      '<div class="setup">' +
      '  <div class="setup-section">' +
      '    <div class="section-head">' +
      '      <span class="section-label">Ano da prova</span>' +
      '      <div class="section-actions">' +
      '        <button class="mini-btn" data-action="all-years">Todos</button>' +
      '        <button class="mini-btn" data-action="clear-years">Limpar</button>' +
      "      </div>" +
      "    </div>" +
      '    <div class="pill-group" id="yearPills">' + yearPills + "</div>" +
      "  </div>" +
      '  <div class="setup-section">' +
      '    <div class="section-head">' +
      '      <span class="section-label">Assuntos</span>' +
      '      <div class="section-actions">' +
      '        <button class="mini-btn" data-action="all-topics">Todos</button>' +
      '        <button class="mini-btn" data-action="clear-topics">Limpar</button>' +
      "      </div>" +
      "    </div>" +
      '    <div class="pill-group" id="topicPills">' + topicPills + "</div>" +
      "  </div>" +
      '  <div class="setup-footer">' +
      '    <div class="total-counter">' +
      '      <span class="num ' + (total === 0 ? "empty" : "") + '" id="totalNum">' + total + "</span>" +
      '      <span class="label">' + (total === 1 ? "questão selecionada" : "questões selecionadas") + "</span>" +
      "    </div>" +
      '    <button class="btn btn-primary" id="startBtn" ' + (total === 0 ? "disabled" : "") + ">" +
      "      Começar treino →" +
      "    </button>" +
      "  </div>" +
      "</div>";

    document.querySelectorAll("[data-action]").forEach(function (el) {
      el.addEventListener("click", handleSetupAction);
    });
    var startBtn = document.getElementById("startBtn");
    if (startBtn) startBtn.addEventListener("click", startQuiz);
  }

  function handleSetupAction(e) {
    var action = e.currentTarget.dataset.action;
    switch (action) {
      case "toggle-year": {
        var y = e.currentTarget.dataset.year;
        if (state.selectedYears.has(y)) state.selectedYears.delete(y);
        else state.selectedYears.add(y);
        break;
      }
      case "toggle-topic": {
        var t = e.currentTarget.dataset.topic;
        if (state.selectedTopics.has(t)) state.selectedTopics.delete(t);
        else state.selectedTopics.add(t);
        break;
      }
      case "all-years": state.selectedYears = new Set(ALL_YEARS); break;
      case "clear-years": state.selectedYears = new Set(); break;
      case "all-topics": state.selectedTopics = new Set(Object.keys(topicCounts)); break;
      case "clear-topics": state.selectedTopics = new Set(); break;
      default: return;
    }
    renderSetup();
  }

  // Salva os filtros e vai para a página de resolução das questões.
  function startQuiz() {
    if (applyFilters() === 0) return;
    var payload = {
      years: Array.from(state.selectedYears),
      topics: Array.from(state.selectedTopics)
    };
    sessionStorage.setItem(FILTERS_KEY, JSON.stringify(payload));
    window.location.href = "quiz.html";
  }

  // --- Boot ---
  renderSetup();
})();
