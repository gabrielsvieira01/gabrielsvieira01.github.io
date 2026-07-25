// Componente Coral. Não conhece o tema Recife — só sabe desenhar
// corais a partir de parâmetros. Cada variante expõe um
// `biasType`, metadado que a Etapa 5 (fauna) vai usar pra enviesar
// qual peixe nasce perto (ex.: coral-brain = camuflagem).
(function (PMV) {
  'use strict';

  const { createSvgEl, ensureDefs, createLinearGradient } = PMV.Engine.SvgUtils;
  const { taperedBladePath, smoothClosedPolygonPath } = PMV.Engine.SvgShapes;

  const registeredGradients = {};

  function ensureGradient(svgRoot, key, stops) {
    const id = `pmv-grad-coral-${key}`;
    if (!registeredGradients[id]) {
      createLinearGradient(ensureDefs(svgRoot), id, stops);
      registeredGradients[id] = true;
    }
    return `url(#${id})`;
  }

  function createStaghorn(svgRoot) {
    const grad = ensureGradient(svgRoot, 'staghorn', [
      [0, '#c9522f', 1],
      [1, '#ffb28a', 1]
    ]);

    const group = createSvgEl('g');
    const branches = [
      { length: 44, baseWidth: 11, lean: 5, angle: 0 },
      { length: 30, baseWidth: 7, lean: -6, angle: -24 },
      { length: 33, baseWidth: 8, lean: 6, angle: 21 }
    ];

    branches.forEach((b) => {
      const branchGroup = createSvgEl('g', { transform: `rotate(${b.angle})` });
      branchGroup.appendChild(createSvgEl('path', {
        d: taperedBladePath(b.length, b.baseWidth, b.lean),
        fill: grad
      }));
      group.appendChild(branchGroup);
    });

    return { group, meta: { type: 'coral', variant: 'staghorn', biasType: 'default' } };
  }

  function createBrain(svgRoot) {
    const grad = ensureGradient(svgRoot, 'brain', [
      [0, '#93a86a', 1],
      [1, '#5c6b45', 1]
    ]);

    const group = createSvgEl('g');
    const outline = smoothClosedPolygonPath([
      { x: -26, y: -2 }, { x: -14, y: -20 }, { x: 6, y: -24 },
      { x: 24, y: -14 }, { x: 22, y: 2 }, { x: 0, y: 6 }
    ]);
    group.appendChild(createSvgEl('path', { d: outline, fill: grad }));

    // sulcos discretos, sem preto — tom mais escuro da própria paleta
    [
      'M -16 -12 Q -6 -18 4 -14',
      'M -6 -4 Q 6 -12 16 -6'
    ].forEach((d) => {
      group.appendChild(createSvgEl('path', {
        d, fill: 'none', stroke: '#3f4a2c', 'stroke-opacity': '0.35',
        'stroke-width': '1.4', 'stroke-linecap': 'round'
      }));
    });

    return { group, meta: { type: 'coral', variant: 'brain', biasType: 'camouflage' } };
  }

  function createFan(svgRoot) {
    const grad = ensureGradient(svgRoot, 'fan', [
      [0, '#a179c9', 1],
      [1, '#5f4080', 1]
    ]);

    const group = createSvgEl('g');
    const outline = smoothClosedPolygonPath([
      { x: -30, y: 0 }, { x: -24, y: -22 }, { x: 0, y: -30 },
      { x: 24, y: -22 }, { x: 30, y: 0 }, { x: 0, y: -4 }
    ]);
    group.appendChild(createSvgEl('path', { d: outline, fill: grad }));

    [
      'M 0 -2 Q -6 -16 -20 -20',
      'M 0 -2 Q 0 -18 0 -28',
      'M 0 -2 Q 6 -16 20 -20'
    ].forEach((d) => {
      group.appendChild(createSvgEl('path', {
        d, fill: 'none', stroke: '#3c2a55', 'stroke-opacity': '0.3',
        'stroke-width': '1.2', 'stroke-linecap': 'round'
      }));
    });

    return { group, meta: { type: 'coral', variant: 'fan', biasType: 'default' } };
  }

  const BUILDERS = { staghorn: createStaghorn, brain: createBrain, fan: createFan };

  function create(svgRoot, opts = {}) {
    const builder = BUILDERS[opts.variant] || BUILDERS.staghorn;
    const { group, meta } = builder(svgRoot);

    const x = opts.x || 0;
    const y = opts.y || 0;
    const scale = opts.scale || 1;
    group.setAttribute('transform', `translate(${x}, ${y}) scale(${scale})`);

    return { element: group, meta };
  }

  PMV.Components = PMV.Components || {};
  PMV.Components.Coral = { create };
})(window.PMV = window.PMV || {});
