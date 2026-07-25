// Composição à mão da cena do Recife (Etapa 2). Nada aqui é
// sorteado — cada organismo tem posição, escala e variante
// escolhidas a dedo, formando 3 zonas de leitura: a colônia
// principal (pico direito da duna), o par de anêmonas (encostadas
// na pedra do vale) e as moitas de alga (flanqueando, nas encostas
// mais suaves).
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

  const INSTANCES = [
    // Colônia principal — no pico direito da duna, junto da pedra
    { kind: 'coral', variant: 'fan', xf: 0.595, scale: 0.85, rotation: -3, depth: 0.15 },
    { kind: 'coral', variant: 'staghorn', xf: 0.63, scale: 1.15, rotation: -6, depth: 0.65 },
    { kind: 'coral', variant: 'staghorn', xf: 0.685, scale: 0.75, rotation: 9, depth: 0.35 },
    { kind: 'coral', variant: 'brain', xf: 0.705, scale: 0.9, rotation: 0, depth: 0.30 },
    { kind: 'algae', xf: 0.715, scale: 0.5, depth: 0.20 },

    // Par de anêmonas — encostadas na pedra do vale central
    { kind: 'anemone', xf: 0.365, scale: 1.0, depth: 0.55 },
    { kind: 'anemone', xf: 0.385, scale: 0.62, depth: 0.15 },

    // Moitas de alga — flanqueando, nas encostas mais suaves
    { kind: 'algae', xf: 0.10, scale: 0.7, depth: 0.35 },
    { kind: 'algae', xf: 0.20, scale: 1.0, depth: 0.55 },
    { kind: 'algae', xf: 0.92, scale: 0.85, depth: 0.45 }
  ];

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
    const ordered = [...INSTANCES].sort((a, b) => (a.depth || 0) - (b.depth || 0));
    return ordered
      .map((spec) => buildInstance(svgRoot, world, width, height, spec))
      .filter(Boolean);
  }

  PMV.Themes = PMV.Themes || {};
  PMV.Themes.Recife = PMV.Themes.Recife || {};
  PMV.Themes.Recife.buildReef = build;
})(window.PMV = window.PMV || {});
