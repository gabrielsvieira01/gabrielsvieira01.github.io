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

  PMV.Engine = PMV.Engine || {};
  PMV.Engine.CanvasUtils = { smoothstep, lerp, lerpColor, smoothPathThrough };
})(window.PMV = window.PMV || {});
