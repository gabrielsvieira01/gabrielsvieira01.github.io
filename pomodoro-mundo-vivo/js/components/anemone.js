// Componente Anemone. Não conhece o tema — só sabe se desenhar e
// balançar os tentáculos. `biasType: 'clownfish'` é o metadado que
// a Etapa 5 (fauna) vai usar pra enviesar o peixe-palhaço.
(function (PMV) {
  'use strict';

  const { createSvgEl, ensureDefs, createLinearGradient, createRadialGradient, addSway } = PMV.Engine.SvgUtils;
  const { taperedBladePath } = PMV.Engine.SvgShapes;

  const GRAD_BODY = 'pmv-grad-anemone-body';
  const GRAD_TENTACLE = 'pmv-grad-anemone-tentacle';
  let registered = false;

  function ensureGradients(svgRoot) {
    if (registered) return;
    const defs = ensureDefs(svgRoot);
    createRadialGradient(defs, GRAD_BODY, [
      [0, '#ff9dc4', 1],
      [1, '#c94a78', 1]
    ], { cx: '50%', cy: '35%', r: '65%' });
    createLinearGradient(defs, GRAD_TENTACLE, [
      [0, '#c94a78', 1],
      [1, '#ffd6e6', 1]
    ]);
    registered = true;
  }

  // Comprimentos alternados à mão — dá organicidade sem sorteio.
  const TENTACLE_LENGTHS = [0.72, 1, 0.8, 0.95, 1, 0.95, 0.8, 1, 0.72];
  const SPREAD_DEG = 190; // leque quase semicircular, voltado pra cima

  function create(svgRoot, opts = {}) {
    ensureGradients(svgRoot);

    const group = createSvgEl('g');
    const baseLength = opts.tentacleLength || 26;
    const count = TENTACLE_LENGTHS.length;
    const startAngle = -SPREAD_DEG / 2;
    const step = SPREAD_DEG / (count - 1);

    for (let i = 0; i < count; i++) {
      const angle = startAngle + step * i;
      const length = baseLength * TENTACLE_LENGTHS[i];

      const spin = createSvgEl('g', { transform: `rotate(${angle})` });
      const sway = createSvgEl('g');
      sway.appendChild(createSvgEl('path', {
        d: taperedBladePath(length, 4, 2),
        fill: `url(#${GRAD_TENTACLE})`
      }));
      addSway(sway, { amplitude: 5, dur: 3.6 + (i % 3) * 0.5, begin: -(i * 0.35) });

      spin.appendChild(sway);
      group.appendChild(spin);
    }

    group.appendChild(createSvgEl('ellipse', {
      cx: 0, cy: 0, rx: 13, ry: 8, fill: `url(#${GRAD_BODY})`
    }));

    const x = opts.x || 0;
    const y = opts.y || 0;
    const scale = opts.scale || 1;
    group.setAttribute('transform', `translate(${x}, ${y}) scale(${scale})`);

    return { element: group, meta: { type: 'anemone', biasType: 'clownfish' } };
  }

  PMV.Components = PMV.Components || {};
  PMV.Components.Anemone = { create };
})(window.PMV = window.PMV || {});
