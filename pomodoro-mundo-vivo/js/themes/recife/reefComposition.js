// Composição à mão da cena do Recife (Etapa 2). Nada aqui é
// sorteado — cada organismo tem posição, escala e variante
// escolhidas a dedo, formando 3 zonas de leitura: a colônia
// principal (pico direito da duna), o par de anêmonas (encostadas
// na pedra do vale) e as moitas de alga (flanqueando, nas encostas
// mais suaves). A ordem do array já é a ordem de desenho (z-order).
(function (PMV) {
  'use strict';

  const INSTANCES = [
    // Colônia principal — no pico direito da duna, junto da pedra
    { kind: 'coral', variant: 'fan', xf: 0.595, scale: 0.85, rotation: -3 },
    { kind: 'coral', variant: 'staghorn', xf: 0.63, scale: 1.15, rotation: -6 },
    { kind: 'coral', variant: 'staghorn', xf: 0.685, scale: 0.75, rotation: 9 },
    { kind: 'coral', variant: 'brain', xf: 0.705, scale: 0.9, rotation: 0 },
    { kind: 'algae', xf: 0.715, scale: 0.5 },

    // Par de anêmonas — encostadas na pedra do vale central
    { kind: 'anemone', xf: 0.365, scale: 1.0 },
    { kind: 'anemone', xf: 0.385, scale: 0.62 },

    // Moitas de alga — flanqueando, nas encostas mais suaves
    { kind: 'algae', xf: 0.10, scale: 0.7 },
    { kind: 'algae', xf: 0.20, scale: 1.0 },
    { kind: 'algae', xf: 0.92, scale: 0.85 }
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
    const x = spec.xf * width;
    const y = PMV.Themes.Recife.sandSurfaceYf(spec.xf) * height + height * 0.006;

    // sombra de contato discreta — grudada no chão, antes do organismo
    const shadow = PMV.Engine.SvgUtils.createSvgEl('ellipse', {
      cx: x, cy: y + 3 * spec.scale, rx: 24 * spec.scale, ry: 6 * spec.scale,
      fill: 'url(#pmv-grad-contact-shadow)'
    });
    world.appendChild(shadow);

    let built = null;
    if (spec.kind === 'coral') {
      built = PMV.Components.Coral.create(svgRoot, { variant: spec.variant, x, y, scale: spec.scale });
    } else if (spec.kind === 'anemone') {
      built = PMV.Components.Anemone.create(svgRoot, { x, y, scale: spec.scale });
    } else if (spec.kind === 'algae') {
      built = PMV.Components.Algae.create(svgRoot, { x, y, scale: spec.scale });
    }

    if (built && spec.rotation) {
      const current = built.element.getAttribute('transform');
      built.element.setAttribute('transform', `${current} rotate(${spec.rotation})`);
    }

    if (built) world.appendChild(built.element);
    return built;
  }

  // Preenche `world` (um <g> já existente e vazio) com a composição
  // inteira. Retorna a lista de organismos construídos (com meta),
  // pra Etapa 5 usar depois na hora de decidir viés de peixe.
  function build(svgRoot, world, width, height) {
    ensureShadowGradient(svgRoot);
    return INSTANCES
      .map((spec) => buildInstance(svgRoot, world, width, height, spec))
      .filter(Boolean);
  }

  PMV.Themes = PMV.Themes || {};
  PMV.Themes.Recife = PMV.Themes.Recife || {};
  PMV.Themes.Recife.buildReef = build;
})(window.PMV = window.PMV || {});
