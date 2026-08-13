(function (PMV) {
  'use strict';

  PMV.Engine = PMV.Engine || {};

  var SVG_NS = 'http://www.w3.org/2000/svg';
  var SvgUtils = {};

  SvgUtils.NS = SVG_NS;

  SvgUtils.createEl = function (tag, attrs) {
    var el = document.createElementNS(SVG_NS, tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        el.setAttribute(k, attrs[k]);
      });
    }
    return el;
  };

  SvgUtils.createGradient = function (defs, id, type, stops, opts) {
    opts = opts || {};
    var grad;
    if (type === 'radial') {
      grad = SvgUtils.createEl('radialGradient', Object.assign({
        id: id, cx: '50%', cy: '50%', r: '50%'
      }, opts));
    } else {
      grad = SvgUtils.createEl('linearGradient', Object.assign({
        id: id, x1: '0%', y1: '0%', x2: '0%', y2: '100%'
      }, opts));
    }
    stops.forEach(function (s) {
      grad.appendChild(SvgUtils.createEl('stop', {
        offset: s.offset,
        'stop-color': s.color,
        'stop-opacity': (s.opacity === undefined ? 1 : s.opacity)
      }));
    });
    defs.appendChild(grad);
    return 'url(#' + id + ')';
  };

  // ---- Animação (CSS, não SMIL) ----
  //
  // Estas três eram <animateTransform> SMIL. SMIL invalida o SVG inteiro a
  // cada frame: com ~200 animações sobre ~1200 elementos, a cena rodava a
  // ~5fps num navegador real enquanto o canvas gastava 2,2ms. Em CSS cada
  // grupo animado é composto separadamente e o resto do SVG fica parado.
  //
  // IMPORTANTE: o alvo precisa ser um grupo cujo (0,0) local JÁ SEJA o pivô
  // do movimento, porque as regras usam transform-origin: 0 0. Quem chama
  // constrói a geometria em torno da origem e põe a posição num grupo pai.
  // (Ver .pmv-sway / .pmv-bob / .pmv-swim em css/main.css.)

  SvgUtils.addSway = function (target, opts) {
    opts = opts || {};
    target.classList.add('pmv-sway');
    target.style.setProperty('--pmv-sway-deg', String(opts.degrees === undefined ? 4 : opts.degrees));
    target.style.setProperty('--pmv-sway-dur', (opts.dur || 6) + 's');
    // Atraso negativo: a animação já começa no meio, então dois organismos
    // vizinhos nunca balançam em sincronia (o que denunciaria o componente).
    target.style.setProperty('--pmv-sway-delay', '-' + (opts.delay || 0) + 's');
    return target;
  };

  SvgUtils.addBob = function (target, opts) {
    opts = opts || {};
    target.classList.add('pmv-bob');
    target.style.setProperty('--pmv-bob-amp', String(opts.amplitude === undefined ? 6 : opts.amplitude));
    target.style.setProperty('--pmv-bob-dur', (opts.dur || 4) + 's');
    target.style.setProperty('--pmv-bob-delay', '-' + (opts.delay || 0) + 's');
    return target;
  };

  // Contrato de coordenadas com os componentes: origem (0,0) no ponto de
  // fixação/base do objeto, geometria crescendo pra y negativo.
  //
  // Posição, rotação e escala vão TODAS na propriedade CSS `transform`, na
  // ordem translate -> rotate -> scale. Isso importa: como o translate vem
  // primeiro na mesma matriz, tanto a rotação quanto a escala pivotam na
  // base do objeto. A versão anterior usava a propriedade CSS individual
  // `scale`, que compõe DEPOIS do atributo transform (matriz efetiva
  // scale(s)·translate(x,y)) - a posição era escalada junto e, com
  // scale:0, o objeto começava no canto superior esquerdo da tela e vinha
  // voando até o lugar. Nunca deu pra ver porque nenhum componente
  // renderizava ainda.
  // `grows` decide COMO a peça entra em cena (ver .pmv-appear/.pmv-growable
  // em css/main.css): false, o padrão, faz a peça aparecer no tamanho final;
  // true faz a escala acompanhar o progresso. Objeto construído não incha -
  // só a chama cresce.
  // `mirrored` espelha na horizontal. Como a origem local é o ponto em que o
  // objeto encosta no chão, a escala negativa em X pivota exatamente ali - a
  // peça vira de lado sem sair do lugar, e a mochila que estava encostada na
  // barraca pela esquerda passa a encostar pela direita.
  SvgUtils.placeAtPivot = function (group, worldX, worldY, targetScale, rotationDeg, grows, mirrored) {
    var style = group.style;
    style.setProperty('--pmv-x', worldX.toFixed(2) + 'px');
    style.setProperty('--pmv-y', worldY.toFixed(2) + 'px');
    style.setProperty('--pmv-rot', (rotationDeg || 0).toFixed(2) + 'deg');
    style.setProperty('--pmv-target-scale', String(targetScale === undefined ? 1 : targetScale));
    style.setProperty('--pmv-flip', mirrored ? '-1' : '1');
    group.classList.add(grows ? 'pmv-growable' : 'pmv-appear');
  };

  // Define QUANTO o organismo cresceu, de 0 (semente) a 1 (adulto). Chamado
  // a cada avanço de progresso: a transição CSS faz a interpolação, então
  // completar um ciclo de foco empurra o recife inteiro um pouco pra cima
  // em vez de estalar organismos prontos na tela.
  SvgUtils.setGrowth = function (group, t) {
    group.style.setProperty('--pmv-growth', String(Math.max(0, Math.min(1, t))));
  };

  PMV.Engine.SvgUtils = SvgUtils;
})(window.PMV = window.PMV || {});
