// Composição da cena do Recife. Direção de arte à mão: a colônia
// principal e o par de anêmonas são heróis hand-authored. Âncoras
// de cluster (também hand-posicionadas, espaçamento irregular)
// expandem a densidade com um PRNG seedado — só EXPANDE uma
// composição aprovada, nunca substitui direção de arte por sorteio.
//
// Cada instância nasce pequena (invisível) e CRESCE de verdade
// quando o progresso do foco atinge seu `threshold` (0-1) — nada
// aparece instantaneamente. O crescimento pivota em torno do
// próprio ponto de fixação na areia (não do canto da tela).
(function (PMV) {
  'use strict';

  const DEPTH_RANGE_YF = 0.12;
  const DEPTH_SCALE_BOOST = 0.4;
  const DEPTH_FADE_BASE = 0.82;
  const DEPTH_FADE_RANGE = 0.18;

  const HERO_INSTANCES = [
    { kind: 'coral', variant: 'fan', xf: 0.595, scale: 0.85, rotation: -3, depth: 0.15, threshold: 0.08 },
    { kind: 'coral', variant: 'staghorn', xf: 0.63, scale: 1.15, rotation: -6, depth: 0.65, threshold: 0.18 },
    { kind: 'coral', variant: 'staghorn', xf: 0.685, scale: 0.75, rotation: 9, depth: 0.35, threshold: 0.30 },
    { kind: 'coral', variant: 'brain', xf: 0.705, scale: 0.9, rotation: 0, depth: 0.30, threshold: 0.22 },
    { kind: 'algae', xf: 0.715, scale: 0.5, depth: 0.20, threshold: 0.12 },
    { kind: 'anemone', xf: 0.365, scale: 1.0, depth: 0.55, threshold: 0.14 },
    { kind: 'anemone', xf: 0.385, scale: 0.62, depth: 0.15, threshold: 0.35 }
  ];

  const CLUSTER_ANCHORS = [
    { xf: 0.03, count: 2, depthBias: 'back', seed: 101 },
    { xf: 0.095, count: 3, depthBias: 'mixed', seed: 102 },
    { xf: 0.145, count: 2, depthBias: 'back', seed: 117 },
    { xf: 0.20, count: 4, depthBias: 'front', seed: 103 },
    { xf: 0.255, count: 3, depthBias: 'back', seed: 111 },
    { xf: 0.305, count: 3, depthBias: 'mixed', seed: 104 },
    { xf: 0.44, count: 4, depthBias: 'mixed', seed: 105 },
    { xf: 0.505, count: 4, depthBias: 'back', seed: 106 },
    { xf: 0.555, count: 2, depthBias: 'front', seed: 118 },
    { xf: 0.775, count: 3, depthBias: 'mixed', seed: 107 },
    { xf: 0.83, count: 4, depthBias: 'front', seed: 108 },
    { xf: 0.885, count: 3, depthBias: 'mixed', seed: 109 },
    { xf: 0.945, count: 3, depthBias: 'back', seed: 110 },
    { xf: 0.985, count: 2, depthBias: 'back', seed: 119 }
  ];

  const DEPTH_BIAS_RANGES = { back: [0.0, 0.32], mixed: [0.15, 0.65], front: [0.45, 0.95] };
  const CORAL_VARIANTS = ['staghorn', 'brain', 'fan'];

  function generateClusterInstances(anchor) {
    const rng = PMV.Engine.CanvasUtils.mulberry32(anchor.seed);
    const [depthMin, depthMax] = DEPTH_BIAS_RANGES[anchor.depthBias];
    const instances = [];

    for (let i = 0; i < anchor.count; i++) {
      const isAlgae = rng() < 0.28;
      const dx = (rng() - 0.5) * 0.07;
      const xf = Math.max(0.01, Math.min(0.99, anchor.xf + dx));
      const depth = depthMin + rng() * (depthMax - depthMin);
      const rotation = Math.round((rng() - 0.5) * 32);
      const threshold = rng();

      if (isAlgae) {
        instances.push({ kind: 'algae', xf, depth, rotation, threshold, scale: 0.4 + rng() * 0.6 });
      } else {
        const variant = CORAL_VARIANTS[Math.floor(rng() * CORAL_VARIANTS.length)];
        instances.push({ kind: 'coral', variant, xf, depth, rotation, threshold, scale: 0.5 + rng() * 0.8 });
      }
    }
    return instances;
  }

  function buildInstanceList() {
    const generated = CLUSTER_ANCHORS.flatMap(generateClusterInstances);
    return [...HERO_INSTANCES, ...generated];
  }

  let shadowRegistered = false;
  function ensureShadowGradient(svgRoot) {
    if (shadowRegistered) return;
    const defs = PMV.Engine.SvgUtils.ensureDefs(svgRoot);
    PMV.Engine.SvgUtils.createRadialGradient(defs, 'pmv-grad-contact-shadow', [
      [0, '#000000', 0.28], [1, '#000000', 0]
    ]);
    shadowRegistered = true;
  }

  function buildInstance(svgRoot, world, width, height, spec) {
    const depth = spec.depth || 0;
    const scale = spec.scale * (1 + depth * DEPTH_SCALE_BOOST);

    const x = spec.xf * width;
    const yf = PMV.Themes.Recife.sandSurfaceYf(spec.xf) + depth * DEPTH_RANGE_YF;
    const y = yf * height + height * 0.006;

    const instanceGroup = PMV.Engine.SvgUtils.createSvgEl('g');

    const shadow = PMV.Engine.SvgUtils.createSvgEl('ellipse', {
      cx: x, cy: y + 3 * scale, rx: 24 * scale, ry: 6 * scale,
      fill: 'url(#pmv-grad-contact-shadow)'
    });
    instanceGroup.appendChild(shadow);

    let built = null;
    if (spec.kind === 'coral') {
      built = PMV.Components.Coral.create(svgRoot, { variant: spec.variant, x, y, scale });
    } else if (spec.kind === 'anemone') {
      built = PMV.Components.Anemone.create(svgRoot, { x, y, scale });
    } else if (spec.kind === 'algae') {
      built = PMV.Components.Algae.create(svgRoot, { x, y, scale });
    }
    if (!built) return null;

    if (spec.rotation) {
      const current = built.element.getAttribute('transform');
      built.element.setAttribute('transform', `${current} rotate(${spec.rotation})`);
    }
    instanceGroup.appendChild(built.element);

    // Wrapper de crescimento — pivota em (x,y), o próprio ponto de
    // fixação na areia, não o canto da tela. Começa "não nascido".
    const growthWrapper = PMV.Engine.SvgUtils.createSvgEl('g', { class: 'pmv-grow' });
    growthWrapper.appendChild(instanceGroup);
    world.appendChild(growthWrapper);

    const targetOpacity = DEPTH_FADE_BASE + depth * DEPTH_FADE_RANGE;
    growthWrapper.style.transform = `translate(${x}px, ${y}px) scale(0.05) translate(${-x}px, ${-y}px)`;
    growthWrapper.style.opacity = '0';

    return {
      element: growthWrapper,
      meta: built.meta,
      threshold: spec.threshold || 0,
      targetOpacity,
      pivotX: x,
      pivotY: y
    };
  }

  // Preenche `world` (um <g> já existente e vazio) com a composição
  // inteira, desenhando de trás (menor depth) pra frente (maior
  // depth). Retorna a lista de itens (com meta + dados de
  // crescimento), pra fauna e o motor de progresso usarem depois.
  function build(svgRoot, world, width, height) {
    ensureShadowGradient(svgRoot);
    const ordered = buildInstanceList().sort((a, b) => (a.depth || 0) - (b.depth || 0));
    return ordered
      .map((spec) => buildInstance(svgRoot, world, width, height, spec))
      .filter(Boolean);
  }

  // Aplica o progresso do foco (0-1) à lista retornada por build():
  // quem já passou do threshold cresce (CSS transition cuida da
  // suavidade); quem não passou continua um broto invisível.
  function applyGrowth(items, progress) {
    items.forEach((item) => {
      const grown = progress >= item.threshold;
      const s = grown ? 1 : 0.05;
      const op = grown ? item.targetOpacity : 0;
      item.element.style.transform =
        `translate(${item.pivotX}px, ${item.pivotY}px) scale(${s}) translate(${-item.pivotX}px, ${-item.pivotY}px)`;
      item.element.style.opacity = String(op);
    });
  }

  PMV.Themes = PMV.Themes || {};
  PMV.Themes.Recife = PMV.Themes.Recife || {};
  PMV.Themes.Recife.buildReef = build;
  PMV.Themes.Recife.applyGrowth = applyGrowth;
})(window.PMV = window.PMV || {});
