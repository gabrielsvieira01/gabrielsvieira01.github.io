// Utilitários genéricos de desenho em Canvas.
// Não conhecem tema nenhum — reutilizáveis por qualquer cena.
(function (PMV) {
  'use strict';

  function smoothstep(t) {
    const c = Math.min(1, Math.max(0, t));
    return c * c * (3 - 2 * c);
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function hexToRgb(hex) {
    const value = hex.replace('#', '');
    const bigint = parseInt(value, 16);
    return {
      r: (bigint >> 16) & 255,
      g: (bigint >> 8) & 255,
      b: bigint & 255
    };
  }

  function lerpColor(hexA, hexB, t) {
    const a = hexToRgb(hexA);
    const b = hexToRgb(hexB);
    const r = Math.round(lerp(a.r, b.r, t));
    const g = Math.round(lerp(a.g, b.g, t));
    const bl = Math.round(lerp(a.b, b.b, t));
    return `rgb(${r}, ${g}, ${bl})`;
  }

  // Curva suave passando pelos pontos informados, usando o ponto
  // médio entre vizinhos como âncora de cada quadratic curve.
  // Poucas âncoras, resultado orgânico — o mesmo princípio de
  // composição usado nas ilustrações SVG do projeto.
  function smoothPathThrough(ctx, points) {
    if (points.length < 2) return;

    ctx.moveTo(points[0].x, points[0].y);

    for (let i = 1; i < points.length - 1; i++) {
      const midX = (points[i].x + points[i + 1].x) / 2;
      const midY = (points[i].y + points[i + 1].y) / 2;
      ctx.quadraticCurveTo(points[i].x, points[i].y, midX, midY);
    }

    const secondLast = points[points.length - 2];
    const last = points[points.length - 1];
    ctx.quadraticCurveTo(secondLast.x, secondLast.y, last.x, last.y);
  }

  // Mesma lógica de smoothPathThrough, mas devolve os segmentos de
  // bezier quadrática (p0, control, p1) em vez de desenhar — serve
  // pra depois CONSULTAR a curva real (ex.: "que Y a areia tem
  // nesse X?"), sem precisar reimplementar a matemática da curva.
  function buildSmoothSegments(points) {
    const n = points.length;
    if (n < 3) return [];

    const segments = [];
    let prevEnd = points[0];

    for (let i = 1; i < n - 1; i++) {
      const mid = {
        x: (points[i].x + points[i + 1].x) / 2,
        y: (points[i].y + points[i + 1].y) / 2
      };
      segments.push({ p0: prevEnd, control: points[i], p1: mid });
      prevEnd = mid;
    }

    segments.push({ p0: prevEnd, control: points[n - 2], p1: points[n - 1] });
    return segments;
  }

  // Dado um X qualquer, acha o segmento certo, resolve o t da
  // bezier quadrática (x(t) = targetX) e devolve o Y correspondente
  // — a posição exata da curva desenhada, não uma aproximação.
  function sampleSmoothPathY(segments, targetX) {
    for (let i = 0; i < segments.length; i++) {
      const { p0, control, p1 } = segments[i];
      const minX = Math.min(p0.x, p1.x);
      const maxX = Math.max(p0.x, p1.x);
      if (targetX < minX - 1e-6 || targetX > maxX + 1e-6) continue;

      const a = p0.x - 2 * control.x + p1.x;
      const b = 2 * (control.x - p0.x);
      const c = p0.x - targetX;

      let t;
      if (Math.abs(a) < 1e-9) {
        t = Math.abs(b) < 1e-9 ? 0 : -c / b;
      } else {
        const disc = b * b - 4 * a * c;
        if (disc < 0) continue;
        const sqrtDisc = Math.sqrt(disc);
        const t1 = (-b + sqrtDisc) / (2 * a);
        const t2 = (-b - sqrtDisc) / (2 * a);
        t = (t1 >= -1e-6 && t1 <= 1 + 1e-6) ? t1 : t2;
      }
      t = Math.max(0, Math.min(1, t));

      const u = 1 - t;
      return u * u * p0.y + 2 * u * t * control.y + t * t * p1.y;
    }

    const first = segments[0];
    const last = segments[segments.length - 1];
    return targetX < first.p0.x ? first.p0.y : last.p1.y;
  }

  // PRNG seedado (mulberry32) — sem lib externa, 100% determinístico
  // (mesma seed = mesmo resultado sempre). Serve pra EXPANDIR uma
  // composição já aprovada à mão (mais densidade, mais instâncias),
  // nunca pra substituir a direção de arte por sorteio de verdade.
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  PMV.Engine = PMV.Engine || {};
  PMV.Engine.CanvasUtils = {
    smoothstep, lerp, lerpColor, smoothPathThrough,
    buildSmoothSegments, sampleSmoothPathY, mulberry32
  };
})(window.PMV = window.PMV || {});
