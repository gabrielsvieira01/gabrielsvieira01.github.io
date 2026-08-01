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
  // `layer` fixa em qual curva de duna (back/mid/front) a colônia se
  // fixa de verdade - antes disso não existia, tudo nascia na duna da
  // frente independente do depth "solto" que só servia pra escala/fog.
  // `growthSpan` é o quanto de progresso (0-1) leva, depois do threshold,
  // pra ir de broto a tamanho final - crescimento é gradual, não um pop.
  var COLONY_PLAN = [
    {
      id: 'coral-cluster-a',
      component: 'Coral',
      xf: 0.16, spreadf: 0.09,
      count: 4, layer: 'mid',
      scale: [0.7, 1.15],
      threshold: [0.05, 0.35],
      growthSpan: [0.30, 0.45]
    },
    {
      id: 'anemone-patch-a',
      component: 'Anemone',
      xf: 0.32, spreadf: 0.05,
      count: 3, layer: 'mid',
      scale: [0.6, 1.0],
      threshold: [0.15, 0.45],
      growthSpan: [0.20, 0.35],
      biasType: 'clownfish'
    },
    {
      id: 'coral-cluster-b',
      component: 'Coral',
      xf: 0.58, spreadf: 0.11,
      count: 5, layer: 'front',
      scale: [0.65, 1.2],
      threshold: [0.25, 0.6],
      growthSpan: [0.30, 0.45]
    },
    {
      id: 'algae-fringe-a',
      component: 'Algae',
      xf: 0.05, spreadf: 0.06,
      count: 6, layer: 'front',
      scale: [0.5, 0.9],
      threshold: [0.0, 0.2],
      growthSpan: [0.15, 0.25]
    },
    {
      id: 'algae-fringe-b',
      component: 'Algae',
      xf: 0.82, spreadf: 0.08,
      count: 6, layer: 'front',
      scale: [0.5, 0.95],
      threshold: [0.05, 0.3],
      growthSpan: [0.15, 0.25]
    },
    {
      id: 'anemone-patch-b',
      component: 'Anemone',
      xf: 0.78, spreadf: 0.05,
      count: 2, layer: 'mid',
      scale: [0.7, 1.05],
      threshold: [0.4, 0.7],
      growthSpan: [0.20, 0.35],
      biasType: 'clownfish'
    }
  ];

  // Margem de segurança (fração de refUnit) ao redor de rochedo/pedrinha -
  // maior que zero pra não ficar encostado, nem que a checagem de raio
  // da pedrinha seja exata.
  var ROCK_MARGIN_UNIT = 0.018;
  var PEBBLE_MARGIN_UNIT = 0.012;
  var MAX_PLACEMENT_TRIES = 14;
  // Jitter de depth DENTRO da camada (só pra variar z-order/escala entre
  // membros da mesma colônia) - a camada em si (fog/posição) é fixa.
  var DEPTH_JITTER_IN_LAYER = 0.05;

  // Escolhe um xf livre de rochedo/pedrinha pra este slot. Primeiro tenta
  // dentro do spread autoral (preserva a direção de arte). Se a sessão
  // tiver um rochedo largo cobrindo a região inteira (acontece - os
  // clusters de rochedo podem ocupar boa parte da largura), amplia a
  // busca progressivamente pra fora do spread até achar QUALQUER ponto
  // livre naquela camada - nunca aceita nascer em cima de obstáculo só
  // porque a vizinhança imediata está toda bloqueada.
  function findClearXf(rng, slot, width, refUnit, bg) {
    var rockMargin = ROCK_MARGIN_UNIT * refUnit;
    var pebbleMargin = PEBBLE_MARGIN_UNIT * refUnit;

    function tryXf(xf) {
      xf = CanvasUtils.clamp(xf, 0.01, 0.99);
      var worldX = xf * width;
      var worldY = bg.surfaceYf(slot.layer, worldX);
      var clear = bg.isPositionClearOfRocks(worldX, worldY, rockMargin) &&
                  bg.isPositionClearOfPebbles(slot.layer, worldX, worldY, pebbleMargin);
      return { xf: xf, worldX: worldX, worldY: worldY, clear: clear };
    }

    var best = null;
    for (var attempt = 0; attempt < MAX_PLACEMENT_TRIES; attempt++) {
      var jitterF = (rng() - 0.5) * 2 * slot.spreadf;
      var c = tryXf(slot.xf + jitterF);
      if (c.clear) return c;
      if (!best) best = c;
    }

    // Spread autoral inteiro bloqueado (ex.: pedrinha grande bem no meio)
    // - amplia a busca pra fora, alternando esquerda/direita, até achar
    // o ponto livre mais próximo. Rede de segurança - checagem 2D real já
    // deve resolver quase tudo dentro do próprio spreadf.
    for (var d = slot.spreadf; d <= 0.9; d += 0.02) {
      var left = tryXf(slot.xf - d);
      if (left.clear) return left;
      var right = tryXf(slot.xf + d);
      if (right.clear) return right;
    }

    return best;
  }

  // Expande cada slot autoral em instâncias concretas via PRNG seedado -
  // jitter de posição/escala/threshold, nunca uma grade uniforme. `bg` dá
  // acesso à curva real da camada escolhida e aos obstáculos (rochedo/
  // pedrinha) pra a posição nunca cair em cima deles.
  function expandPlan(rng, width, height, bg) {
    var refUnit = Math.min(width, height);
    var instances = [];
    COLONY_PLAN.forEach(function (slot) {
      var layerDepth = PMV.Themes.Recife.Background.LAYER_DEPTHS[slot.layer];
      for (var i = 0; i < slot.count; i++) {
        var placed = findClearXf(rng, slot, width, refUnit, bg);
        instances.push({
          slotId: slot.id,
          component: slot.component,
          biasType: slot.biasType || null,
          layer: slot.layer,
          x: placed.worldX,
          worldY: placed.worldY,
          depth: CanvasUtils.clamp(layerDepth + CanvasUtils.randRange(rng, -DEPTH_JITTER_IN_LAYER, DEPTH_JITTER_IN_LAYER), 0, 1),
          scale: CanvasUtils.randRange(rng, slot.scale[0], slot.scale[1]),
          rotation: CanvasUtils.randRange(rng, -8, 8),
          threshold: CanvasUtils.randRange(rng, slot.threshold[0], slot.threshold[1]),
          growthSpan: CanvasUtils.randRange(rng, slot.growthSpan[0], slot.growthSpan[1])
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
