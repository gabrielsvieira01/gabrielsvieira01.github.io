(function (PMV) {
  'use strict';

  PMV.Themes = PMV.Themes || {};
  PMV.Themes.Recife = PMV.Themes.Recife || {};

  var CanvasUtils = PMV.Engine.CanvasUtils;

  function Background() {
    this._layout = null;        // parâmetros/seeds gerados 1x por sessão
    this._duneSegments = null;  // {back, mid, front} -> segmentos da curva suave
    this._duneTracePts = null;  // {back, mid, front} -> pontos amostrados (p/ textura)
    this._rockPolys = null;
    this._pebblesPx = null;     // {back:[...], mid:[...], front:[...]}
    this._sandSpecklesPx = null; // {back:[...], mid:[...], front:[...]}
    this._godRays = null;
    this._particles = [];
    this._time = 0;
    this._width = 0;
    this._height = 0;
    this._rng = null;
  }

  // ---- Envelopes autorais (direção de arte) ----
  // Tamanhos/amplitudes são fração de refUnit = min(largura, altura) -
  // nunca da largura/altura crua - então girar o aparelho não estica nem
  // encolhe a cena. Densidades (contagens) são "por unidade de largura"
  // (width/refUnit), recalculadas a cada resize a partir de uma seed fixa
  // por sessão - o padrão muda de forma coerente ao girar a tela (mais
  // largura = mais repetições no mesmo espaçamento), mas nunca reembaralha
  // à toa num resize de mesmo tamanho (mesma seed + mesma largura = mesmo
  // resultado, sempre).

  var SAND_STOPS = [[0, '#e8cf9c'], [0.35, '#d3b579'], [1, '#a3844f']];
  var PEBBLE_VARIANTS = [
    { top: '#d8c193', bottom: '#8f7248' },
    { top: '#aab3b8', bottom: '#5f686d' },
    { top: '#8f8070', bottom: '#463d33' }
  ];

  function pickSeed(rng) {
    return Math.floor(rng() * 2147483647) || 1;
  }

  function densityCount(density, width, refUnit, min, max) {
    return CanvasUtils.clamp(Math.round(density * (width / refUnit)), min, max);
  }

  var DUNE_LAYER_DEFS = {
    back: {
      depth: 0.20, baseYf: 0.62,
      amplitudeUnitRange: [0.018, 0.032],
      wavelengthUnitRange: [0.34, 0.48],
      minAnchors: 6, maxAnchors: 11,
      xJitterF: 0.03,
      shadeFactor: 0.55,
      rimColor: 'rgba(255,238,210,0.14)'
    },
    mid: {
      depth: 0.55, baseYf: 0.75,
      amplitudeUnitRange: [0.024, 0.042],
      wavelengthUnitRange: [0.26, 0.38],
      minAnchors: 5, maxAnchors: 11,
      xJitterF: 0.035,
      shadeFactor: 0.80,
      rimColor: 'rgba(255,244,214,0.22)'
    },
    front: {
      depth: 0.95, baseYf: 0.87,
      amplitudeUnitRange: [0.028, 0.050],
      wavelengthUnitRange: [0.20, 0.30],
      minAnchors: 6, maxAnchors: 13,
      xJitterF: 0.04,
      shadeFactor: 1.0,
      rimColor: 'rgba(255,244,214,0.35)'
    }
  };
  var DUNE_LAYER_ORDER = ['back', 'mid', 'front'];

  // Paredões arredondados (boulder), bem mais largos que altos - leem como
  // parede rochosa contínua ao fundo, não picos finos isolados.
  var ROCK_WALL_DEF = {
    densityRange: [4.6, 7.2],
    minCount: 5, maxCount: 16,
    widthUnitRange: [0.24, 0.46],
    heightUnitRange: [0.19, 0.34],
    pointsRange: [8, 13],
    burialUnitRange: [0.014, 0.032],
    xRange: [-0.08, 1.08]
  };

  var PEBBLE_LAYER_DEFS = {
    back: { densityRange: [3.0, 5.2], minCount: 4, maxCount: 13, sizeUnitRange: [0.004, 0.015], shadeFactor: 0.6 },
    mid: { densityRange: [3.8, 6.5], minCount: 6, maxCount: 17, sizeUnitRange: [0.006, 0.021], shadeFactor: 0.82 },
    front: { densityRange: [4.6, 8.0], minCount: 8, maxCount: 22, sizeUnitRange: [0.008, 0.030], shadeFactor: 1.0 }
  };
  var PEBBLE_BLOB_POINTS_RANGE = [7, 9];
  var PEBBLE_BLOB_JITTER_RANGE = [0.70, 1.24];

  var SAND_TEXTURE_DEFS = {
    back: { rippleOffsetsUnit: [0.012, 0.026], speckleDensityRange: [9, 16], speckleSizeUnitRange: [0.0018, 0.0042], speckleDepthUnit: 0.05 },
    mid: { rippleOffsetsUnit: [0.014, 0.030, 0.048], speckleDensityRange: [13, 22], speckleSizeUnitRange: [0.0022, 0.0052], speckleDepthUnit: 0.065 },
    front: { rippleOffsetsUnit: [0.016, 0.034, 0.055], speckleDensityRange: [17, 28], speckleSizeUnitRange: [0.0026, 0.0068], speckleDepthUnit: 0.08 }
  };

  var GOD_RAY_DEF = {
    densityRange: [4.5, 7.0],
    minCount: 4, maxCount: 11,
    widthUnitRange: [0.005, 0.014],
    lengthFracRange: [0.52, 0.82],
    opacityRange: [0.09, 0.20],
    tiltDegRange: [-9, 9],
    swaySpeedRange: [0.09, 0.17]
  };

  // ---- Geração de parâmetros (consome rng - roda 1x por sessão) ----
  function generateDuneLayout(rng, def) {
    return {
      baseYf: def.baseYf,
      amplitudeUnit: CanvasUtils.randRange(rng, def.amplitudeUnitRange[0], def.amplitudeUnitRange[1]),
      wavelengthUnit: CanvasUtils.randRange(rng, def.wavelengthUnitRange[0], def.wavelengthUnitRange[1]),
      seed: pickSeed(rng)
    };
  }

  Background.prototype._generateLayout = function (rng) {
    var duneLayout = {};
    DUNE_LAYER_ORDER.forEach(function (key) {
      duneLayout[key] = generateDuneLayout(rng, DUNE_LAYER_DEFS[key]);
    });
    var pebbleLayout = {};
    DUNE_LAYER_ORDER.forEach(function (key) {
      pebbleLayout[key] = { density: CanvasUtils.randRange(rng, PEBBLE_LAYER_DEFS[key].densityRange[0], PEBBLE_LAYER_DEFS[key].densityRange[1]), seed: pickSeed(rng) };
    });
    var textureLayout = {};
    DUNE_LAYER_ORDER.forEach(function (key) {
      var def = SAND_TEXTURE_DEFS[key];
      textureLayout[key] = { density: CanvasUtils.randRange(rng, def.speckleDensityRange[0], def.speckleDensityRange[1]), seed: pickSeed(rng) };
    });
    return {
      dune: duneLayout,
      rocks: { density: CanvasUtils.randRange(rng, ROCK_WALL_DEF.densityRange[0], ROCK_WALL_DEF.densityRange[1]), seed: pickSeed(rng) },
      pebbles: pebbleLayout,
      sandTexture: textureLayout,
      godRays: { density: CanvasUtils.randRange(rng, GOD_RAY_DEF.densityRange[0], GOD_RAY_DEF.densityRange[1]), seed: pickSeed(rng) }
    };
  };

  // ---- Reconstrução geométrica (determinística a partir das seeds - sem
  // consumir a rng principal; roda a cada resize, nunca por frame) ----

  function buildDuneAnchorPoints(lane, def, width, height, refUnit) {
    var localRng = CanvasUtils.mulberry32(lane.seed);
    var wavelengthPx = Math.max(20, lane.wavelengthUnit * refUnit);
    var count = CanvasUtils.clamp(Math.round(width / wavelengthPx) + 1, def.minAnchors, def.maxAnchors);
    var xStart = -0.15, xSpan = 1.30;
    var pts = [];
    for (var i = 0; i < count; i++) {
      var baseXf = xStart + (xSpan * i) / Math.max(1, count - 1);
      var jitterXf = CanvasUtils.randRange(localRng, -def.xJitterF, def.xJitterF);
      var yOffsetUnits = CanvasUtils.randRange(localRng, -lane.amplitudeUnit, lane.amplitudeUnit);
      pts.push({ x: (baseXf + jitterXf) * width, y: lane.baseYf * height + yOffsetUnits * refUnit });
    }
    pts.sort(function (a, b) { return a.x - b.x; });
    return pts;
  }

  function buildRockPolys(rockLayout, backSegments, width, height, refUnit) {
    var localRng = CanvasUtils.mulberry32(rockLayout.seed);
    var count = densityCount(rockLayout.density, width, refUnit, ROCK_WALL_DEF.minCount, ROCK_WALL_DEF.maxCount);
    var polys = [];
    for (var i = 0; i < count; i++) {
      var xf = CanvasUtils.randRange(localRng, ROCK_WALL_DEF.xRange[0], ROCK_WALL_DEF.xRange[1]);
      var baseX = xf * width;
      var wPx = CanvasUtils.randRange(localRng, ROCK_WALL_DEF.widthUnitRange[0], ROCK_WALL_DEF.widthUnitRange[1]) * refUnit;
      var hPx = CanvasUtils.randRange(localRng, ROCK_WALL_DEF.heightUnitRange[0], ROCK_WALL_DEF.heightUnitRange[1]) * refUnit;
      var burialPx = CanvasUtils.randRange(localRng, ROCK_WALL_DEF.burialUnitRange[0], ROCK_WALL_DEF.burialUnitRange[1]) * refUnit;
      var pointCount = Math.round(CanvasUtils.randRange(localRng, ROCK_WALL_DEF.pointsRange[0], ROCK_WALL_DEF.pointsRange[1]));

      // Base ancorada na curva REAL da duna de trás (3 amostras, a mais
      // baixa) + afundamento extra - a duna desenhada por cima sempre
      // esconde a base reta por completo.
      var ySamples = [
        CanvasUtils.sampleSmoothPathY(backSegments, baseX - wPx / 2),
        CanvasUtils.sampleSmoothPathY(backSegments, baseX),
        CanvasUtils.sampleSmoothPathY(backSegments, baseX + wPx / 2)
      ];
      var baseY = Math.max(ySamples[0], ySamples[1], ySamples[2]) + burialPx;

      var profilePts = [{ x: baseX - wPx / 2, y: baseY }];
      for (var j = 0; j <= pointCount; j++) {
        var u = j / pointCount;
        var envelope = Math.sin(u * Math.PI);
        var jag = CanvasUtils.randRange(localRng, 0.55, 1.0);
        profilePts.push({ x: baseX - wPx / 2 + u * wPx, y: baseY - envelope * jag * hPx });
      }
      profilePts.push({ x: baseX + wPx / 2, y: baseY });

      // Suaviza o perfil (boulder arredondado, não pico anguloso) com a
      // mesma técnica de curva suave da duna.
      var segs = CanvasUtils.buildSmoothSegments(profilePts);
      var smoothPts = CanvasUtils.traceSmoothPath(segs, profilePts[0].x, profilePts[profilePts.length - 1].x, 26);
      polys.push(smoothPts);
    }
    polys.sort(function (a, b) { return a[0].x - b[0].x; });
    return polys;
  }

  function generatePebbleBlob(rng) {
    var n = Math.round(CanvasUtils.randRange(rng, PEBBLE_BLOB_POINTS_RANGE[0], PEBBLE_BLOB_POINTS_RANGE[1]));
    var radii = [];
    for (var i = 0; i < n; i++) radii.push(CanvasUtils.randRange(rng, PEBBLE_BLOB_JITTER_RANGE[0], PEBBLE_BLOB_JITTER_RANGE[1]));
    return radii;
  }

  function buildPebbles(pebbleLayout, def, segments, width, refUnit) {
    var localRng = CanvasUtils.mulberry32(pebbleLayout.seed);
    var count = densityCount(pebbleLayout.density, width, refUnit, def.minCount, def.maxCount);
    var pebbles = [];
    for (var i = 0; i < count; i++) {
      var x = localRng() * width;
      var y = CanvasUtils.sampleSmoothPathY(segments, x);
      pebbles.push({
        x: x, y: y,
        r: CanvasUtils.randRange(localRng, def.sizeUnitRange[0], def.sizeUnitRange[1]) * refUnit,
        aspect: CanvasUtils.randRange(localRng, 0.72, 0.96),
        rotationRad: localRng() * Math.PI * 2,
        colorVariant: Math.floor(localRng() * PEBBLE_VARIANTS.length),
        radii: generatePebbleBlob(localRng)
      });
    }
    return pebbles;
  }

  function buildSandSpeckles(textureLayout, def, segments, width, height, refUnit) {
    var localRng = CanvasUtils.mulberry32(textureLayout.seed);
    var count = densityCount(textureLayout.density, width, refUnit, 4, 200);
    var speckles = [];
    for (var i = 0; i < count; i++) {
      var x = localRng() * width;
      var surfaceY = CanvasUtils.sampleSmoothPathY(segments, x);
      var depth = localRng() * def.speckleDepthUnit * refUnit;
      speckles.push({
        x: x, y: surfaceY + depth,
        r: CanvasUtils.randRange(localRng, def.speckleSizeUnitRange[0], def.speckleSizeUnitRange[1]) * refUnit,
        tone: CanvasUtils.randRange(localRng, 0.8, 1.22), // mais claro ou mais escuro que o tom base
        opacity: CanvasUtils.randRange(localRng, 0.10, 0.30)
      });
    }
    return speckles;
  }

  function buildGodRays(godRayLayout, width, height, refUnit) {
    var localRng = CanvasUtils.mulberry32(godRayLayout.seed);
    var count = densityCount(godRayLayout.density, width, refUnit, GOD_RAY_DEF.minCount, GOD_RAY_DEF.maxCount);
    var rays = [];
    for (var i = 0; i < count; i++) {
      rays.push({
        xf: CanvasUtils.randRange(localRng, 0.04, 0.96),
        widthUnit: CanvasUtils.randRange(localRng, GOD_RAY_DEF.widthUnitRange[0], GOD_RAY_DEF.widthUnitRange[1]),
        lengthFrac: CanvasUtils.randRange(localRng, GOD_RAY_DEF.lengthFracRange[0], GOD_RAY_DEF.lengthFracRange[1]),
        opacity: CanvasUtils.randRange(localRng, GOD_RAY_DEF.opacityRange[0], GOD_RAY_DEF.opacityRange[1]),
        tiltDeg: CanvasUtils.randRange(localRng, GOD_RAY_DEF.tiltDegRange[0], GOD_RAY_DEF.tiltDegRange[1]),
        swaySpeed: CanvasUtils.randRange(localRng, GOD_RAY_DEF.swaySpeedRange[0], GOD_RAY_DEF.swaySpeedRange[1]),
        phase: localRng() * Math.PI * 2
      });
    }
    return rays;
  }

  Background.prototype._rebuildGeometry = function (width, height) {
    var layout = this._layout;
    var self = this;
    var refUnit = Math.min(width, height);

    this._duneSegments = {};
    this._duneTracePts = {};
    DUNE_LAYER_ORDER.forEach(function (key) {
      var pts = buildDuneAnchorPoints(layout.dune[key], DUNE_LAYER_DEFS[key], width, height, refUnit);
      var segs = CanvasUtils.buildSmoothSegments(pts);
      self._duneSegments[key] = segs;
      self._duneTracePts[key] = CanvasUtils.traceSmoothPath(segs, -40, width + 40, 64);
    });

    this._rockPolys = buildRockPolys(layout.rocks, this._duneSegments.back, width, height, refUnit);

    this._pebblesPx = {};
    this._sandSpecklesPx = {};
    DUNE_LAYER_ORDER.forEach(function (key) {
      var segments = self._duneSegments[key];
      self._pebblesPx[key] = buildPebbles(layout.pebbles[key], PEBBLE_LAYER_DEFS[key], segments, width, refUnit);
      self._sandSpecklesPx[key] = buildSandSpeckles(layout.sandTexture[key], SAND_TEXTURE_DEFS[key], segments, width, height, refUnit);
    });

    this._godRays = buildGodRays(layout.godRays, width, height, refUnit);
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

  // Os PARÂMETROS (amplitude, comprimento de onda, densidades, seeds) são
  // sorteados 1x por sessão. A GEOMETRIA concreta (quantas dunas/rochas/
  // pedrinhas e onde) é recalculada a cada resize a partir dessas seeds -
  // determinístico (mesma largura -> sempre o mesmo resultado), mas se
  // adapta coerentemente quando a proporção da tela muda (ex.: virar o
  // celular), em vez de esticar/comprimir o mesmo padrão fixo.
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
    this._drawSandTexture(ctx, camera, 'back');
    this._drawPebbleLayer(ctx, camera, 'back');
    this._drawCaustics(ctx, width, height);

    this._drawDuneLayer(ctx, width, height, camera, 'mid');
    this._drawSandTexture(ctx, camera, 'mid');
    this._drawPebbleLayer(ctx, camera, 'mid');
    this._drawParticles(ctx);

    this._drawDuneLayer(ctx, width, height, camera, 'front');
    this._drawSandTexture(ctx, camera, 'front');
    this._drawPebbleLayer(ctx, camera, 'front');

    this._drawDepthFog(ctx, width, height);
  };

  // Feixes de luz finos e nítidos (não trapézios largos), com leve
  // desfoque via ctx.filter pra um brilho suave em vez de borda dura.
  Background.prototype._drawGodRays = function (ctx, width, height, camera) {
    if (!this._godRays) return;
    var refUnit = Math.min(width, height);
    ctx.save();
    var parallax = camera ? camera.parallaxFor(0.08) : { x: 0, y: 0 };
    ctx.translate(parallax.x * 0.25, 0);
    if ('filter' in ctx) ctx.filter = 'blur(' + Math.max(1, refUnit * 0.006) + 'px)';

    this._godRays.forEach(function (ray) {
      var sway = Math.sin(this._time * ray.swaySpeed + ray.phase) * refUnit * 0.018;
      var topX = ray.xf * width + sway;
      var rayLen = height * ray.lengthFrac;
      var tiltPx = Math.tan(ray.tiltDeg * Math.PI / 180) * rayLen;
      var bottomX = topX + tiltPx;
      var rayW = Math.max(1.2, ray.widthUnit * refUnit);

      var grad = ctx.createLinearGradient(topX, 0, bottomX, rayLen);
      grad.addColorStop(0, 'rgba(255,255,255,' + ray.opacity + ')');
      grad.addColorStop(0.6, 'rgba(255,255,255,' + (ray.opacity * 0.35).toFixed(3) + ')');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(topX - rayW / 2, 0);
      ctx.lineTo(topX + rayW / 2, 0);
      ctx.lineTo(bottomX + rayW / 2, rayLen);
      ctx.lineTo(bottomX - rayW / 2, rayLen);
      ctx.closePath();
      ctx.fill();
    }, this);

    if ('filter' in ctx) ctx.filter = 'none';
    ctx.restore();
  };

  // Paredões rochosos - boulders arredondados e largos (parede contínua ao
  // fundo), base sempre afundada na curva real da duna de trás.
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

      // realce sutil no contorno superior - dá volume, sem contorno preto
      var rimGrad = CanvasUtils.makeVerticalGradient(ctx, 0, top - 4, 0, top + 10, [
        [0, 'rgba(150,190,205,0.22)'],
        [1, 'rgba(150,190,205,0)']
      ]);
      ctx.strokeStyle = rimGrad;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
      ctx.stroke();
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

  // Camada única de duna (back|mid|front) - mesma paleta de areia
  // (SAND_STOPS), só escurecida por shadeFactor conforme a profundidade.
  Background.prototype._drawDuneLayer = function (ctx, width, height, camera, key) {
    var pts = this._duneTracePts && this._duneTracePts[key];
    if (!pts) return;
    var def = DUNE_LAYER_DEFS[key];
    var colorStops = CanvasUtils.scaleStops(SAND_STOPS, def.shadeFactor);

    ctx.save();
    var parallax = camera ? camera.parallaxFor(def.depth) : { x: 0, y: 0 };
    ctx.translate(parallax.x, parallax.y * 0.3);

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

  // Textura da areia: linhas de contorno "eco" (ondulações) seguindo a
  // mesma curva em profundidades crescentes, mais grão fino (speckles).
  Background.prototype._drawSandTexture = function (ctx, camera, key) {
    var pts = this._duneTracePts && this._duneTracePts[key];
    var speckles = this._sandSpecklesPx && this._sandSpecklesPx[key];
    if (!pts) return;
    var def = DUNE_LAYER_DEFS[key];
    var texDef = SAND_TEXTURE_DEFS[key];
    var refUnit = Math.min(this._width, this._height);
    var darkLine = CanvasUtils.scaleHexColor(SAND_STOPS[2][1], def.shadeFactor * 0.75);
    var lightLine = CanvasUtils.scaleHexColor(SAND_STOPS[0][1], Math.min(1, def.shadeFactor * 1.15));

    ctx.save();
    var parallax = camera ? camera.parallaxFor(def.depth) : { x: 0, y: 0 };
    ctx.translate(parallax.x, parallax.y * 0.3);

    texDef.rippleOffsetsUnit.forEach(function (offUnit, idx) {
      var offset = offUnit * refUnit;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y + offset);
      for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y + offset);
      ctx.strokeStyle = idx % 2 === 0 ? darkLine : lightLine;
      ctx.globalAlpha = 0.10;
      ctx.lineWidth = 1.2;
      ctx.stroke();
    });
    ctx.globalAlpha = 1;

    if (speckles) {
      speckles.forEach(function (s) {
        ctx.beginPath();
        ctx.fillStyle = CanvasUtils.scaleHexColor(SAND_STOPS[1][1], def.shadeFactor * s.tone);
        ctx.globalAlpha = s.opacity;
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1;
    }

    ctx.restore();
  };

  // Pedrinhas de uma camada - blob orgânico irregular, sempre no Y real
  // da curva daquela camada, com sombra de contato.
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
