(function (PMV) {
  'use strict';

  PMV.Themes = PMV.Themes || {};
  PMV.Themes.Recife = PMV.Themes.Recife || {};

  var CanvasUtils = PMV.Engine.CanvasUtils;

  function Background() {
    this._layout = null;        // gerado 1x por sessão (ver _generateLayout)
    this._duneSegments = null;  // {back, mid, front} -> segmentos da curva suave
    this._rockPolys = null;
    this._pebblesPx = null;
    this._particles = [];
    this._time = 0;
    this._width = 0;
    this._height = 0;
    this._rng = null;
  }

  // ---- Envelopes autorais (direção de arte) ----
  // O PRNG seedado só escolhe valores DENTRO destas faixas - nunca substitui
  // a direção (bandas de altura, contagem de âncoras, paletas por camada).
  var DUNE_LAYER_DEFS = {
    back: {
      depth: 0.20,
      yBandF: [0.58, 0.68],
      anchorCountRange: [5, 7],
      xJitterF: 0.035,
      colorStops: [[0, '#6f9aab'], [0.4, '#588396'], [1, '#3f6577']],
      rimColor: 'rgba(220,240,245,0.18)'
    },
    mid: {
      depth: 0.55,
      yBandF: [0.70, 0.80],
      anchorCountRange: [6, 8],
      xJitterF: 0.04,
      colorStops: [[0, '#c3ac81'], [0.4, '#ac9367'], [1, '#8a7350']],
      rimColor: 'rgba(255,244,214,0.22)'
    },
    front: {
      depth: 0.95,
      yBandF: [0.80, 0.92],
      anchorCountRange: [6, 9],
      xJitterF: 0.045,
      colorStops: [[0, '#e8cf9c'], [0.35, '#d3b579'], [1, '#a3844f']],
      rimColor: 'rgba(255,244,214,0.35)'
    }
  };

  var ROCK_WALL_DEF = {
    countRange: [3, 6],
    xRange: [-0.05, 1.05],
    widthFracRange: [0.09, 0.20],
    heightFracRange: [0.16, 0.30],
    jaggedPointsRange: [6, 10],
    baseYBandF: [0.56, 0.66] // nasce perto/atrás da crista da duna de fundo
  };

  var PEBBLE_DEF = {
    countRange: [16, 26],
    sizeFracRange: [0.006, 0.016],
    colorVariants: [
      { top: '#d8c193', bottom: '#8f7248' },
      { top: '#aab3b8', bottom: '#5f686d' },
      { top: '#8f8070', bottom: '#463d33' }
    ]
  };

  // ---- Geração (consome rng - roda 1x por sessão) ----
  function generateDuneAnchors(rng, def) {
    var count = Math.round(CanvasUtils.randRange(rng, def.anchorCountRange[0], def.anchorCountRange[1]));
    var anchors = [];
    var xStart = -0.15, xSpan = 1.30;
    for (var i = 0; i < count; i++) {
      var baseXf = xStart + (xSpan * i) / (count - 1);
      var jitterXf = CanvasUtils.randRange(rng, -def.xJitterF, def.xJitterF);
      var yf = CanvasUtils.randRange(rng, def.yBandF[0], def.yBandF[1]);
      anchors.push({ xf: baseXf + jitterXf, yf: yf });
    }
    anchors.sort(function (a, b) { return a.xf - b.xf; });
    return anchors;
  }

  function generateRockWalls(rng) {
    var count = Math.round(CanvasUtils.randRange(rng, ROCK_WALL_DEF.countRange[0], ROCK_WALL_DEF.countRange[1]));
    var walls = [];
    for (var i = 0; i < count; i++) {
      var jaggedCount = Math.round(CanvasUtils.randRange(rng, ROCK_WALL_DEF.jaggedPointsRange[0], ROCK_WALL_DEF.jaggedPointsRange[1]));
      var topProfile = [];
      for (var j = 0; j <= jaggedCount; j++) {
        var u = j / jaggedCount;
        var envelope = Math.sin(u * Math.PI); // 0 nas bordas, 1 no meio - silhueta de rocha
        var jag = CanvasUtils.randRange(rng, 0.5, 1.0);
        topProfile.push({ u: u, v: envelope * jag });
      }
      walls.push({
        xf: CanvasUtils.randRange(rng, ROCK_WALL_DEF.xRange[0], ROCK_WALL_DEF.xRange[1]),
        widthFrac: CanvasUtils.randRange(rng, ROCK_WALL_DEF.widthFracRange[0], ROCK_WALL_DEF.widthFracRange[1]),
        heightFrac: CanvasUtils.randRange(rng, ROCK_WALL_DEF.heightFracRange[0], ROCK_WALL_DEF.heightFracRange[1]),
        baseYf: CanvasUtils.randRange(rng, ROCK_WALL_DEF.baseYBandF[0], ROCK_WALL_DEF.baseYBandF[1]),
        topProfile: topProfile
      });
    }
    walls.sort(function (a, b) { return a.xf - b.xf; });
    return walls;
  }

  function generatePebbles(rng) {
    var count = Math.round(CanvasUtils.randRange(rng, PEBBLE_DEF.countRange[0], PEBBLE_DEF.countRange[1]));
    var pebbles = [];
    for (var i = 0; i < count; i++) {
      pebbles.push({
        xf: rng(),
        sizeFrac: CanvasUtils.randRange(rng, PEBBLE_DEF.sizeFracRange[0], PEBBLE_DEF.sizeFracRange[1]),
        aspect: CanvasUtils.randRange(rng, 0.6, 1.0),
        rotationDeg: CanvasUtils.randRange(rng, 0, 360),
        colorVariant: Math.floor(rng() * PEBBLE_DEF.colorVariants.length)
      });
    }
    return pebbles;
  }

  Background.prototype._generateLayout = function (rng) {
    return {
      duneAnchors: {
        back: generateDuneAnchors(rng, DUNE_LAYER_DEFS.back),
        mid: generateDuneAnchors(rng, DUNE_LAYER_DEFS.mid),
        front: generateDuneAnchors(rng, DUNE_LAYER_DEFS.front)
      },
      rockWalls: generateRockWalls(rng),
      pebbles: generatePebbles(rng)
    };
  };

  // ---- Reconstrução geométrica (sem consumir rng - só reescala pro viewport atual) ----
  Background.prototype._rebuildGeometry = function (width, height) {
    var layout = this._layout;
    var self = this;

    this._duneSegments = {};
    ['back', 'mid', 'front'].forEach(function (key) {
      var pts = layout.duneAnchors[key].map(function (a) {
        return { x: a.xf * width, y: a.yf * height };
      });
      self._duneSegments[key] = CanvasUtils.buildSmoothSegments(pts);
    });

    this._rockPolys = layout.rockWalls.map(function (wall) {
      var baseX = wall.xf * width;
      var baseY = wall.baseYf * height;
      var wPx = wall.widthFrac * width;
      var hPx = wall.heightFrac * height;
      var points = [{ x: baseX - wPx / 2, y: baseY }];
      wall.topProfile.forEach(function (p) {
        points.push({ x: baseX - wPx / 2 + p.u * wPx, y: baseY - p.v * hPx });
      });
      points.push({ x: baseX + wPx / 2, y: baseY });
      return points;
    });

    this._pebblesPx = layout.pebbles.map(function (p) {
      var x = p.xf * width;
      var y = CanvasUtils.sampleSmoothPathY(self._duneSegments.front, x);
      return {
        x: x, y: y, r: p.sizeFrac * width,
        aspect: p.aspect, rotationDeg: p.rotationDeg, colorVariant: p.colorVariant
      };
    });
  };

  Background.prototype._seedParticles = function (rng, width, height) {
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

  // O layout (dunas/rochas/pedrinhas) é gerado 1x por sessão - resize só
  // reescala pro novo viewport, nunca sorteia um padrão novo no meio da sessão.
  Background.prototype.resize = function (width, height, rng) {
    this._width = width;
    this._height = height;
    this._rng = rng;

    if (!this._layout) {
      this._layout = this._generateLayout(rng);
    }
    this._rebuildGeometry(width, height);
    this._seedParticles(rng, width, height);
  };

  // Expõe o Y real da superfície da areia (camada da frente, onde os
  // componentes se fixam) pra um X (espaço do mundo).
  Background.prototype.sandSurfaceYf = function (x) {
    if (!this._duneSegments || !this._duneSegments.front) return this._height * 0.86;
    return CanvasUtils.sampleSmoothPathY(this._duneSegments.front, x);
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
    this._drawRockWalls(ctx, camera);
    this._drawDuneLayer(ctx, width, height, camera, 'back');
    this._drawCaustics(ctx, width, height);
    this._drawDuneLayer(ctx, width, height, camera, 'mid');
    this._drawParticles(ctx);
    this._drawDuneLayer(ctx, width, height, camera, 'front');
    this._drawPebbles(ctx, camera);
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

  // Paredões rochosos escuros ao fundo - silhueta irregular (jagged),
  // gradiente escuro pra dar volume, parcialmente "enterrados" pela duna
  // de fundo (desenhada por cima, ver ordem em draw()).
  Background.prototype._drawRockWalls = function (ctx, camera) {
    if (!this._rockPolys) return;
    ctx.save();
    var parallax = camera ? camera.parallaxFor(0.25) : { x: 0, y: 0 };
    ctx.translate(parallax.x * 0.4, parallax.y * 0.15);

    this._rockPolys.forEach(function (points) {
      var top = points.reduce(function (m, p) { return Math.min(m, p.y); }, Infinity);
      var bottom = points[0].y;
      var grad = CanvasUtils.makeVerticalGradient(ctx, 0, top, 0, bottom, [
        [0, '#3d5b6e'],
        [0.55, '#223742'],
        [1, '#0f1c24']
      ]);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (var i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
      ctx.closePath();
      ctx.fill();
    });
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

  // Camada única de duna (back|mid|front) - mesma técnica de curva suave,
  // paleta/profundidade/parallax variam por camada (ver DUNE_LAYER_DEFS).
  Background.prototype._drawDuneLayer = function (ctx, width, height, camera, key) {
    var segments = this._duneSegments && this._duneSegments[key];
    if (!segments) return;
    var def = DUNE_LAYER_DEFS[key];

    ctx.save();
    var parallax = camera ? camera.parallaxFor(def.depth) : { x: 0, y: 0 };
    ctx.translate(parallax.x, parallax.y * 0.3);

    var pts = CanvasUtils.traceSmoothPath(segments, -40, width + 40, 64);
    var sandGrad = CanvasUtils.makeVerticalGradient(ctx, 0, height * 0.5, 0, height, def.colorStops);
    ctx.fillStyle = sandGrad;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.lineTo(width + 40, height + 40);
    ctx.lineTo(-40, height + 40);
    ctx.closePath();
    ctx.fill();

    var rimGrad = CanvasUtils.makeVerticalGradient(ctx, 0, pts[0].y - 6, 0, pts[0].y + 6, [
      [0, 'rgba(255,255,255,0)'],
      [0.5, def.rimColor],
      [1, 'rgba(255,255,255,0)']
    ]);
    ctx.strokeStyle = rimGrad;
    ctx.lineWidth = key === 'front' ? 3 : 2;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();

    ctx.restore();
  };

  // Pedrinhas soltas sobre a areia da camada da frente - sempre no Y real
  // da curva (sampleSmoothPathY), nunca flutuando/afundando.
  Background.prototype._drawPebbles = function (ctx, camera) {
    if (!this._pebblesPx) return;
    ctx.save();
    var parallax = camera ? camera.parallaxFor(DUNE_LAYER_DEFS.front.depth) : { x: 0, y: 0 };
    ctx.translate(parallax.x, parallax.y * 0.3);

    this._pebblesPx.forEach(function (p) {
      var variant = PEBBLE_DEF.colorVariants[p.colorVariant] || PEBBLE_DEF.colorVariants[0];

      // sombra de contato - ancora a pedra visualmente na areia
      ctx.save();
      ctx.translate(p.x, p.y + p.r * 0.35);
      ctx.scale(1.5, 0.5);
      var shadowGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, p.r);
      shadowGrad.addColorStop(0, 'rgba(10,20,25,0.28)');
      shadowGrad.addColorStop(1, 'rgba(10,20,25,0)');
      ctx.fillStyle = shadowGrad;
      ctx.beginPath();
      ctx.arc(0, 0, p.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotationDeg * Math.PI / 180);
      ctx.scale(1, p.aspect);
      var grad = ctx.createLinearGradient(0, -p.r, 0, p.r);
      grad.addColorStop(0, variant.top);
      grad.addColorStop(1, variant.bottom);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(0, 0, p.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });

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
