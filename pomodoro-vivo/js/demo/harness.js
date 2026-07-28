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

  Harness.prototype.mount = function (root) {
    var self = this;

    var panel = document.createElement('div');
    panel.className = 'pmv-demo-panel';

    var title = document.createElement('div');
    title.className = 'pmv-demo-title';
    title.textContent = 'Vitrine — Recife';
    panel.appendChild(title);

    var progressLabel = document.createElement('div');
    progressLabel.className = 'pmv-demo-progress-label';
    panel.appendChild(progressLabel);

    var barTrack = document.createElement('div');
    barTrack.className = 'pmv-demo-bar-track';
    var barFill = document.createElement('div');
    barFill.className = 'pmv-demo-bar-fill';
    barTrack.appendChild(barFill);
    panel.appendChild(barTrack);

    function refreshLabel() {
      var pct = Math.round(self.scene.progress * 100);
      progressLabel.textContent = 'Progresso acumulado: ' + pct + '%';
      barFill.style.width = Math.min(100, pct) + '%';
    }

    var completeBtn = document.createElement('button');
    completeBtn.className = 'pmv-demo-btn';
    completeBtn.textContent = 'Completar ciclo de foco';
    completeBtn.addEventListener('click', function () {
      var next = self.scene.progress + CYCLE_INCREMENT;
      self.scene.onFocusComplete(next);
      self.saveProgress(self.scene.progress);
      refreshLabel();
    });
    panel.appendChild(completeBtn);

    var resetBtn = document.createElement('button');
    resetBtn.className = 'pmv-demo-btn pmv-demo-btn-ghost';
    resetBtn.textContent = 'Zerar demo (localStorage)';
    resetBtn.addEventListener('click', function () {
      self.saveProgress(0);
      window.location.reload();
    });
    panel.appendChild(resetBtn);

    var note = document.createElement('div');
    note.className = 'pmv-demo-note';
    note.textContent = 'Cena base (Canvas) pronta. Fauna e flora aparecem assim que os componentes SVG do Gemini forem integrados.';
    panel.appendChild(note);

    root.appendChild(panel);
    refreshLabel();
  };

  PMV.Demo.Harness = Harness;
})(window.PMV = window.PMV || {});
