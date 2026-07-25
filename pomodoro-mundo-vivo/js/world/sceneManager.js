// Dono do canvas e do svg root. Não conhece tema nenhum —
// apenas delega init/resize/render para o tema ativo, que
// implementa a interface ThemeModule (init/onResize/render/...).
(function (PMV) {
  'use strict';

  function createSceneManager({ canvas, svg, theme, seed }) {
    const ctx = canvas.getContext('2d');
    let width = 0;
    let height = 0;

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas.clientWidth;
      height = canvas.clientHeight;

      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      svg.setAttribute('viewBox', `0 0 ${width} ${height}`);

      if (theme.onResize) theme.onResize(width, height, svg);
    }

    window.addEventListener('resize', resize);

    const loop = PMV.Engine.createLoop({
      targetFps: 30,
      onFrame(elapsedMs) {
        ctx.clearRect(0, 0, width, height);
        theme.render(ctx, svg, elapsedMs);
      }
    });

    return {
      start() {
        resize();
        theme.init(seed);
        loop.start();
      },
      stop() {
        loop.stop();
      }
    };
  }

  PMV.World = PMV.World || {};
  PMV.World.createSceneManager = createSceneManager;
})(window.PMV = window.PMV || {});
