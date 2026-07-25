// Módulo do tema Recife — único ponto de entrada que o motor
// externo (timer/pomodoro, implementado em outra sprint) usa.
// Etapa 1: base da cena (Canvas). Etapa 2: biblioteca SVG (coral,
// anêmona, alga) montada aqui como composição à mão. Os demais
// hooks já existem na forma certa e ganham corpo nas etapas 4, 5 e 7.
(function (PMV) {
  'use strict';

  function createRecifeTheme() {
    let width = 0;
    let height = 0;
    let reefGroup = null;
    let reefInstances = [];

    return {
      init(seed) {
        this._seed = seed || 1;
      },

      // Não faz parte da interface ThemeModule mínima, mas é como
      // o sceneManager avisa o tema sobre o tamanho atual da tela
      // (e, agora, também entrega o svgRoot pra (re)montar o recife).
      onResize(w, h, svgRoot) {
        width = w;
        height = h;

        if (!svgRoot) return;

        if (!reefGroup) {
          reefGroup = PMV.Engine.SvgUtils.createSvgEl('g', { id: 'recife-reef' });
          svgRoot.appendChild(reefGroup);
        }
        while (reefGroup.firstChild) reefGroup.removeChild(reefGroup.firstChild);
        reefInstances = PMV.Themes.Recife.buildReef(svgRoot, reefGroup, width, height);
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

        // Coral/anêmona/alga não são redesenhados por frame (são
        // SVG retido, animando sozinhos via SMIL) — só um filtro CSS
        // barato, pra acompanhar o mesmo clima dia/noite do Canvas.
        if (reefGroup) {
          const nightFactor = PMV.Themes.Recife.computeNightFactor(new Date());
          reefGroup.style.filter =
            `brightness(${1 - nightFactor * 0.45}) saturate(${1 - nightFactor * 0.35})`;
        }
      }
    };
  }

  PMV.Themes = PMV.Themes || {};
  PMV.Themes.Recife = PMV.Themes.Recife || {};
  PMV.Themes.Recife.Theme = createRecifeTheme();
})(window.PMV = window.PMV || {});
