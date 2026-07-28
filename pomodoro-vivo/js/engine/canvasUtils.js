(function (PMV) {
  'use strict';

  PMV.Engine = PMV.Engine || {};

  var CanvasUtils = {};

  // ---- PRNG seedado (determinismo obrigatório) ----
  // Nunca usar Math.random() cru no projeto. Mesma seed -> mesmo resultado.
  CanvasUtils.mulberry32 = function (seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  CanvasUtils.lerp = function (a, b, t) {
    return a + (b - a) * t;
  };

  CanvasUtils.clamp = function (v, min, max) {
    return Math.min(max, Math.max(min, v));
  };

  // rng() -> [0,1) ; retorna float em [min, max)
  CanvasUtils.randRange = function (rng, min, max) {
    return min + rng() * (max - min);
  };

  // ---- Curva suave da duna/terreno ----
  // Os pontos autorais NÃO ficam sobre a curva desenhada: a suavização
  // (Catmull-Rom) só os usa como controle, passando pelos pontos médios
  // entre vizinhos. buildSmoothSegments precomputa os segmentos;
  // sampleSmoothPathY resolve o Y real da curva pra um X qualquer.
  // Isso corrige o bug de objetos flutuando acima ou afundando na areia.

  CanvasUtils.buildSmoothSegments = function (points) {
    var segments = [];
    for (var i = 0; i < points.length - 1; i++) {
      var p0 = points[Math.max(0, i - 1)];
      var p1 = points[i];
      var p2 = points[i + 1];
      var p3 = points[Math.min(points.length - 1, i + 2)];
      segments.push({ p0: p0, p1: p1, p2: p2, p3: p3, x0: p1.x, x1: p2.x });
    }
    return segments;
  };

  function catmullRomY(p0, p1, p2, p3, t) {
    var t2 = t * t;
    var t3 = t2 * t;
    return 0.5 * (
      (2 * p1.y) +
      (-p0.y + p2.y) * t +
      (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
      (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3
    );
  }

  CanvasUtils.sampleSmoothPathY = function (segments, x) {
    if (!segments || segments.length === 0) return 0;
    for (var i = 0; i < segments.length; i++) {
      var seg = segments[i];
      if (x >= seg.x0 && x <= seg.x1) {
        var t = (seg.x1 === seg.x0) ? 0 : (x - seg.x0) / (seg.x1 - seg.x0);
        return catmullRomY(seg.p0, seg.p1, seg.p2, seg.p3, t);
      }
    }
    if (x < segments[0].x0) return segments[0].p1.y;
    var last = segments[segments.length - 1];
    return last.p2.y;
  };

  // Traça uma polilinha amostrada ao longo da curva suave (uso: preencher
  // o terreno de areia num canvas Path2D-like).
  CanvasUtils.traceSmoothPath = function (segments, xStart, xEnd, steps) {
    var pts = [];
    var n = Math.max(2, steps | 0);
    for (var i = 0; i <= n; i++) {
      var x = CanvasUtils.lerp(xStart, xEnd, i / n);
      pts.push({ x: x, y: CanvasUtils.sampleSmoothPathY(segments, x) });
    }
    return pts;
  };

  // ---- Gradientes ----
  CanvasUtils.makeVerticalGradient = function (ctx, x0, y0, x1, y1, stops) {
    var g = ctx.createLinearGradient(x0, y0, x1, y1);
    stops.forEach(function (s) { g.addColorStop(s[0], s[1]); });
    return g;
  };

  CanvasUtils.makeRadialGradient = function (ctx, x, y, r0, r1, stops) {
    var g = ctx.createRadialGradient(x, y, r0, x, y, r1);
    stops.forEach(function (s) { g.addColorStop(s[0], s[1]); });
    return g;
  };

  PMV.Engine.CanvasUtils = CanvasUtils;
})(window.PMV = window.PMV || {});
