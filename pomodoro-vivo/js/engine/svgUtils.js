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

  // Balanço rotacional oscilante em torno de um pivô (coral, algas...).
  // additive:'sum' pra poder compor com outras animações no mesmo alvo.
  SvgUtils.addSway = function (target, opts) {
    opts = opts || {};
    var pivotX = opts.pivotX || 0;
    var pivotY = opts.pivotY || 0;
    var degrees = opts.degrees === undefined ? 4 : opts.degrees;
    var dur = opts.dur || '6s';
    var begin = opts.begin || '0s';
    var anim = SvgUtils.createEl('animateTransform', {
      attributeName: 'transform',
      type: 'rotate',
      values: (-degrees) + ' ' + pivotX + ' ' + pivotY + ';' +
              degrees + ' ' + pivotX + ' ' + pivotY + ';' +
              (-degrees) + ' ' + pivotX + ' ' + pivotY,
      keyTimes: '0;0.5;1',
      dur: dur,
      begin: begin,
      repeatCount: 'indefinite',
      calcMode: 'spline',
      keySplines: '0.45 0 0.55 1;0.45 0 0.55 1',
      additive: 'sum'
    });
    target.appendChild(anim);
    return anim;
  };

  // Translação vertical oscilante (peixe boiando, alga ondulando).
  SvgUtils.addBob = function (target, opts) {
    opts = opts || {};
    var amplitude = opts.amplitude === undefined ? 6 : opts.amplitude;
    var dur = opts.dur || '4s';
    var begin = opts.begin || '0s';
    var anim = SvgUtils.createEl('animateTransform', {
      attributeName: 'transform',
      type: 'translate',
      values: '0 0;0 ' + (-amplitude) + ';0 0;0 ' + amplitude + ';0 0',
      keyTimes: '0;0.25;0.5;0.75;1',
      dur: dur,
      begin: begin,
      repeatCount: 'indefinite',
      calcMode: 'spline',
      keySplines: '0.45 0 0.55 1;0.45 0 0.55 1;0.45 0 0.55 1;0.45 0 0.55 1',
      additive: 'sum'
    });
    target.appendChild(anim);
    return anim;
  };

  // Contrato de coordenadas com os componentes (Gemini): origem (0,0) no
  // ponto de fixação/base do objeto. placeAtPivot só faz translate até a
  // posição no mundo - o pivô de escala fica sempre em (0,0) local via CSS
  // (.pmv-growable), então crescer nunca puxa o objeto pro canto da tela.
  SvgUtils.placeAtPivot = function (group, worldX, worldY, targetScale) {
    group.setAttribute('transform',
      'translate(' + worldX.toFixed(2) + ' ' + worldY.toFixed(2) + ')');
    group.style.setProperty('--pmv-target-scale', String(targetScale === undefined ? 1 : targetScale));
    group.classList.add('pmv-growable');
  };

  // Dispara a transição de crescimento (chamar quando o progresso cruza o threshold).
  SvgUtils.growNow = function (group) {
    if (group.classList.contains('pmv-grow')) return;
    group.classList.add('pmv-grow');
  };

  PMV.Engine.SvgUtils = SvgUtils;
})(window.PMV = window.PMV || {});
