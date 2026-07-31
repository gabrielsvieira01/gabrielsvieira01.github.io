(function (PMV) {
  'use strict';

  PMV.Components = PMV.Components || {};

  var SvgUtils = PMV.Engine.SvgUtils;
  var CanvasUtils = PMV.Engine.CanvasUtils;
  var NS = SvgUtils.NS;

  // Direção de arte aprovada à mão (SVG do usuário, validado visualmente).
  // Coordenadas já respeitam o contrato: origem (0,0) na base, cresce em Y
  // negativo. Convertido pra userSpaceOnUse com viewBox -45,-75,90,80 ->
  // os stops de gradiente abaixo usam a MESMA geometria y1=5,y2=-75.
  //
  // 3 camadas de profundidade (fundo/principal/frente), cada uma um path
  // único e contínuo (silhueta), não galhos-tubo independentes - é essa
  // técnica (poucas curvas longas, não muitas formas empilhadas com
  // transform) que se provou robusta visualmente. PRNG seedado só EXPANDE
  // essa arte aprovada (rotação leve, espelho, matiz) - nunca substitui a
  // estrutura por sorteio.

  var LAYERS = [
    {
      key: 'back',
      stops: [[0, '#7a2412'], [0.35, '#ad3c1a'], [0.70, '#e5713b'], [1, '#f5a776']],
      d: 'M -3,0 C -6,-7 -14,-13 -22,-16 C -29,-18 -36,-17 -39,-21 C -41,-25 -36,-27 -30,-24 ' +
         'C -23,-21 -17,-20 -20,-28 C -23,-34 -27,-40 -24,-44 C -21,-47 -17,-42 -15,-35 ' +
         'C -12,-26 -8,-17 -5,-11 C -4,-22 1,-38 5,-52 C 7,-59 1,-64 -3,-60 C -6,-56 -6,-50 -5,-44 ' +
         'C -4,-36 -3,-26 -1,-17 C 3,-20 12,-26 21,-29 C 28,-32 35,-30 38,-34 C 41,-38 35,-41 30,-37 ' +
         'C 23,-32 16,-30 18,-22 C 20,-17 26,-14 33,-13 C 39,-12 38,-6 31,-7 C 21,-8 10,-5 3,0 Z'
    },
    {
      key: 'main',
      stops: [[0, '#a8401f'], [0.30, '#ce4a21'], [0.65, '#f27438'], [0.88, '#ffa670'], [1, '#ffcda3']],
      d: 'M -4,0 C -4,-8 -7,-15 -13,-22 C -18,-27 -25,-29 -31,-33 C -36,-36 -38,-41 -33,-43 ' +
         'C -29,-44 -25,-39 -21,-35 C -18,-32 -16,-30 -18,-37 C -20,-44 -25,-51 -27,-56 ' +
         'C -29,-61 -23,-63 -20,-58 C -16,-51 -13,-43 -11,-35 C -9,-29 -8,-26 -8,-34 ' +
         'C -8,-43 -12,-51 -17,-59 C -20,-64 -23,-67 -20,-70 C -17,-72 -13,-68 -11,-63 ' +
         'C -8,-56 -6,-49 -6,-57 C -6,-64 -8,-69 -5,-72 C -2,-74 2,-71 1,-65 C -1,-57 -2,-47 -3,-39 ' +
         'C -3,-31 -2,-27 3,-31 C 8,-35 15,-41 21,-47 C 25,-52 28,-56 25,-60 C 22,-63 18,-58 16,-53 ' +
         'C 13,-46 10,-40 7,-34 C 5,-29 7,-28 14,-31 C 21,-34 27,-34 31,-39 C 35,-43 38,-39 34,-35 ' +
         'C 28,-30 19,-28 12,-24 C 6,-21 3,-16 3,-9 C 3,-4 2,-1 4,0 Z'
    },
    {
      key: 'front',
      stops: [[0, '#b83f1c'], [0.35, '#e25625'], [0.70, '#ff874a'], [1, '#ffd5b3']],
      d: 'M -2,0 C -5,-4 -12,-7 -19,-10 C -26,-13 -31,-11 -35,-16 C -37,-19 -33,-22 -28,-19 ' +
         'C -21,-16 -14,-13 -8,-9 C -4,-6 -2,-3 0,0 Z ' +
         'M 0,0 C 4,-4 9,-7 15,-9 C 18,-13 20,-19 22,-26 C 24,-31 28,-30 26,-24 ' +
         'C 23,-17 20,-12 23,-11 C 27,-11 31,-16 35,-24 C 38,-29 42,-27 39,-22 ' +
         'C 34,-16 29,-11 33,-10 C 37,-10 41,-12 43,-16 C 45,-20 42,-22 38,-19 ' +
         'C 31,-15 22,-10 14,-7 C 8,-5 3,-2 1,0 Z'
    }
  ];

  var SHADOW_D_CX = 0, SHADOW_D_CY = 1, SHADOW_RX = 9, SHADOW_RY = 2;

  function el(tag, attrs) {
    var e = document.createElementNS(NS, tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    }
    return e;
  }

  function buildGradient(uid, layer) {
    var grad = el('linearGradient', {
      id: 'pmv-coral-' + layer.key + '-' + uid,
      x1: 0, y1: 5, x2: 0, y2: -75,
      gradientUnits: 'userSpaceOnUse'
    });
    layer.stops.forEach(function (s) {
      grad.appendChild(el('stop', { offset: (s[0] * 100) + '%', 'stop-color': s[1] }));
    });
    return grad;
  }

  // Componente genérico - não conhece o tema. opts.seed garante variação
  // determinística por instância (mesma seed = mesmo resultado sempre).
  var Coral = {
    create: function (svgRoot, opts) {
      opts = opts || {};
      var rng = CanvasUtils.mulberry32(opts.seed || 1);
      var uid = Math.floor(rng() * 1e9).toString(36);

      var group = el('g', { 'data-pmv-component': 'coral' });

      var defs = el('defs');
      LAYERS.forEach(function (layer) {
        defs.appendChild(buildGradient(uid, layer));
      });
      var shadowGrad = el('radialGradient', {
        id: 'pmv-coral-shadow-' + uid,
        cx: SHADOW_D_CX, cy: SHADOW_D_CY, r: 10,
        gradientUnits: 'userSpaceOnUse'
      });
      shadowGrad.appendChild(el('stop', { offset: '0%', 'stop-color': '#5c190a', 'stop-opacity': 0.35 }));
      shadowGrad.appendChild(el('stop', { offset: '100%', 'stop-color': '#5c190a', 'stop-opacity': 0 }));
      defs.appendChild(shadowGrad);
      group.appendChild(defs);

      // Grupo interno recebe o espelho/leve rotação - mantém o pivô de
      // crescimento (placeAtPivot, aplicado no grupo externo) em (0,0) puro.
      var inner = el('g');
      var mirror = rng() < 0.5 ? -1 : 1;
      var skew = CanvasUtils.randRange(rng, -6, 6);
      inner.setAttribute('transform', 'scale(' + mirror + ',1) rotate(' + skew.toFixed(2) + ')');

      inner.appendChild(el('ellipse', {
        cx: SHADOW_D_CX, cy: SHADOW_D_CY, rx: SHADOW_RX, ry: SHADOW_RY,
        fill: 'url(#pmv-coral-shadow-' + uid + ')'
      }));
      LAYERS.forEach(function (layer) {
        inner.appendChild(el('path', { d: layer.d, fill: 'url(#pmv-coral-' + layer.key + '-' + uid + ')' }));
      });
      group.appendChild(inner);

      // Variação sutil de matiz por instância - expande a paleta aprovada
      // sem reescrever gradientes (nunca deixa a luminância cair perto de
      // preto: hueRotate/saturate não escurecem os stops já claros).
      var hue = CanvasUtils.randRange(rng, -14, 14);
      var sat = CanvasUtils.randRange(rng, 0.92, 1.12);
      group.style.filter = 'hue-rotate(' + hue.toFixed(1) + 'deg) saturate(' + sat.toFixed(2) + ')';

      // Balanço leve - coral é rígido, então grau baixo e período longo.
      SvgUtils.addSway(inner, {
        pivotX: 0, pivotY: 0,
        degrees: CanvasUtils.randRange(rng, 1.2, 2.4),
        dur: CanvasUtils.randRange(rng, 7, 11).toFixed(1) + 's',
        begin: CanvasUtils.randRange(rng, 0, 4).toFixed(1) + 's'
      });

      svgRoot.appendChild(group);

      return { group: group, meta: { type: 'coral' } };
    }
  };

  PMV.Components.Coral = Coral;
})(window.PMV = window.PMV || {});
