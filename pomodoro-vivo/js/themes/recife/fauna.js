(function (PMV) {
  'use strict';

  PMV.Themes = PMV.Themes || {};
  PMV.Themes.Recife = PMV.Themes.Recife || {};

  var CanvasUtils = PMV.Engine.CanvasUtils;

  // Plano de espécies: populações desbloqueadas progressivamente pelo
  // threshold. O viés de biasType (ex.: peixe-palhaço perto de anêmona) é
  // resolvido contra as instâncias já plantadas da composição - nunca por
  // espalhamento uniformemente aleatório.
  var SPECIES_PLAN = [
    { id: 'clownfish-school', component: 'Fish', biasType: 'clownfish', count: 3, threshold: 0.2 },
    { id: 'open-water-shoal', component: 'Fish', biasType: null, count: 5, threshold: 0.5 }
  ];

  function pickBiasAnchor(rng, placedInstances, biasType) {
    var candidates = placedInstances.filter(function (inst) {
      return inst.biasType === biasType;
    });
    if (candidates.length === 0) return null;
    var idx = Math.floor(rng() * candidates.length);
    return candidates[idx];
  }

  function expandFauna(rng, placedInstances, width, height) {
    var fish = [];
    SPECIES_PLAN.forEach(function (species) {
      for (var i = 0; i < species.count; i++) {
        var anchor = species.biasType ? pickBiasAnchor(rng, placedInstances, species.biasType) : null;
        var baseX = anchor ? anchor.x : rng() * width;
        var baseY = anchor ? height * (1 - anchor.depth) : height * CanvasUtils.randRange(rng, 0.25, 0.6);
        fish.push({
          speciesId: species.id,
          component: species.component,
          biasType: species.biasType,
          x: baseX + CanvasUtils.randRange(rng, -60, 60),
          y: baseY + CanvasUtils.randRange(rng, -40, 40),
          depth: CanvasUtils.randRange(rng, 0.5, 0.95),
          scale: CanvasUtils.randRange(rng, 0.6, 1.0),
          threshold: CanvasUtils.clamp(species.threshold + CanvasUtils.randRange(rng, -0.05, 0.05), 0, 1),
          swimSeed: rng()
        });
      }
    });
    return fish;
  }

  PMV.Themes.Recife.Fauna = {
    SPECIES_PLAN: SPECIES_PLAN,
    expandFauna: expandFauna
  };
})(window.PMV = window.PMV || {});
