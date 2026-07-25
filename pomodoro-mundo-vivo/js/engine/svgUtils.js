// Utilitários genéricos de SVG. Não conhecem tema nem componente
// específico — qualquer parte do projeto pode reusar.
(function (PMV) {
  'use strict';

  const SVG_NS = 'http://www.w3.org/2000/svg';

  function createSvgEl(tag, attrs = {}) {
    const el = document.createElementNS(SVG_NS, tag);
    Object.keys(attrs).forEach((key) => {
      el.setAttribute(key, attrs[key]);
    });
    return el;
  }

  function ensureDefs(svgRoot) {
    let defs = svgRoot.querySelector('defs');
    if (!defs) {
      defs = createSvgEl('defs');
      svgRoot.insertBefore(defs, svgRoot.firstChild);
    }
    return defs;
  }

  // stops: array de [offset(0-1), cor, opacidade?]
  function createLinearGradient(defs, id, stops, coords = {}) {
    if (defs.querySelector(`#${id}`)) return;
    const gradient = createSvgEl('linearGradient', {
      id,
      x1: coords.x1 || '0%',
      y1: coords.y1 || '0%',
      x2: coords.x2 || '0%',
      y2: coords.y2 || '100%'
    });
    stops.forEach(([offset, color, opacity]) => {
      gradient.appendChild(createSvgEl('stop', {
        offset: `${offset * 100}%`,
        'stop-color': color,
        'stop-opacity': opacity === undefined ? 1 : opacity
      }));
    });
    defs.appendChild(gradient);
    return gradient;
  }

  function createRadialGradient(defs, id, stops, coords = {}) {
    if (defs.querySelector(`#${id}`)) return;
    const gradient = createSvgEl('radialGradient', {
      id,
      cx: coords.cx || '50%',
      cy: coords.cy || '50%',
      r: coords.r || '50%',
      fx: coords.fx || coords.cx || '50%',
      fy: coords.fy || coords.cy || '50%'
    });
    stops.forEach(([offset, color, opacity]) => {
      gradient.appendChild(createSvgEl('stop', {
        offset: `${offset * 100}%`,
        'stop-color': color,
        'stop-opacity': opacity === undefined ? 1 : opacity
      }));
    });
    defs.appendChild(gradient);
    return gradient;
  }

  // Balanço suave (sway) em torno de (cx,cy), via SMIL nativo do
  // SVG — sem lib externa, sem custo de JS por frame. Oscila entre
  // -amplitude e +amplitude com easing (keySplines), sem "salto" no
  // loop porque começa e termina no mesmo valor. begin negativo
  // desfasa o ciclo (cada instância começa num ponto diferente).
  function addSway(target, { amplitude = 4, cx = 0, cy = 0, dur = 4, begin = 0 } = {}) {
    const anim = createSvgEl('animateTransform', {
      attributeName: 'transform',
      type: 'rotate',
      values: `${-amplitude} ${cx} ${cy}; ${amplitude} ${cx} ${cy}; ${-amplitude} ${cx} ${cy}`,
      keyTimes: '0; 0.5; 1',
      calcMode: 'spline',
      keySplines: '0.45 0 0.55 1; 0.45 0 0.55 1',
      dur: `${dur}s`,
      begin: `${begin}s`,
      repeatCount: 'indefinite'
    });
    target.appendChild(anim);
    return anim;
  }

  PMV.Engine = PMV.Engine || {};
  PMV.Engine.SvgUtils = {
    createSvgEl,
    ensureDefs,
    createLinearGradient,
    createRadialGradient,
    addSway
  };
})(window.PMV = window.PMV || {});
