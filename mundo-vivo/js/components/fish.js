// Componente Fish. Não conhece o tema — só sabe se desenhar (4
// variantes) e nadar ao longo de um path recebido de fora via SMIL
// <animateMotion> (nativo do SVG, sem custo de JS por frame).
(function (PMV) {
  'use strict';

  const { createSvgEl, ensureDefs, createLinearGradient, addSway, addBob } = PMV.Engine.SvgUtils;

  const registeredGradients = {};
  function ensureGradient(svgRoot, key, stops) {
    const id = `pmv-grad-fish-${key}`;
    if (!registeredGradients[id]) {
      createLinearGradient(ensureDefs(svgRoot), id, stops, { x1: '0%', y1: '0%', x2: '100%', y2: '0%' });
      registeredGradients[id] = true;
    }
    return `url(#${id})`;
  }

  const BODY_PATH = 'M 20 0 Q 14 -11 -2 -9 Q -14 -7 -19 -3 L -19 3 Q -14 7 -2 9 Q 14 11 20 0 Z';
  const TAIL_PATH = 'M -18 0 Q -26 -3 -35 -11 Q -29 0 -35 11 Q -26 3 -18 0 Z';
  const DORSAL_FIN_PATH = 'M -5 -8 Q 0 -18 6 -8 Z';
  const PECTORAL_FIN_PATH = 'M 3 5 Q 11 12 2 15 Q -2 9 3 5 Z';

  const SPECIES = {
    clownfish: {
      body: [[0, '#ff9a4d', 1], [1, '#e8551a', 1]],
      fin: [[0, '#fff6ec', 1], [1, '#ffe0c2', 1]],
      stripes: '#fbfbfb'
    },
    tangYellow: {
      body: [[0, '#ffe98a', 1], [1, '#ffb238', 1]],
      fin: [[0, '#ffcf5c', 1], [1, '#f2a52c', 1]]
    },
    tangBlue: {
      body: [[0, '#6fa5e8', 1], [1, '#2a4f8a', 1]],
      fin: [[0, '#3f6fb8', 1], [1, '#1f3a63', 1]],
      tailAccent: '#ffd94a'
    },
    camouflage: {
      body: [[0, '#b3a06e', 1], [1, '#7a6740', 1]],
      fin: [[0, '#8f7c50', 1], [1, '#6b5a37', 1]],
      speckle: '#5a4a2c'
    }
  };

  function buildFish(svgRoot, species) {
    const spec = SPECIES[species] || SPECIES.clownfish;
    const bodyGrad = ensureGradient(svgRoot, species + '-body', spec.body);
    const finGrad = ensureGradient(svgRoot, species + '-fin', spec.fin);

    const g = createSvgEl('g');

    const tail = createSvgEl('path', {
      d: TAIL_PATH,
      fill: spec.tailAccent || finGrad
    });
    g.appendChild(tail);

    g.appendChild(createSvgEl('path', { d: BODY_PATH, fill: bodyGrad }));

    if (spec.stripes) {
      [-6, 4].forEach((cx) => {
        g.appendChild(createSvgEl('path', {
          d: `M ${cx} -9 Q ${cx + 3} 0 ${cx} 9 Q ${cx - 3} 0 ${cx} -9 Z`,
          fill: spec.stripes, opacity: '0.92'
        }));
      });
    }

    if (spec.speckle) {
      [[8, -3], [0, -5], [-6, 2], [4, 5]].forEach(([sx, sy]) => {
        g.appendChild(createSvgEl('circle', {
          cx: sx, cy: sy, r: 1.4, fill: spec.speckle, opacity: '0.5'
        }));
      });
    }

    g.appendChild(createSvgEl('path', { d: DORSAL_FIN_PATH, fill: finGrad }));
    g.appendChild(createSvgEl('path', { d: PECTORAL_FIN_PATH, fill: finGrad }));

    g.appendChild(createSvgEl('circle', { cx: 13, cy: -1, r: 2.4, fill: '#2a1810', opacity: '0.8' }));
    g.appendChild(createSvgEl('circle', { cx: 13.7, cy: -1.8, r: 0.8, fill: '#ffffff' }));

    return g;
  }

  // opts: { species, scale, direction ('left'|'right'), pathD,
  //         duration (s p/ atravessar o path), begin (s, defasagem) }
  function create(svgRoot, opts = {}) {
    const species = opts.species || 'clownfish';
    const scale = opts.scale || 1;
    const facing = opts.direction === 'left' ? -1 : 1;

    const fishGroup = buildFish(svgRoot, species);
    fishGroup.setAttribute('transform', `scale(${scale * facing}, ${scale})`);

    const bobGroup = createSvgEl('g');
    bobGroup.appendChild(fishGroup);
    addBob(bobGroup, { amplitude: 3, dur: 2.4 + (opts.begin || 0) % 1.3, begin: -(opts.begin || 0) });

    const swayGroup = createSvgEl('g');
    swayGroup.appendChild(bobGroup);
    addSway(swayGroup, { amplitude: 4, cx: -12, dur: 1.6, begin: -(opts.begin || 0) * 0.7 });

    const motionGroup = createSvgEl('g');
    motionGroup.appendChild(swayGroup);
    motionGroup.appendChild(createSvgEl('animateMotion', {
      path: opts.pathD,
      dur: `${opts.duration || 30}s`,
      begin: `${opts.begin || 0}s`,
      repeatCount: 'indefinite'
    }));

    return {
      element: motionGroup,
      meta: { type: 'fish', species, biasType: species === 'clownfish' ? 'clownfish' : 'default' }
    };
  }

  PMV.Components = PMV.Components || {};
  PMV.Components.Fish = { create, SPECIES: Object.keys(SPECIES) };
})(window.PMV = window.PMV || {});
