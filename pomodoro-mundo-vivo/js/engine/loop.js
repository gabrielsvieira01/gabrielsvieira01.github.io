// Loop de renderização com teto de FPS, para manter baixo
// consumo de CPU (alvo do projeto: 24–30 FPS).
(function (PMV) {
  'use strict';

  function createLoop({ targetFps = 30, onFrame }) {
    const frameDuration = 1000 / targetFps;
    let rafId = null;
    let lastFrameTime = 0;
    let startTime = null;

    function tick(now) {
      rafId = requestAnimationFrame(tick);

      if (startTime === null) startTime = now;

      if (now - lastFrameTime < frameDuration) return;
      lastFrameTime = now;

      onFrame(now - startTime);
    }

    return {
      start() {
        if (rafId !== null) return;
        lastFrameTime = 0;
        startTime = null;
        rafId = requestAnimationFrame(tick);
      },
      stop() {
        if (rafId === null) return;
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    };
  }

  PMV.Engine = PMV.Engine || {};
  PMV.Engine.createLoop = createLoop;
})(window.PMV = window.PMV || {});
