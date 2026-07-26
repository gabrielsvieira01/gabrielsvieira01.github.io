// Ponto de entrada. Monta a cena (motor real) e, por cima, liga o
// harness de demonstração — a única parte deste arquivo que não
// faria parte do app final.
(function (PMV) {
  'use strict';

  const canvas = document.getElementById('scene-canvas');
  const svg = document.getElementById('scene-svg');

  const scene = PMV.World.createSceneManager({
    canvas, svg, theme: PMV.Themes.Recife.Theme, seed: Date.now()
  });
  scene.start();

  // ---- UI da vitrine (demo apenas) --------------------------------
  const clockEl = document.getElementById('demo-clock');
  const clockLabelEl = document.getElementById('demo-clock-label');
  const modeLabelEl = document.getElementById('demo-mode-label');
  const dots = Array.from(document.querySelectorAll('.demo-dot'));

  const ui = {
    update({ mode, cycle, clock, progress }) {
      clockEl.textContent = clock;
      const modeText = mode === 'pausa' ? 'Pausa' : 'Foco';
      clockLabelEl.textContent = modeText;
      modeLabelEl.textContent = modeText;

      const activeIndex = (cycle - 1) % 4;
      dots.forEach((dot, i) => dot.classList.toggle('is-active', i === activeIndex));
    }
  };

  const harness = PMV.Demo.createDemoHarness(PMV.Themes.Recife.Theme, ui);
  harness.start();
})(window.PMV = window.PMV || {});
