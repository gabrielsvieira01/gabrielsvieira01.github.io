// Módulo do tema Recife — único ponto de entrada que o motor
// externo (timer/pomodoro, implementado em outra sprint) usa.
// Etapa 1: só render() faz algo de verdade (a base da cena).
// Os demais hooks já existem na forma certa e ganham corpo nas
// etapas 4, 5 e 7.
(function (PMV) {
  'use strict';

  function createRecifeTheme() {
    let width = 0;
    let height = 0;

    return {
      init(seed) {
        this._seed = seed || 1;
      },

      // Não faz parte da interface ThemeModule mínima, mas é como
      // o sceneManager avisa o tema sobre o tamanho atual da tela.
      onResize(w, h) {
        width = w;
        height = h;
      },

      // Etapa 4 — Sistema de crescimento (corais, anêmonas, algas).
      onFocusComplete(growthIndex) {},

      // Etapa 5 — Fauna: na virada foco → pausa, peixes ocupam os
      // corais novos (com viés contextual pelo tipo de coral).
      onCycleTurn(mode) {},

      // Etapa 7 — Eventos raros (arraia / tubarão-baleia).
      onRareEvent() {},

      render(ctx, svgRoot, elapsedMs) {
        if (width === 0 || height === 0) return;
        PMV.Themes.Recife.drawBackground(ctx, width, height, elapsedMs);
      }
    };
  }

  PMV.Themes = PMV.Themes || {};
  PMV.Themes.Recife = PMV.Themes.Recife || {};
  PMV.Themes.Recife.Theme = createRecifeTheme();
})(window.PMV = window.PMV || {});
