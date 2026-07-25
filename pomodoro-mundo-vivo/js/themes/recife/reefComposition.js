// Composição da cena do Recife (Etapa 2). A direção de arte é toda
// à mão: a colônia principal e o par de anêmonas são instâncias
// hand-authored (posição, escala, variante escolhidas a dedo). Em
// cima dessa base aprovada, "âncoras" de cluster (também
// hand-posicionadas, com espaçamento irregular de propósito)
// expandem a densidade pro resto da largura — cada âncora usa um
// PRNG seedado (determinístico, sempre o mesmo resultado) só pra
// variar escala/rotação/variante dentro de faixas já definidas à
// mão. Isso é proceduralização EXPANDINDO uma composição aprovada,
// não substituindo direção de arte por sorteio.
//
// `depth` (0-1) dá profundidade: 0 fica rente à linha d'água (mais
// longe), 1 fica mais enterrado na areia, rumo ao primeiro plano
// (mais perto). Quem está mais perto também é desenhado maior e
// por cima — o mesmo truque de Alto's Odyssey/Monument Valley pra
// sugerir profundidade numa ilustração 2D.
(function (PMV) {
  'use strict';

  const DEPTH_RANGE_YF = 0.12;   // o quanto a profundidade empurra pra dentro da areia
  const DEPTH_SCALE_BOOST = 0.4; // até +40% de escala no fundo mais perto
  const DEPTH_FADE_BASE = 0.82;  // opacidade na profundidade 0 (mais longe)
  const DEPTH_FADE_RANGE = 0.18; // até 1.0 de opacidade na profundidade 1

  // Heróis — hand-authored, sem PRNG, ficam sempre exatamente assim.
  const HERO_INSTANCES = [
    // Colônia principal — no pico direito da duna, junto da pedra
    { kind: 'coral', variant: 'fan', xf: 0.595, scale: 0.85, rotation: -3, depth: 0.15 },
    { kind: 'coral', variant: 'staghorn', xf: 0.63, scale: 1.15, rotation: -6, depth: 0.65 },
    { kind: 'coral', variant: 'staghorn', xf: 0.685, scale: 0.75, rotation: 9, depth: 0.35 },
    { kind: 'coral', variant: 'brain', xf: 0.705, scale: 0.9, rotation: 0, depth: 0.30 },
    { kind: 'algae', xf: 0.715, scale: 0.5, depth: 0.20 },

    // Par de anêmonas — encostadas na pedra do vale central
    { kind: 'anemone', xf: 0.365, scale: 1.0, depth: 0.55 },
    { kind: 'anemone', xf: 0.385, scale: 0.62, depth: 0.15 }
  ];

  // Âncoras de cluster — espaçamento irregular de propósito (não é
  // grade uniforme). depthBias define a "camada" predominante do
  // cluster: 'back' = parede de fundo (pequena, discreta, mais
  // longe), 'front' = primeiro plano (grande, vívida, mais perto),
  // 'mixed' = um pouco dos dois, dá textura.
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

  const DEPTH_BIAS_RANGES = {
    back: [0.0, 0.32],
    mixed: [0.15, 0.65],
    front: [0.45, 0.95]
  };

  const CORAL_VARIANTS = ['staghorn', 'brain', 'fan'];

  // Gera as instâncias de uma âncora — jitter horizontal pequeno,
  // escala/rotação/variante dentro de faixas já definidas à mão.
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

      if (isAlgae) {
        instances.push({
          kind: 'algae', xf, depth, rotation,
          scale: 0.4 + rng() * 0.6
        });
      } else {
        const variant = CORAL_VARIANTS[Math.floor(rng() * CORAL_VARIANTS.length)];
        instances.push({
          kind: 'coral', variant, xf, depth, rotation,
          scale: 0.5 + rng() * 0.8
        });
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
      [0, '#000000', 0.28],
      [1, '#000000', 0]
    ]);
    shadowRegistered = true;
  }

  function buildInstance(svgRoot, world, width, height, spec) {
    const depth = spec.depth || 0;
    const scale = spec.scale * (1 + depth * DEPTH_SCALE_BOOST);

    const x = spec.xf * width;
    const yf = PMV.Themes.Recife.sandSurfaceYf(spec.xf) + depth * DEPTH_RANGE_YF;
    const y = yf * height + height * 0.006;

    // sombra de contato discreta — grudada no chão, antes do organismo
    const shadow = PMV.Engine.SvgUtils.createSvgEl('ellipse', {
      cx: x, cy: y + 3 * scale, rx: 24 * scale, ry: 6 * scale,
      fill: 'url(#pmv-grad-contact-shadow)'
    });
    world.appendChild(shadow);

    let built = null;
    if (spec.kind === 'coral') {
      built = PMV.Components.Coral.create(svgRoot, { variant: spec.variant, x, y, scale });
    } else if (spec.kind === 'anemone') {
      built = PMV.Components.Anemone.create(svgRoot, { x, y, scale });
    } else if (spec.kind === 'algae') {
      built = PMV.Components.Algae.create(svgRoot, { x, y, scale });
    }

    if (built && spec.rotation) {
      const current = built.element.getAttribute('transform');
      built.element.setAttribute('transform', `${current} rotate(${spec.rotation})`);
    }

    if (built) {
      // névoa atmosférica discreta — quem está mais longe (depth
      // baixo) fica um pouco mais translúcido, reforçando a distância.
      built.element.style.opacity = (DEPTH_FADE_BASE + depth * DEPTH_FADE_RANGE).toFixed(2);
      world.appendChild(built.element);
    }

    return built;
  }

  // Preenche `world` (um <g> já existente e vazio) com a composição
  // inteira, desenhando de trás (menor depth) pra frente (maior
  // depth) — quem está mais perto cobre quem está mais longe.
  // Retorna a lista de organismos construídos (com meta), pra
  // Etapa 5 usar depois na hora de decidir viés de peixe.
  function build(svgRoot, world, width, height) {
    ensureShadowGradient(svgRoot);
    const ordered = buildInstanceList().sort((a, b) => (a.depth || 0) - (b.depth || 0));
    return ordered
      .map((spec) => buildInstance(svgRoot, world, width, height, spec))
      .filter(Boolean);
  }

  PMV.Themes = PMV.Themes || {};
  PMV.Themes.Recife = PMV.Themes.Recife || {};
  PMV.Themes.Recife.buildReef = build;
})(window.PMV = window.PMV || {});
