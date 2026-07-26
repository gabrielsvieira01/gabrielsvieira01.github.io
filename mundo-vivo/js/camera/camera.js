// Sistema de câmera (Etapa 3). Não conhece tema nem componente —
// só devolve um deslocamento (x,y) suave a cada frame, combinando
// drift automático (sempre presente, dá vida mesmo sem interação)
// com parallax de mouse (sutil, só em desktop/mouse).
(function (PMV) {
  'use strict';

  function createCamera({ container, maxParallax = 14, driftAmp = 7 }) {
    let targetX = 0;
    let targetY = 0;
    let curX = 0;
    let curY = 0;

    function onPointerMove(e) {
      const rect = container.getBoundingClientRect();
      const nx = (e.clientX - rect.left) / rect.width - 0.5;
      const ny = (e.clientY - rect.top) / rect.height - 0.5;
      targetX = -nx * maxParallax;
      targetY = -ny * maxParallax * 0.6;
    }

    function onPointerLeave() {
      targetX = 0;
      targetY = 0;
    }

    container.addEventListener('mousemove', onPointerMove);
    container.addEventListener('mouseleave', onPointerLeave);

    return {
      update(elapsedMs) {
        const t = elapsedMs / 1000;
        const driftX = Math.sin(t * 0.12) * driftAmp;
        const driftY = Math.cos(t * 0.09) * driftAmp * 0.4;

        curX += (targetX - curX) * 0.04;
        curY += (targetY - curY) * 0.04;

        return { x: curX + driftX, y: curY + driftY };
      },
      destroy() {
        container.removeEventListener('mousemove', onPointerMove);
        container.removeEventListener('mouseleave', onPointerLeave);
      }
    };
  }

  PMV.Camera = PMV.Camera || {};
  PMV.Camera.createCamera = createCamera;
})(window.PMV = window.PMV || {});
