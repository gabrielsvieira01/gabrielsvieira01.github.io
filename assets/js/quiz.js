/* ============================================================================
 *  Página de RESOLUÇÃO DAS QUESTÕES (quiz.html)
 *  Lê os filtros salvos na página de filtros e roda o treino.
 * ========================================================================== */
(function () {
  "use strict";

  // Bloqueia o acesso sem login.
  if (!window.Auth.requireAuth("index.html")) return;

  // Token de uso único: o quiz só pode ser aberto vindo do botão "Começar
  // treino" da página de filtros. Isso evita que, ao reabrir/atualizar a aba
  // (ou ao restaurar a sessão do navegador), o site caia direto no quiz sem
  // passar pelos filtros. Reabrir o quiz volta para a página de filtros.
  var started = sessionStorage.getItem("integradora_start");
  sessionStorage.removeItem("integradora_start");
  if (!started) {
    window.location.replace("filtros.html");
    return;
  }

  var FILTERS_KEY = "integradora_filters";
  var QUESTIONS = window.QUESTIONS || [];
  var ALL_YEARS = ["2023.2", "2024.1", "2024.2", "2025.1", "2025.2"];

  // Carrega os filtros vindos da página anterior.
  var saved = null;
  try { saved = JSON.parse(sessionStorage.getItem(FILTERS_KEY)); } catch (e) { saved = null; }
  if (!saved || !Array.isArray(saved.years) || !Array.isArray(saved.topics)) {
    // Sem filtros definidos -> volta para a página de filtros.
    window.location.replace("filtros.html");
    return;
  }

  var topicCount = {};
  QUESTIONS.forEach(function (q) { topicCount[q.topic] = true; });
  var totalTopics = Object.keys(topicCount).length;

  // --- Estado ---
  var state = {
    screen: "quiz",
    selectedYears: new Set(saved.years),
    selectedTopics: new Set(saved.topics),
    filtered: [],
    order: [],
    altOrders: {},
    idx: 0,
    selected: null,
    answered: false,
    score: 0
  };

  // --- Utils ---
  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
    }
    return a;
  }
  function escapeHtml(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function toParagraphs(text) {
    if (!text) return "";
    return text.split(/\n\s*\n/).map(function (p) { return p.trim(); }).filter(Boolean)
      .map(function (p) { return "<p>" + escapeHtml(p) + "</p>"; }).join("");
  }

  function applyFilters() {
    state.filtered = [];
    QUESTIONS.forEach(function (q, i) {
      if (state.selectedYears.has(q.year) && state.selectedTopics.has(q.topic)) {
        state.filtered.push(i);
      }
    });
    return state.filtered.length;
  }

  function goToFilters() {
    window.location.href = "filtros.html";
  }

  // --- Inicia / reinicia o treino ---
  function startQuiz() {
    var total = applyFilters();
    if (total === 0) { goToFilters(); return; }

    var positions = Array.from({ length: state.filtered.length }, function (_, i) { return i; });
    state.order = shuffle(positions);
    state.altOrders = {};
    state.filtered.forEach(function (qi, pos) {
      var q = QUESTIONS[qi];
      var altIdx = Array.from({ length: q.alternativas.length }, function (_, j) { return j; });
      state.altOrders[pos] = shuffle(altIdx);
    });
    state.idx = 0;
    state.selected = null;
    state.answered = false;
    state.score = 0;
    state.screen = "quiz";

    document.getElementById("progressContainer").style.display = "";
    document.getElementById("activeFilters").style.display = "";
    document.getElementById("subtitle").style.display = "none";
    document.getElementById("progressTotal").textContent = total;
    renderActiveFilters();
    renderQuiz();
  }

  function renderActiveFilters() {
    var af = document.getElementById("activeFilters");
    var total = state.filtered.length;
    var allYears = state.selectedYears.size === ALL_YEARS.length;
    var allTopics = state.selectedTopics.size === totalTopics;

    var html = '<span class="label">Filtros:</span>';
    if (allYears && allTopics) {
      html += '<span class="chip">Todas as ' + total + " questões</span>";
    } else {
      if (!allYears) {
        var years = Array.from(state.selectedYears).sort().join(", ");
        html += '<span class="chip">Anos: ' + (years || "—") + "</span>";
      }
      if (!allTopics) {
        var topicList = Array.from(state.selectedTopics);
        var tDisp = topicList.length <= 2 ? topicList.join(", ") : topicList.length + " assuntos";
        html += '<span class="chip">' + escapeHtml(tDisp) + "</span>";
      }
      html += '<span class="chip">' + total + " questões</span>";
    }
    html += '<button class="change-btn" id="changeFiltersBtn">Mudar filtros</button>';
    af.innerHTML = html;
    document.getElementById("changeFiltersBtn").addEventListener("click", function () {
      if (state.idx > 0) {
        if (!confirm("Mudar os filtros vai reiniciar o treino. Continuar?")) return;
      }
      goToFilters();
    });
  }

  // --- Renderização das questões ---
  function renderQuiz() {
    var main = document.getElementById("main");
    document.getElementById("footnote").innerHTML =
      "Pressione <kbd>1</kbd>–<kbd>4</kbd> ou <kbd>A</kbd>–<kbd>D</kbd> para escolher <span class=\"sep\">·</span> <kbd>Enter</kbd> para confirmar/próxima";

    if (state.idx >= state.order.length) {
      renderFinished(main);
      return;
    }

    var pos = state.order[state.idx];
    var qi = state.filtered[pos];
    var q = QUESTIONS[qi];
    var altOrder = state.altOrders[pos];

    document.getElementById("progressIdx").textContent = state.idx + (state.answered ? 1 : 0);
    document.getElementById("scoreCount").textContent = state.score;
    document.getElementById("progressFill").style.width =
      ((state.idx + (state.answered ? 1 : 0)) / state.order.length * 100) + "%";

    var altsHtml = altOrder.map(function (origIdx, displayIdx) {
      var a = q.alternativas[origIdx];
      var displayLetter = String.fromCharCode(65 + displayIdx);
      var isCorrect = a.letra === q.correta;
      var isSelected = state.selected === origIdx;
      var cls = "alt";
      if (state.answered) {
        if (isCorrect) cls += " correct";
        else if (isSelected) cls += " incorrect";
        else cls += " faded";
      } else if (isSelected) {
        cls += " selected";
      }
      return '<button class="' + cls + '" data-orig="' + origIdx + '" ' + (state.answered ? "disabled" : "") + ">" +
        '<span class="alt-letter">' + displayLetter + "</span>" +
        '<span class="alt-text">' + escapeHtml(a.texto) + "</span>" +
        "</button>";
    }).join("");

    var commentaryHtml = "";
    if (state.answered) {
      var selectedAlt = q.alternativas[state.selected];
      var correctAlt = q.alternativas.find(function (a) { return a.letra === q.correta; });
      var isCorrect = selectedAlt && selectedAlt.letra === q.correta;
      var correctDisplayIdx = altOrder.findIndex(function (origIdx) { return q.alternativas[origIdx].letra === q.correta; });
      var correctDisplayLetter = String.fromCharCode(65 + correctDisplayIdx);
      var respHtml = q.resposta && q.resposta.trim()
        ? toParagraphs(q.resposta)
        : "<p>" + escapeHtml(correctAlt.texto) + "</p>";
      commentaryHtml =
        '<div class="commentary">' +
        '  <div class="commentary-head">' +
        '    <span class="commentary-title">Resposta comentada</span>' +
        '    <span class="verdict ' + (isCorrect ? "correct" : "incorrect") + '">' +
        (isCorrect ? "✓ Acertou" : "✗ Errou") + " · Gabarito: " + correctDisplayLetter +
        "    </span>" +
        "  </div>" +
        '  <div class="commentary-body">' + respHtml + "</div>" +
        "</div>";
    }

    var buttonHtml = state.answered
      ? '<button class="btn btn-primary" id="nextBtn">' + (state.idx + 1 >= state.order.length ? "Ver resultado" : "Próxima questão") + " →</button>"
      : '<button class="btn btn-primary" id="confirmBtn" ' + (state.selected === null ? "disabled" : "") + ">Confirmar resposta</button>";

    main.innerHTML =
      '<article class="card" id="card">' +
      '  <div class="card-head">' +
      '    <div class="card-head-left">' +
      '      <span class="year-badge" data-year="' + q.year + '">' +
      '        <span class="dot"></span>' +
      "        Integradora " + q.year +
      "      </span>" +
      '      <span class="topic-badge">' +
      '        <span class="dot"></span>' +
      "        " + escapeHtml(q.topic) +
      "      </span>" +
      "    </div>" +
      '    <span class="qnum">Questão <strong>' + (state.idx + 1) + "</strong>/" + state.order.length + " · Fonte Q" + q.qnum + "</span>" +
      "  </div>" +
      '  <div class="enunciado">' + toParagraphs(q.enunciado) + "</div>" +
      '  <div class="alts" id="alts">' + altsHtml + "</div>" +
      commentaryHtml +
      '  <div class="actions">' +
      '    <span class="hint">' + (state.answered ? "Pressione <kbd>Enter</kbd> para continuar" : "Use <kbd>1</kbd>–<kbd>4</kbd> ou <kbd>A</kbd>–<kbd>D</kbd> e <kbd>Enter</kbd>") + "</span>" +
      "    " + buttonHtml +
      "  </div>" +
      "</article>";

    document.querySelectorAll(".alt").forEach(function (btn) {
      btn.addEventListener("click", function () {
        if (state.answered) return;
        state.selected = parseInt(btn.dataset.orig, 10);
        renderQuiz();
      });
    });
    var cb = document.getElementById("confirmBtn");
    if (cb) cb.addEventListener("click", confirmAnswer);
    var nb = document.getElementById("nextBtn");
    if (nb) nb.addEventListener("click", nextQuestion);
  }

  function confirmAnswer() {
    if (state.selected === null) return;
    var pos = state.order[state.idx];
    var qi = state.filtered[pos];
    var q = QUESTIONS[qi];
    var sel = q.alternativas[state.selected];
    if (sel.letra === q.correta) state.score++;
    state.answered = true;
    renderQuiz();
    setTimeout(function () {
      var c = document.querySelector(".commentary");
      if (c) c.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 100);
  }

  function nextQuestion() {
    state.idx++;
    state.selected = null;
    state.answered = false;
    renderQuiz();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function renderFinished(main) {
    state.screen = "finished";
    document.getElementById("progressIdx").textContent = state.order.length;
    document.getElementById("progressFill").style.width = "100%";
    var total = state.order.length;
    var pct = total > 0 ? Math.round(state.score / total * 100) : 0;
    document.getElementById("footnote").innerHTML =
      "Bom trabalho! Você pode recomeçar com os mesmos filtros ou alterá-los.";
    main.innerHTML =
      '<div class="finished">' +
      "  <h2>Sessão <em>concluída</em></h2>" +
      '  <p class="score-line">Você completou ' + total + " " + (total === 1 ? "questão" : "questões") + " deste treino.</p>" +
      '  <div class="score-num">' + state.score + '<span style="color: var(--text-muted); font-size: 0.4em;"> / ' + total + "</span></div>" +
      '  <div class="score-pct">' + pct + "% de acertos</div>" +
      '  <div class="final-actions">' +
      '    <button class="btn" id="changeAndRestartBtn">↺ Mudar filtros</button>' +
      '    <button class="btn btn-primary" id="sameFiltersBtn">Recomeçar com mesmos filtros →</button>' +
      "  </div>" +
      "</div>";
    document.getElementById("changeAndRestartBtn").addEventListener("click", goToFilters);
    document.getElementById("sameFiltersBtn").addEventListener("click", startQuiz);
  }

  // --- Atalhos de teclado ---
  document.addEventListener("keydown", function (e) {
    if (state.screen !== "quiz") return;
    if (state.idx >= state.order.length) return;
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;

    if (e.key === "Enter") {
      e.preventDefault();
      if (state.answered) nextQuestion();
      else if (state.selected !== null) confirmAnswer();
      return;
    }
    if (state.answered) return;

    var displayIdx = -1;
    if (e.key >= "1" && e.key <= "4") displayIdx = parseInt(e.key, 10) - 1;
    else {
      var k = e.key.toUpperCase();
      if (k >= "A" && k <= "D") displayIdx = k.charCodeAt(0) - 65;
    }
    if (displayIdx >= 0) {
      e.preventDefault();
      var pos = state.order[state.idx];
      var altOrder = state.altOrders[pos];
      if (displayIdx < altOrder.length) {
        state.selected = altOrder[displayIdx];
        renderQuiz();
      }
    }
  });

  // --- Boot ---
  startQuiz();
})();
