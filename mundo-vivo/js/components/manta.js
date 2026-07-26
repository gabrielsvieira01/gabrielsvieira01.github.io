// Componente Manta (arraia). Não conhece o tema — silhueta grande,
// discreta, que atravessa a cena devagar. Usado só pelo evento raro.
(function (PMV) {
  'use strict';

  const { createSvgEl, ensureDefs, createLinearGradient, addBob } = PMV.Engine.SvgUtils;
  const { smoothClosedPolygonPath } = PMV.Engine.SvgShapes;

  const GRAD_ID = 'pmv-grad-manta';
  let registered = false;

  function ensureGradient(svgRoot) {
    if (registered) return;
    createLinearGradient(ensureDefs(svgRoot), GRAD_ID, [
      [0, '#5b7089', 0.92],
      [1, '#2c3a4d', 0.92]
    ]);
    registered = true;
  }

  const BODY_POINTS = [
    { x: -70, y: 0 }, { x: -22, y: -22 }, { x: 0, y: -9 },
    { x: 22, y: -22 }, { x: 70, y: 0 }, { x: 18, y: 15 },
    { x: 0, y: 6 }, { x: -18, y: 15 }
  ];

  function create(svgRoot, opts = {}) {
    ensureGradient(svgRoot);

    const g = createSvgEl('g');
    g.appendChild(createSvgEl('path', {
      d: 'M -14 4 Q -55 2 -95 0 Q -55 -2 -14 4 Z',
      fill: `url(#${GRAD_ID})`, opacity: '0.6'
    }));
    g.appendChild(createSvgEl('path', {
      d: smoothClosedPolygonPath(BODY_POINTS),
      fill: `url(#${GRAD_ID})`
    }));

    const scale = opts.scale || 1;
    const facing = opts.direction === 'left' ? -1 : 1;
    g.setAttribute('transform', `scale(${scale * facing}, ${scale})`);

    const bobGroup = createSvgEl('g');
    bobGroup.appendChild(g);
    addBob(bobGroup, { amplitude: 10, dur: 6, begin: 0 });

    const motionGroup = createSvgEl('g');
    motionGroup.appendChild(bobGroup);
    motionGroup.appendChild(createSvgEl('animateMotion', {
      path: opts.pathD,
      dur: `${opts.duration || 55}s`,
      begin: '0s',
      repeatCount: '1',
      fill: 'freeze'
    }));

    return { element: motionGroup, meta: { type: 'manta' } };
  }

  PMV.Components = PMV.Components || {};
  PMV.Components.Manta = { create };
})(window.PMV = window.PMV || {});
