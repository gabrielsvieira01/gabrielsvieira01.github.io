(function (PMV) {
  'use strict';

  PMV.Themes = PMV.Themes || {};
  PMV.Themes.Recife = PMV.Themes.Recife || {};

  var CanvasUtils = PMV.Engine.CanvasUtils;

  function Background() {
    this._layout = null;        // gerado 1x por sessão (ver _generateLayout)
    this._duneSegments = null;  // {back, mid, front} -> segmentos da curva suave
    this._rockPolys = null;
    this._pebblesPx = null;     // {back:[...], mid:[...], front:[...]}
    this._particles = [];
    this._time = 0;
    this._width = 0;
    this._height = 0;
    this._rng = null;
  }

  // ---- Envelopes autorais (direção de arte) ----
  // Amplitudes/tamanhos são fração de refUnit = min(largura, altura), não
  // da altura crua - assim a cena não "espicha" quando o celular vira
  // pra retrato (altura grande, largura estreita). Só a paleta de cor tem
  // UMA fonte (SAND_STOPS/PEBBLE_VARIANTS) - as camadas de trás só escurecem
  // essa mesma paleta via CanvasUtils.scaleStops/scaleHexColor.

  var SAND_STOPS = [[0, '#e8cf9c'], [0.35, '#d3b579'], [1, '#a3844f']];
  var PEBBLE_VARIANTS = [
    { top: '#d8c193', bottom: '#8f7248' },
    { top: '#aab3b8', bottom: '#5f686d' },
    { top: '#8f8070', bottom: '#463d33' }
  ];

  var DUNE_LAYER_DEFS = {
    back: {
      depth: 0.20,
      baseYf: 0.63,
      amplitudeUnitRange: [0.020, 0.040],
      anchorCountRange: [5, 7],
      xJitterF: 0.035,
      shadeFactor: 0.58,
      rimColor: 'rgba(255,238,210,0.14)'
    },
    mid: {
      depth: 0.55,
      baseYf: 0.75,
      amplitudeUnitRange: [0.028, 0.050],
      anchorCountRange: [6, 8],
      xJitterF: 0.04,
      shadeFactor: 0.80,
      rimColor: 'rgba(255,244,214,0.22)'
    },
    front: {
      depth: 0.95,
      baseYf: 0.86,
      amplitudeUnitRange: [0.035, 0.060],
      anchorCountRange: [6, 9],
      xJitterF: 0.045,
      shadeFactor: 1.0,
      rimColor: 'rgba(255,244,214,0.35)'
    }
  };
  var DUNE_LAYER_ORDER = ['back', 'mid', 'front'];

  var ROCK_WALL_DEF = {
    countRange: [3, 6],
    xRange: [-0.05, 1.05],
    widthUnitRange: [0.11, 0.22],
    heightUnitRange: [0.13, 0.24],
    jaggedPointsRange: [6, 10],
    burialUnitRange: [0.012, 0.03] // afunda a base pra ficar sempre atrás da duna
  };

  var PEBBLE_LAYER_DEFS = {
    back: { countRange: [5, 9], sizeUnitRange: [0.0035, 0.0075], shadeFactor: 0.6 },
    mid: { countRange: [7, 12], sizeUnitRange: [0.005, 0.010], shadeFactor: 0.82 },
    front: { countRange: [10, 16], sizeUnitRange: [0.007, 0.015], shadeFactor: 1.0 }
  };
  var PEBBLE_BLOB_POINTS_RANGE = [7, 9];
  var PEBBLE_BLOB_JITTER_RANGE = [0.72, 1.22]; // multiplicador de raio por vértice - dá a irregularidade

  // ---- Geração (consome rng - roda 1x por sessão) ----
  function generateDuneAnchors(rng, def) {
    var count = Math.round(CanvasUtils.randRange(rng, def.anchorCountRange[0], def.anchorCountRange[1]));
    var amplitudeUnit = CanvasUtils.randRange(rng, def.amplitudeUnitRange[0], def.amplitudeUnitRange[1]);
    var anchors = [];
    var xStart = -0.15, xSpan = 1.30;
    for (var i = 0; i < count; i++) {
      var baseXf = xStart + (xSpan * i) / (count - 1);
      var jitterXf = CanvasUtils.randRange(rng, -def.xJitterF, def.xJitterF);
      var yOffsetUnits = CanvasUtils.randRange(rng, -amplitudeUnit, amplitudeUnit);
      anchors.push({ xf: baseXf + jitterXf, yOffsetUnits: yOffsetUnits });
    }
    anchors.sort(function (a, b) { return a.xf - b.xf; });
    return { baseYf: def.baseYf, anchors: anchors };
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
        widthFrac: CanvasUtils.randRange(rng, ROCK_WALL_DEF.widthUnitRange[0], ROCK_WALL_DEF.widthUnitRange[1]),
        heightFrac: CanvasUtils.randRange(rng, ROCK_WALL_DEF.heightUnitRange[0], ROCK_WALL_DEF.heightUnitRange[1]),
        burialFrac: CanvasUtils.randRange(rng, ROCK_WALL_DEF.burialUnitRange[0], ROCK_WALL_DEF.burialUnitRange[1]),
        topProfile: topProfile
      });
    }
    walls.sort(function (a, b) { return a.xf - b.xf; });
    return walls;
  }

  function generatePebbleBlob(rng) {
    var n = Math.round(CanvasUtils.randRange(rng, PEBBLE_BLOB_POINTS_RANGE[0], PEBBLE_BLOB_POINTS_RANGE[1]));
    var radii = [];
    for (var i = 0; i < n; i++) {
      radii.push(CanvasUtils.randRange(rng, PEBBLE_BLOB_JITTER_RANGE[0], PEBBLE_BLOB_JITTER_RANGE[1]));
    }
    return radii;
  }

  function generatePebblesForLayer(rng, def) {
    var count = Math.round(CanvasUtils.randRange(rng, def.countRange[0], def.countRange[1]));
    var pebbles = [];
    for (var i = 0; i < count; i++) {
      pebbles.push({
        xf: rng(),
        sizeFrac: CanvasUtils.randRange(rng, def.sizeUnitRange[0], def.sizeUnitRange[1]),
        aspect: CanvasUtils.randRange(rng, 0.72, 0.96),
        rotationRad: rng() * Math.PI * 2,
        colorVariant: Math.floor(rng() * PEBBLE_VARIANTS.length),
        radii: generatePebbleBlob(rng)
      });
    }
    return pebbles;
  }

  Background.prototype._generateLayout = function (rng) {
    var duneAnchors = {};
    DUNE_LAYER_ORDER.forEach(function (key) {
      duneAnchors[key] = generateDuneAnchors(rng, DUNE_LAYER_DEFS[key]);
    });
    var pebbles = {};
    DUNE_LAYER_ORDER.forEach(function (key) {
      pebbles[key] = generatePebblesForLayer(rng, PEBBLE_LAYER_DEFS[key]);
    });
    return {
      duneAnchors: duneAnchors,
      rockWalls: generateRockWalls(rng),
      pebbles: pebbles
    };
  };

  // ---- Reconstrução geométrica (sem consumir rng - só reescala pro viewport atual) ----
  Background.prototype._rebuildGeometry = function (width, height) {
    var layout = this._layout;
    var self = this;
    var refUnit = Math.min(width, height);

    this._duneSegments = {};
    DUNE_LAYER_ORDER.forEach(function (key) {
      var lane = layout.duneAnchors[key];
      var pts = lane.anchors.map(function (a) {
        return { x: a.xf * width, y: lane.baseYf * height + a.yOffsetUnits * refUnit };
      });
      self._duneSegments[key] = CanvasUtils.buildSmoothSegments(pts);
    });

    // Paredões: a base é ancorada na curva REAL da duna de fundo + um
    // afundamento extra, então a duna desenhada por cima sempre esconde
    // a base reta - só o topo irregular fica visível, "emergindo" da areia.
    var backSegments = this._duneSegments.back;
    this._rockPolys = layout.rockWalls.map(function (wall) {
      var baseX = wall.xf * width;
      var wPx = wall.widthFrac * refUnit;
      var hPx = wall.heightFrac * refUnit;
      // Amostra a curva real nas duas bordas + centro do rochedo (não só no
      // centro) e usa a mais baixa (maior Y) - garante que a base fica
      // enterrada na areia em TODA a largura, não só no meio.
      var ySamples = [
        CanvasUtils.sampleSmoothPathY(backSegments, baseX - wPx / 2),
        CanvasUtils.sampleSmoothPathY(backSegments, baseX),
        CanvasUtils.sampleSmoothPathY(backSegments, baseX + wPx / 2)
      ];
      var localSurfaceY = Math.max(ySamples[0], ySamples[1], ySamples[2]);
      var baseY = localSurfaceY + wall.burialFrac * refUnit;
      var points = [{ x: baseX - wPx / 2, y: baseY }];
      wall.topProfile.forEach(function (p) {
        points.push({ x: baseX - wPx / 2 + p.u * wPx, y: baseY - p.v * hPx });
      });
      points.push({ x: baseX + wPx / 2, y: baseY });
      return points;
    });

    // Pedrinhas: uma lista por camada, cada uma grudada na curva real
    // daquela camada (nunca flutuando/afundando).
    this._pebblesPx = {};
    DUNE_LAYER_ORDER.forEach(function (key) {
      var segments = self._duneSegments[key];
      self._pebblesPx[key] = layout.pebbles[key].map(function (p) {
        var x = p.xf * width;
        var y = CanvasUtils.sampleSmoothPathY(segments, x);
        return {
          x: x, y: y, r: p.sizeFrac * refUnit,
          aspect: p.aspect, rotationRad: p.rotationRad,
          colorVariant: p.colorVariant, radii: p.radii
        };
      });
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
  // reescala pro novo viewport, nunca sorteia um padrão novo no meio da
  // sessão. Amplitudes usam refUnit (min largura/altura), então girar o
  // celular não faz a cena "esticar" nem ficar mais espiculada.
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
  // componentes se fixam por enquanto) pra um X (espaço do mundo).
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
    this._drawPebbleLayer(ctx, camera, 'back');
    this._drawCaustics(ctx, width, height);

    this._drawDuneLayer(ctx, width, height, camera, 'mid');
    this._drawPebbleLayer(ctx, camera, 'mid');
    this._drawParticles(ctx);

    this._drawDuneLayer(ctx, width, height, camera, 'front');
    this._drawPebbleLayer(ctx, camera, 'front');

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
  // base sempre afundada na curva real da duna de trás (ver _rebuildGeometry),
  // então a duna desenhada por cima esconde a base reta por completo.
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

  // Camada única de duna (back|mid|front) - mesma técnica de curva suave;
  // todas usam a MESMA paleta de areia (SAND_STOPS), só escurecida por
  // shadeFactor conforme a profundidade (nunca muda de matiz pra azul).
  Background.prototype._drawDuneLayer = function (ctx, width, height, camera, key) {
    var segments = this._duneSegments && this._duneSegments[key];
    if (!segments) return;
    var def = DUNE_LAYER_DEFS[key];
    var colorStops = CanvasUtils.scaleStops(SAND_STOPS, def.shadeFactor);

    ctx.save();
    var parallax = camera ? camera.parallaxFor(def.depth) : { x: 0, y: 0 };
    ctx.translate(parallax.x, parallax.y * 0.3);

    var pts = CanvasUtils.traceSmoothPath(segments, -40, width + 40, 64);
    var sandGrad = CanvasUtils.makeVerticalGradient(ctx, 0, height * 0.5, 0, height, colorStops);
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

  // Pedrinhas de uma camada - blob orgânico irregular (não circular/oval
  // perfeito), sempre no Y real da curva daquela camada, com sombra de
  // contato pra dar peso. Cor derivada da mesma paleta, escurecida por
  // camada (mesma lógica das dunas).
  Background.prototype._drawPebbleLayer = function (ctx, camera, key) {
    var pebbles = this._pebblesPx && this._pebblesPx[key];
    if (!pebbles || pebbles.length === 0) return;
    var def = DUNE_LAYER_DEFS[key];
    var shadeFactor = PEBBLE_LAYER_DEFS[key].shadeFactor;

    ctx.save();
    var parallax = camera ? camera.parallaxFor(def.depth) : { x: 0, y: 0 };
    ctx.translate(parallax.x, parallax.y * 0.3);

    pebbles.forEach(function (p) {
      var variant = PEBBLE_VARIANTS[p.colorVariant] || PEBBLE_VARIANTS[0];
      var topColor = CanvasUtils.scaleHexColor(variant.top, shadeFactor);
      var bottomColor = CanvasUtils.scaleHexColor(variant.bottom, shadeFactor);

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
      ctx.scale(1, p.aspect);
      var blobPts = CanvasUtils.buildBlobPoints(0, 0, p.r, p.radii, p.rotationRad);
      var grad = ctx.createLinearGradient(0, -p.r, 0, p.r);
      grad.addColorStop(0, topColor);
      grad.addColorStop(1, bottomColor);
      ctx.fillStyle = grad;
      ctx.beginPath();
      CanvasUtils.tracePointsSmooth(ctx, blobPts);
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
