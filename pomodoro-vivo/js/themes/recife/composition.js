(function (PMV) {
  'use strict';

  PMV.Themes = PMV.Themes || {};
  PMV.Themes.Recife = PMV.Themes.Recife || {};

  var CanvasUtils = PMV.Engine.CanvasUtils;

  // Âncoras de colônia desenhadas à mão (frações da largura da cena, ao
  // longo da duna). Cada âncora define ONDE um grupo de organismos vive e
  // aproximadamente QUANTOS (o PRNG seedado só varia posição/escala dentro
  // do grupo depois - nunca substitui esta direção de arte por sorteio).
  // `component` mapeia pra PMV.Components quando a arte do Gemini chegar;
  // até lá o slot fica reservado e não desenha nada.
  var COLONY_PLAN = [
    {
      id: 'coral-cluster-a',
      component: 'Coral',
      xf: 0.16, spreadf: 0.09,
      count: 4, depth: [0.55, 0.85],
      scale: [0.7, 1.15],
      threshold: [0.05, 0.35]
    },
    {
      id: 'anemone-patch-a',
      component: 'Anemone',
      xf: 0.32, spreadf: 0.05,
      count: 3, depth: [0.6, 0.9],
      scale: [0.6, 1.0],
      threshold: [0.15, 0.45],
      biasType: 'clownfish'
    },
    {
      id: 'coral-cluster-b',
      component: 'Coral',
      xf: 0.58, spreadf: 0.11,
      count: 5, depth: [0.4, 0.75],
      scale: [0.65, 1.2],
      threshold: [0.25, 0.6]
    },
    {
      id: 'algae-fringe-a',
      component: 'Algae',
      xf: 0.05, spreadf: 0.06,
      count: 6, depth: [0.7, 1.0],
      scale: [0.5, 0.9],
      threshold: [0.0, 0.2]
    },
    {
      id: 'algae-fringe-b',
      component: 'Algae',
      xf: 0.82, spreadf: 0.08,
      count: 6, depth: [0.65, 0.95],
      scale: [0.5, 0.95],
      threshold: [0.05, 0.3]
    },
    {
      id: 'anemone-patch-b',
      component: 'Anemone',
      xf: 0.78, spreadf: 0.05,
      count: 2, depth: [0.5, 0.8],
      scale: [0.7, 1.05],
      threshold: [0.4, 0.7],
      biasType: 'clownfish'
    }
  ];

  // Expande cada slot autoral em instâncias concretas via PRNG seedado -
  // jitter de posição/escala/threshold, nunca uma grade uniforme.
  function expandPlan(rng, width) {
    var instances = [];
    COLONY_PLAN.forEach(function (slot) {
      for (var i = 0; i < slot.count; i++) {
        var jitterF = (rng() - 0.5) * 2 * slot.spreadf;
        var xf = CanvasUtils.clamp(slot.xf + jitterF, 0, 1);
        instances.push({
          slotId: slot.id,
          component: slot.component,
          biasType: slot.biasType || null,
          x: xf * width,
          depth: CanvasUtils.randRange(rng, slot.depth[0], slot.depth[1]),
          scale: CanvasUtils.randRange(rng, slot.scale[0], slot.scale[1]),
          rotation: CanvasUtils.randRange(rng, -8, 8),
          threshold: CanvasUtils.randRange(rng, slot.threshold[0], slot.threshold[1])
        });
      }
    });
    // Do fundo pro primeiro plano, pra desenhar de trás pra frente (z-order).
    instances.sort(function (a, b) { return a.depth - b.depth; });
    return instances;
  }

  PMV.Themes.Recife.Composition = {
    COLONY_PLAN: COLONY_PLAN,
    expandPlan: expandPlan
  };
})(window.PMV = window.PMV || {});
