// Componente Algae. Não conhece o tema — moita de lâminas que
// balançam. Puramente atmosférico (sem biasType de fauna).
(function (PMV) {
  'use strict';

  const { createSvgEl, ensureDefs, createLinearGradient, addSway } = PMV.Engine.SvgUtils;
  const { taperedBladePath } = PMV.Engine.SvgShapes;

  const GRAD_ID = 'pmv-grad-algae';
  let registered = false;

  function ensureGradient(svgRoot) {
    if (registered) return;
    createLinearGradient(ensureDefs(svgRoot), GRAD_ID, [
      [0, '#1f5c3f', 1],
      [1, '#9ee6a8', 1]
    ]);
    registered = true;
  }

  // Variação hand-tuned de comprimento/ângulo/atraso — intencional,
  // não sorteada.
  const BLADES = [
    { length: 1.0, angle: -14, delay: -0.2 },
    { length: 0.78, angle: -4, delay: -1.1 },
    { length: 0.92, angle: 6, delay: -0.6 },
    { length: 0.65, angle: 15, delay: -1.6 }
  ];

  function create(svgRoot, opts = {}) {
    ensureGradient(svgRoot);

    const group = createSvgEl('g');
    const baseLength = opts.length || 30;

    BLADES.forEach((b) => {
      const spin = createSvgEl('g', { transform: `rotate(${b.angle})` });
      const sway = createSvgEl('g');
      sway.appendChild(createSvgEl('path', {
        d: taperedBladePath(baseLength * b.length, 3, 3),
        fill: `url(#${GRAD_ID})`
      }));
      addSway(sway, { amplitude: 6, dur: 3.2, begin: b.delay });
      spin.appendChild(sway);
      group.appendChild(spin);
    });

    const x = opts.x || 0;
    const y = opts.y || 0;
    const scale = opts.scale || 1;
    group.setAttribute('transform', `translate(${x}, ${y}) scale(${scale})`);

    return { element: group, meta: { type: 'algae' } };
  }

  PMV.Components = PMV.Components || {};
  PMV.Components.Algae = { create };
})(window.PMV = window.PMV || {});
