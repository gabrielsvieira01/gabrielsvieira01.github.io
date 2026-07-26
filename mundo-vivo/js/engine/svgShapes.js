// Geradores de path SVG genéricos — poucas âncoras, resultado
// orgânico. Não conhecem componente nem tema; qualquer forma
// "afunilada" (galho, tentáculo, folha de alga) usa a mesma base.
(function (PMV) {
  'use strict';

  // Forma de lâmina afunilada: base larga em y=0, ponta em
  // (lean, -length). "lean" inclina a ponta pra dar leve curvatura
  // orgânica em vez de um triângulo reto.
  function taperedBladePath(length, baseWidth, lean = 0) {
    const hw = baseWidth / 2;
    const tipX = lean;
    const midX = lean * 0.45;
    return `M ${-hw} 0 Q ${-hw * 0.25 + midX} ${-length * 0.55} ${tipX} ${-length} `
         + `Q ${hw * 0.25 + midX} ${-length * 0.55} ${hw} 0 Z`;
  }

  // Polígono suave fechado: curva quadrática passando pelo ponto
  // médio de cada par de vértices vizinhos — mesmo princípio da
  // curva de areia do Canvas, só que fechada em loop.
  function smoothClosedPolygonPath(points) {
    if (points.length < 3) return '';
    const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    const n = points.length;
    const start = mid(points[n - 1], points[0]);

    let d = `M ${start.x} ${start.y} `;
    for (let i = 0; i < n; i++) {
      const cur = points[i];
      const next = points[(i + 1) % n];
      const m = mid(cur, next);
      d += `Q ${cur.x} ${cur.y} ${m.x} ${m.y} `;
    }
    d += 'Z';
    return d;
  }

  PMV.Engine = PMV.Engine || {};
  PMV.Engine.SvgShapes = { taperedBladePath, smoothClosedPolygonPath };
})(window.PMV = window.PMV || {});
