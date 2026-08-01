(function (PMV) {
  'use strict';

  PMV.Demo = PMV.Demo || {};

  var STORAGE_KEY = 'pmv-demo-progress-recife';
  var CYCLE_INCREMENT = 0.12; // "um pomodoro completado" simulado

  function Harness(sceneManager) {
    this.scene = sceneManager;
  }

  Harness.prototype.loadProgress = function () {
    try {
      var raw = window.localStorage.getItem(STORAGE_KEY);
      return raw ? Math.max(0, parseFloat(raw)) : 0;
    } catch (e) {
      return 0;
    }
  };

  Harness.prototype.saveProgress = function (value) {
    try {
      window.localStorage.setItem(STORAGE_KEY, String(value));
    } catch (e) { /* localStorage indisponível - segue sem persistir */ }
  };

  // Vitrine compacta: uma pastilha no canto (não bloqueia o cenário) que
  // expande um cartão pequeno com os controles, ancorado no mesmo canto.
  Harness.prototype.mount = function (root) {
    var self = this;

    var card = document.createElement('div');
    card.className = 'pmv-demo-card';

    var closeBtn = document.createElement('button');
    closeBtn.className = 'pmv-demo-card-close';
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', 'Fechar');
    closeBtn.textContent = '\u00D7';
    card.appendChild(closeBtn);

    var progressLabel = document.createElement('div');
    progressLabel.className = 'pmv-demo-progress-label';
    card.appendChild(progressLabel);

    var barTrack = document.createElement('div');
    barTrack.className = 'pmv-demo-bar-track';
    var barFill = document.createElement('div');
    barFill.className = 'pmv-demo-bar-fill';
    barTrack.appendChild(barFill);
    card.appendChild(barTrack);

    var completeBtn = document.createElement('button');
    completeBtn.className = 'pmv-demo-btn';
    completeBtn.type = 'button';
    completeBtn.textContent = 'Completar ciclo de foco';
    card.appendChild(completeBtn);

    var resetBtn = document.createElement('button');
    resetBtn.className = 'pmv-demo-btn pmv-demo-btn-ghost';
    resetBtn.type = 'button';
    resetBtn.textContent = 'Zerar demo (nova cena)';
    card.appendChild(resetBtn);

    var timeLabel = document.createElement('div');
    timeLabel.className = 'pmv-demo-subtitle';
    timeLabel.textContent = 'Horário (prévia)';
    card.appendChild(timeLabel);

    var timeRow = document.createElement('div');
    timeRow.className = 'pmv-demo-time-row';
    var TIME_OPTIONS = [
      { label: 'Auto', hour: null },
      { label: 'Manhã', hour: 8 },
      { label: 'Meio-dia', hour: 13 },
      { label: 'Pôr do sol', hour: 19 },
      { label: 'Noite', hour: 22 }
    ];
    var timeButtons = [];
    TIME_OPTIONS.forEach(function (opt) {
      var btn = document.createElement('button');
      btn.className = 'pmv-demo-time-btn';
      btn.type = 'button';
      btn.textContent = opt.label;
      btn.addEventListener('click', function () {
        if (self.scene.theme && typeof self.scene.theme.setTimeOverrideHour === 'function') {
          self.scene.theme.setTimeOverrideHour(opt.hour);
        }
        timeButtons.forEach(function (b) { b.classList.toggle('pmv-active', b === btn); });
      });
      timeRow.appendChild(btn);
      timeButtons.push(btn);
    });
    timeButtons[0].classList.add('pmv-active'); // "Auto" começa selecionado
    card.appendChild(timeRow);

    var note = document.createElement('div');
    note.className = 'pmv-demo-note';
    note.textContent = 'Vitrine de desenvolvimento. Fauna e flora aparecem quando os componentes SVG do Gemini forem integrados.';
    card.appendChild(note);

    var pill = document.createElement('button');
    pill.className = 'pmv-demo-pill';
    pill.type = 'button';
    pill.setAttribute('aria-label', 'Abrir controles da vitrine');
    var pillDot = document.createElement('span');
    pillDot.className = 'pmv-demo-pill-dot';
    var pillPct = document.createElement('span');
    pillPct.className = 'pmv-demo-pill-pct';
    pill.appendChild(pillDot);
    pill.appendChild(pillPct);

    function refresh() {
      var pct = Math.min(100, Math.round(self.scene.progress * 100));
      progressLabel.textContent = 'Progresso acumulado: ' + pct + '%';
      barFill.style.width = pct + '%';
      pillPct.textContent = pct + '%';
    }

    function setOpen(open) {
      card.classList.toggle('pmv-open', open);
      pill.classList.toggle('pmv-active', open);
    }

    completeBtn.addEventListener('click', function () {
      self.scene.onFocusComplete(self.scene.progress + CYCLE_INCREMENT);
      self.saveProgress(self.scene.progress);
      refresh();
    });

    resetBtn.addEventListener('click', function () {
      self.saveProgress(0);
      window.location.reload();
    });

    pill.addEventListener('click', function () {
      setOpen(!card.classList.contains('pmv-open'));
    });
    closeBtn.addEventListener('click', function () { setOpen(false); });

    root.appendChild(card);
    root.appendChild(pill);
    refresh();
  };

  PMV.Demo.Harness = Harness;
})(window.PMV = window.PMV || {});
