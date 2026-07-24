// Ponto de entrada. Só monta a cena — nenhuma lógica de tema mora
// aqui, e nenhum motor de pomodoro é iniciado (fora de escopo
// desta fase).
(function (PMV) {
  'use strict';

  const canvas = document.getElementById('scene-canvas');
  const svg = document.getElementById('scene-svg');

  const scene = PMV.World.createSceneManager({
    canvas,
    svg,
    theme: PMV.Themes.Recife.Theme,
    seed: Date.now()
  });

  scene.start();
})(window.PMV = window.PMV || {});
