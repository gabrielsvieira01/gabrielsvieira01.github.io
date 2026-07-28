(function (PMV) {
  'use strict';

  PMV.Themes = PMV.Themes || {};
  PMV.Themes.Recife = PMV.Themes.Recife || {};

  var CanvasUtils = PMV.Engine.CanvasUtils;

  function Background() {
    this._segments = null;
    this._particles = [];
    this._time = 0;
    this._width = 0;
    this._height = 0;
    this._rng = null;
  }

  // Pontos autorais da duna (frações de largura/altura) - à mão, NÃO são
  // a curva desenhada de verdade (ver buildSmoothSegments/sampleSmoothPathY
  // em canvasUtils.js).
  var DUNE_ANCHORS_FRAC = [
    { xf: -0.10, yf: 0.86 },
    { xf: 0.08, yf: 0.80 },
    { xf: 0.22, yf: 0.88 },
    { xf: 0.38, yf: 0.78 },
    { xf: 0.55, yf: 0.85 },
    { xf: 0.70, yf: 0.76 },
    { xf: 0.85, yf: 0.83 },
    { xf: 1.10, yf: 0.79 }
  ];

  Background.prototype.resize = function (width, height, rng) {
    this._width = width;
    this._height = height;
    this._rng = rng;

    var pts = DUNE_ANCHORS_FRAC.map(function (a) {
      return { x: a.xf * width, y: a.yf * height };
    });
    this._segments = CanvasUtils.buildSmoothSegments(pts);

    this._particles = [];
    var count = Math.round((width * height) / 26000);
    for (var i = 0; i < count; i++) {
      this._particles.push({
        x: rng() * width,
        y: rng() * height,
        r: CanvasUtils.randRange(rng, 0.6, 2.2),
        speed: CanvasUtils.randRange(rng, 4, 12),
        drift: CanvasUtils.randRange(rng, -6, 6),
        phase: rng() * Math.PI * 2,
        opacity: CanvasUtils.randRange(rng, 0.15, 0.5)
      });
    }
  };

  // Expõe o Y real da superfície da areia pra um X (espaço do mundo), pra
  // temas colocarem componentes exatamente sobre a duna.
  Background.prototype.sandSurfaceYf = function (x) {
    if (!this._segments) return this._height * 0.82;
    return CanvasUtils.sampleSmoothPathY(this._segments, x);
  };

  Background.prototype.update = function (dt) {
    this._time += dt;
    var h = this._height;
    var w = this._width;
    var rng = this._rng;
    for (var i = 0; i < this._particles.length; i++) {
      var p = this._particles[i];
      p.y -= p.speed * dt;
      p.x += Math.sin(this._time * 0.5 + p.phase) * p.drift * dt;
      if (p.y < -10) {
        p.y = h + 10;
        if (rng) p.x = rng() * w;
      }
    }
  };

  Background.prototype.draw = function (ctx, camera, width, height) {
    this._width = width;
    this._height = height;

    var waterGrad = CanvasUtils.makeVerticalGradient(ctx, 0, 0, 0, height, [
      [0, '#bdeef0'],
      [0.18, '#7fd3d6'],
      [0.42, '#3f9fb0'],
      [0.68, '#1f6a8c'],
      [1, '#0c3a5e']
    ]);
    ctx.fillStyle = waterGrad;
    ctx.fillRect(0, 0, width, height);

    this._drawGodRays(ctx, width, height, camera);
    this._drawCaustics(ctx, width, height);
    this._drawParticles(ctx);
    this._drawDune(ctx, width, height, camera);
    this._drawDepthFog(ctx, width, height);
  };

  Background.prototype._drawGodRays = function (ctx, width, height, camera) {
    ctx.save();
    var parallax = camera ? camera.parallaxFor(0.1) : { x: 0, y: 0 };
    ctx.translate(parallax.x * 0.3, 0);

    var rayCount = 5;
    var sway = Math.sin(this._time * 0.12) * 30;
    for (var i = 0; i < rayCount; i++) {
      var topX = (width / (rayCount + 1)) * (i + 1) + sway * (i % 2 === 0 ? 1 : -0.6);
      var rayWidth = width * 0.10;
      var grad = ctx.createLinearGradient(topX, 0, topX, height * 0.75);
      grad.addColorStop(0, 'rgba(255,255,255,0.16)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(topX - rayWidth * 0.15, 0);
      ctx.lineTo(topX + rayWidth * 0.15, 0);
      ctx.lineTo(topX + rayWidth * 0.9, height * 0.78);
      ctx.lineTo(topX - rayWidth * 0.9, height * 0.78);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  };

  Background.prototype._drawCaustics = function (ctx, width, height) {
    ctx.save();
    ctx.globalCompositeOperation = 'overlay';
    var bands = 4;
    for (var i = 0; i < bands; i++) {
      var yBase = height * (0.15 + i * 0.16);
      var grad = ctx.createLinearGradient(0, yBase - 18, 0, yBase + 18);
      grad.addColorStop(0, 'rgba(255,255,255,0)');
      grad.addColorStop(0.5, 'rgba(255,255,255,0.10)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(0, yBase);
      for (var x = 0; x <= width; x += 24) {
        var y = yBase + Math.sin(x * 0.02 + this._time * 0.6 + i) * 10;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(width, yBase + 40);
      ctx.lineTo(0, yBase + 40);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  };

  Background.prototype._drawParticles = function (ctx) {
    ctx.save();
    for (var i = 0; i < this._particles.length; i++) {
      var p = this._particles[i];
      ctx.beginPath();
      ctx.fillStyle = 'rgba(255,255,255,' + p.opacity + ')';
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  };

  Background.prototype._drawDune = function (ctx, width, height, camera) {
    if (!this._segments) return;
    ctx.save();
    var parallax = camera ? camera.parallaxFor(0.95) : { x: 0, y: 0 };
    ctx.translate(parallax.x, parallax.y * 0.3);

    var pts = CanvasUtils.traceSmoothPath(this._segments, -40, width + 40, 64);
    var sandGrad = CanvasUtils.makeVerticalGradient(ctx, 0, height * 0.7, 0, height, [
      [0, '#e8cf9c'],
      [0.35, '#d3b579'],
      [1, '#a3844f']
    ]);
    ctx.fillStyle = sandGrad;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.lineTo(width + 40, height + 40);
    ctx.lineTo(-40, height + 40);
    ctx.closePath();
    ctx.fill();

    var rimGrad = CanvasUtils.makeVerticalGradient(ctx, 0, pts[0].y - 6, 0, pts[0].y + 6, [
      [0, 'rgba(255,244,214,0.0)'],
      [0.5, 'rgba(255,244,214,0.35)'],
      [1, 'rgba(255,244,214,0.0)']
    ]);
    ctx.strokeStyle = rimGrad;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();

    ctx.restore();
  };

  Background.prototype._drawDepthFog = function (ctx, width, height) {
    var grad = CanvasUtils.makeVerticalGradient(ctx, 0, height * 0.55, 0, height, [
      [0, 'rgba(6,34,54,0)'],
      [1, 'rgba(4,22,38,0.35)']
    ]);
    ctx.fillStyle = grad;
    ctx.fillRect(0, height * 0.55, width, height * 0.45);
  };

  PMV.Themes.Recife.Background = Background;
})(window.PMV = window.PMV || {});
