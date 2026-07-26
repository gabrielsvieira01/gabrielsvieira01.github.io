// Módulo do tema Recife — ponto de entrada único usado pelo motor
// externo (aqui, o demo harness). Expõe a interface ThemeModule
// (init/onFocusComplete/onCycleTurn/onRareEvent/render) e por baixo
// dos panos une: fundo em Canvas, recife em SVG com crescimento de
// verdade, fauna com viés por organismo, evento raro e câmera.
(function (PMV) {
  'use strict';

  function createRecifeTheme() {
    let width = 0;
    let height = 0;
    let svgRootRef = null;
    let cameraWorld = null;
    let reefGroup = null;
    let faunaGroup = null;
    let rareGroup = null;
    let camera = null;
    let reefItems = [];
    let progress = 0;
    let cycleCount = 0;

    return {
      init(seed) {
        this._seed = seed || 1;
      },

      // Não faz parte da interface mínima, mas é como o
      // sceneManager avisa o tema do tamanho da tela + entrega o
      // svgRoot pra (re)montar o conteúdo SVG.
      onResize(w, h, svgRoot) {
        width = w;
        height = h;
        if (!svgRoot) return;
        svgRootRef = svgRoot;

        if (!cameraWorld) {
          cameraWorld = PMV.Engine.SvgUtils.createSvgEl('g', { id: 'recife-camera-world' });
          reefGroup = PMV.Engine.SvgUtils.createSvgEl('g', { id: 'recife-reef' });
          faunaGroup = PMV.Engine.SvgUtils.createSvgEl('g', { id: 'recife-fauna' });
          rareGroup = PMV.Engine.SvgUtils.createSvgEl('g', { id: 'recife-rare' });
          cameraWorld.appendChild(reefGroup);
          cameraWorld.appendChild(faunaGroup);
          cameraWorld.appendChild(rareGroup);
          svgRoot.appendChild(cameraWorld);

          camera = PMV.Camera.createCamera({ container: svgRoot.parentElement });
        }

        while (reefGroup.firstChild) reefGroup.removeChild(reefGroup.firstChild);
        reefItems = PMV.Themes.Recife.buildReef(svgRoot, reefGroup, width, height);
        PMV.Themes.Recife.applyGrowth(reefItems, progress);
      },

      // Etapa 4 — Sistema de crescimento. growthIndex é o progresso
      // do foco atual (0-1); cada organismo cresce quando o
      // progresso ultrapassa o threshold dele.
      onFocusComplete(growthIndex) {
        const clamped = Math.max(0, Math.min(1, growthIndex));
        progress = Math.max(progress, clamped); // nunca regride
        if (reefItems.length) PMV.Themes.Recife.applyGrowth(reefItems, progress);
      },

      // Etapa 5 — Fauna. Na virada foco -> pausa, peixes ocupam os
      // corais/anêmonas já plantados (viés por biasType real, não
      // sorteio cego).
      onCycleTurn(mode) {
        if (mode !== 'pausa' || !faunaGroup || !svgRootRef) return;
        cycleCount += 1;
        PMV.Themes.Recife.spawnFauna(svgRootRef, faunaGroup, reefItems, width, height, 5000 + cycleCount);
      },

      // Etapa 7 — Evento raro (arraia atravessando devagar).
      onRareEvent() {
        if (!rareGroup || !svgRootRef) return;
        PMV.Themes.Recife.spawnRareEvent(svgRootRef, rareGroup, width, height, Math.floor(Date.now() / 1000));
      },

      render(ctx, svgRoot, elapsedMs) {
        if (width === 0 || height === 0) return;

        // Fundo do Canvas fica fixo — só o mundo SVG (recife, fauna,
        // evento raro) recebe o parallax da câmera. É o par
        // fundo-parado / frente-move que realmente lê como
        // profundidade, e evita ter que redesenhar o Canvas deslocado.
        PMV.Themes.Recife.drawBackground(ctx, width, height, elapsedMs);

        if (camera && cameraWorld) {
          const cam = camera.update(elapsedMs);
          cameraWorld.setAttribute('transform', `translate(${cam.x}, ${cam.y})`);
        }

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
