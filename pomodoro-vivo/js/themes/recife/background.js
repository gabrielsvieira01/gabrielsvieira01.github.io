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
    this._farRidgeTracePts = null; // cordilheira contínua bem ao fundo (nova camada de profundidade)
    this._pebblesPx = null;     // {back:[...], mid:[...], front:[...]}
    this._sandSpecklesPx = null; // {back:[...], mid:[...], front:[...]}
    this._sandPatchesPx = null;  // {back:[...], mid:[...], front:[...]} - manchas amplas
    this._godRays = null;
    this._particleTiers = null;  // {back:[...], mid:[...], front:[...]}
    this._time = 0;
    this._width = 0;
    this._height = 0;
    this._rng = null;
    this._timeOverrideHour = null;
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

  var SAND_STOPS = [[0, '#edd5a4'], [0.28, '#d9bc82'], [0.62, '#c4a068'], [1, '#96754a']];
  var PEBBLE_VARIANTS = [
    { top: '#d8c193', bottom: '#8f7248' },
    { top: '#aab3b8', bottom: '#5f686d' },
    { top: '#8f8070', bottom: '#463d33' }
  ];

  // ---- Horário do dia ----
  // Paletas-chave por hora (0-24h), interpoladas linearmente entre as duas
  // mais próximas. Cada uma define: gradiente da água, cor/intensidade dos
  // raios de sol, e a cor "ambiente" usada pela neblina de profundidade
  // (mistura tudo que está mais ao fundo em direção a essa cor).
  var TIME_KEYFRAMES = [
    { hour: 0, water: [[0, '#2a3a52'], [0.18, '#1c2c44'], [0.42, '#142033'], [0.68, '#0c1624'], [1, '#050a14']], ray: '#aac9ff', rayOpacityMul: 0.30, fog: '#0a1420' },
    { hour: 5, water: [[0, '#8aa3c2'], [0.18, '#6a87ab'], [0.42, '#4a6482'], [0.68, '#2f4258'], [1, '#182636']], ray: '#ffd9c2', rayOpacityMul: 0.55, fog: '#33465c' },
    { hour: 8, water: [[0, '#c8ecec'], [0.18, '#8fd8d0'], [0.42, '#4aa8ae'], [0.68, '#256e88'], [1, '#0e3c5c']], ray: '#fff3d6', rayOpacityMul: 0.85, fog: '#5f96a3' },
    { hour: 13, water: [[0, '#bdeef0'], [0.18, '#7fd3d6'], [0.42, '#3f9fb0'], [0.68, '#1f6a8c'], [1, '#0c3a5e']], ray: '#ffffff', rayOpacityMul: 1.0, fog: '#6fa6ae' },
    { hour: 17, water: [[0, '#e6dfa8'], [0.18, '#a9d2b6'], [0.42, '#4f9aa0'], [0.68, '#255f7c'], [1, '#0c3552']], ray: '#ffe2ad', rayOpacityMul: 0.9, fog: '#7a8a92' },
    { hour: 19, water: [[0, '#f2a56b'], [0.18, '#d97e88'], [0.42, '#79598f'], [0.68, '#3c3f6e'], [1, '#181c3a']], ray: '#ffb27a', rayOpacityMul: 0.65, fog: '#4a4a5c' },
    { hour: 21, water: [[0, '#5f6690'], [0.18, '#454b78'], [0.42, '#2e3358'], [0.68, '#1a1e38'], [1, '#0a0c1e']], ray: '#c9b8ff', rayOpacityMul: 0.40, fog: '#1c2438' },
    { hour: 24, water: [[0, '#2a3a52'], [0.18, '#1c2c44'], [0.42, '#142033'], [0.68, '#0c1624'], [1, '#050a14']], ray: '#aac9ff', rayOpacityMul: 0.30, fog: '#0a1420' }
  ];

  function getTimePalette(hourFraction) {
    hourFraction = ((hourFraction % 24) + 24) % 24;
    var a = TIME_KEYFRAMES[0], b = TIME_KEYFRAMES[TIME_KEYFRAMES.length - 1];
    for (var i = 0; i < TIME_KEYFRAMES.length - 1; i++) {
      if (hourFraction >= TIME_KEYFRAMES[i].hour && hourFraction <= TIME_KEYFRAMES[i + 1].hour) {
        a = TIME_KEYFRAMES[i]; b = TIME_KEYFRAMES[i + 1];
        break;
      }
    }
    var span = (b.hour - a.hour) || 1;
    var t = CanvasUtils.clamp((hourFraction - a.hour) / span, 0, 1);
    return {
      waterStops: a.water.map(function (stop, idx) {
        return [stop[0], CanvasUtils.lerpHexColor(stop[1], b.water[idx][1], t)];
      }),
      rayColor: CanvasUtils.lerpHexColor(a.ray, b.ray, t),
      rayOpacityMul: CanvasUtils.lerp(a.rayOpacityMul, b.rayOpacityMul, t),
      fogColor: CanvasUtils.lerpHexColor(a.fog, b.fog, t)
    };
  }

  // ---- Neblina de profundidade ----
  // Quanto mais ao fundo (depth menor), mais a cor original se mistura com
  // a cor "ambiente" do horário atual - fica mais escuro E com menos
  // contraste/visibilidade, como luz se espalhando na água. FOG_STRENGTH
  // é o quanto isso pesa no total.
  var FOG_STRENGTH = 0.58;

  function fogAmountForDepth(depth) {
    return CanvasUtils.clamp((1 - depth) * FOG_STRENGTH, 0, 0.85);
  }

  function applyFog(hexColor, fogColorHex, depth) {
    return CanvasUtils.lerpHexColor(hexColor, fogColorHex, fogAmountForDepth(depth));
  }

  function applyFogToStops(stops, fogColorHex, depth) {
    var amount = fogAmountForDepth(depth);
    if (amount <= 0) return stops;
    return stops.map(function (s) { return [s[0], CanvasUtils.lerpHexColor(s[1], fogColorHex, amount)]; });
  }

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
  // parede rochosa contínua ao fundo, não picos finos isolados. Nascem
  // em pequenos agrupamentos (não espalhados uniformemente) e cada um tem
  // uma leve inclinação própria - a base nunca é afetada pela inclinação
  // (ela permanece ancorada na duna; só a silhueta acima dela se inclina).
  var ROCK_WALL_DEF = {
    densityRange: [4.6, 7.2],
    minCount: 5, maxCount: 16,
    widthUnitRange: [0.28, 0.52],
    heightUnitRange: [0.22, 0.40],
    pointsRange: [8, 13],
    burialUnitRange: [0.014, 0.032],
    xRange: [-0.10, 1.10],
    clusterCountRange: [2, 4],
    clusterSpreadF: 0.055,
    lonerChance: 0.16,
    tiltDegRange: [-7, 7]
  };

  // Cordilheira bem distante - reaproveita EXATAMENTE a técnica de curva
  // suave das dunas (generateDuneLayout/buildDuneAnchorPoints), só que
  // preenche até o FUNDO do canvas (como as dunas de areia) em vez de
  // parar numa base própria - isso garante que a base nunca fica exposta
  // (paredões/duna desenhados por cima sempre escondem a parte de baixo)
  // e que é uma faixa CONTÍNUA cobrindo toda a largura, sem espaço entre
  // um "pico" e outro. Fica bem ao fundo, mais desbotada que os paredões.
  var FAR_RIDGE_DEF = {
    depth: 0.07,
    baseYf: 0.47,
    amplitudeUnitRange: [0.05, 0.09],
    wavelengthUnitRange: [0.20, 0.32],
    minAnchors: 7, maxAnchors: 14,
    xJitterF: 0.035
  };

  var PEBBLE_LAYER_DEFS = {
    back: { densityRange: [3.0, 5.2], minCount: 4, maxCount: 13, sizeUnitRange: [0.004, 0.015], shadeFactor: 0.6 },
    mid: { densityRange: [3.8, 6.5], minCount: 6, maxCount: 17, sizeUnitRange: [0.006, 0.021], shadeFactor: 0.82 },
    front: { densityRange: [4.6, 8.0], minCount: 8, maxCount: 22, sizeUnitRange: [0.008, 0.030], shadeFactor: 1.0 }
  };
  var PEBBLE_BLOB_POINTS_RANGE = [7, 9];
  var PEBBLE_BLOB_JITTER_RANGE = [0.70, 1.24];

  var SAND_TEXTURE_DEFS = {
    back: { rippleOffsetsUnit: [0.012, 0.026], speckleDensityRange: [9, 16], speckleSizeUnitRange: [0.0018, 0.0042], speckleDepthUnit: 0.05, patchDensityRange: [1, 2], patchSizeUnitRange: [0.05, 0.09] },
    mid: { rippleOffsetsUnit: [0.014, 0.030, 0.048], speckleDensityRange: [13, 22], speckleSizeUnitRange: [0.0022, 0.0052], speckleDepthUnit: 0.065, patchDensityRange: [2, 3], patchSizeUnitRange: [0.05, 0.10] },
    front: { rippleOffsetsUnit: [0.016, 0.034, 0.055], speckleDensityRange: [17, 28], speckleSizeUnitRange: [0.0026, 0.0068], speckleDepthUnit: 0.08, patchDensityRange: [2, 4], patchSizeUnitRange: [0.06, 0.12] }
  };

  // Feixes de luz com bem mais variação (largura, intensidade, comprimento)
  // pra não formar padrão repetitivo - alguns finos e intensos, outros
  // largos e fracos, alguns curtos (somem rápido), outros longos.
  var GOD_RAY_DEF = {
    densityRange: [4.5, 7.5],
    minCount: 4, maxCount: 12,
    widthUnitRange: [0.003, 0.020],
    lengthFracRange: [0.38, 0.88],
    opacityRange: [0.05, 0.24],
    blurUnitRange: [0.004, 0.011],
    baseTiltDegRange: [-8, 8],  // direção geral da luz nessa sessão - todos os raios seguem ela
    tiltJitterDeg: 1.6,          // variação pequena por raio, nunca inverte o sentido
    swaySpeedRange: [0.06, 0.19]
  };

  // Partículas em suspensão, em 3 camadas de profundidade - nunca chamam
  // atenção, só reforçam a sensação de profundidade. Fundo: minúsculas e
  // quase transparentes, andam bem devagar. Meio: discretas, poucas,
  // velocidade intermediária. Frente: um pouco maiores, poucas, levemente
  // desfocadas (mais perto = fora de foco), movimento lento.
  var PARTICLE_TIER_DEFS = {
    back: { depth: 0.15, countDivisor: 34000, sizeRange: [0.3, 0.8], speedRange: [1.5, 4], driftRange: [-2, 2], opacityRange: [0.04, 0.10], blurPx: 0 },
    mid: { depth: 0.5, countDivisor: 46000, sizeRange: [0.6, 1.5], speedRange: [4, 9], driftRange: [-5, 5], opacityRange: [0.10, 0.22], blurPx: 0 },
    front: { depth: 0.9, countDivisor: 62000, sizeRange: [1.3, 2.6], speedRange: [3, 7], driftRange: [-4, 4], opacityRange: [0.10, 0.20], blurPx: 1.1 }
  };
  var PARTICLE_TIER_ORDER = ['back', 'mid', 'front'];
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
      textureLayout[key] = { density: CanvasUtils.randRange(rng, def.speckleDensityRange[0], def.speckleDensityRange[1]), seed: pickSeed(rng), patchSeed: pickSeed(rng) };
    });
    return {
      dune: duneLayout,
      rocks: { density: CanvasUtils.randRange(rng, ROCK_WALL_DEF.densityRange[0], ROCK_WALL_DEF.densityRange[1]), seed: pickSeed(rng) },
      farRidge: generateDuneLayout(rng, FAR_RIDGE_DEF),
      pebbles: pebbleLayout,
      sandTexture: textureLayout,
      godRays: { density: CanvasUtils.randRange(rng, GOD_RAY_DEF.densityRange[0], GOD_RAY_DEF.densityRange[1]), seed: pickSeed(rng), baseTiltDeg: CanvasUtils.randRange(rng, GOD_RAY_DEF.baseTiltDegRange[0], GOD_RAY_DEF.baseTiltDegRange[1]) }
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

    // Agrupamento orgânico: a maioria dos rochedos nasce perto de um dos
    // poucos "centros de cluster" da sessão; uma fração pequena vira
    // rochedo solitário. Evita distribuição uniforme/artificial.
    var clusterCount = Math.round(CanvasUtils.randRange(localRng, ROCK_WALL_DEF.clusterCountRange[0], ROCK_WALL_DEF.clusterCountRange[1]));
    var clusterCenters = [];
    for (var c = 0; c < clusterCount; c++) {
      clusterCenters.push(CanvasUtils.randRange(localRng, ROCK_WALL_DEF.xRange[0], ROCK_WALL_DEF.xRange[1]));
    }

    var polys = [];
    for (var i = 0; i < count; i++) {
      var xf;
      if (clusterCenters.length && localRng() > ROCK_WALL_DEF.lonerChance) {
        var center = clusterCenters[Math.floor(localRng() * clusterCenters.length)];
        xf = CanvasUtils.clamp(center + CanvasUtils.randRange(localRng, -ROCK_WALL_DEF.clusterSpreadF, ROCK_WALL_DEF.clusterSpreadF), ROCK_WALL_DEF.xRange[0], ROCK_WALL_DEF.xRange[1]);
      } else {
        xf = CanvasUtils.randRange(localRng, ROCK_WALL_DEF.xRange[0], ROCK_WALL_DEF.xRange[1]);
      }
      var baseX = xf * width;
      var wPx = CanvasUtils.randRange(localRng, ROCK_WALL_DEF.widthUnitRange[0], ROCK_WALL_DEF.widthUnitRange[1]) * refUnit;
      var hPx = CanvasUtils.randRange(localRng, ROCK_WALL_DEF.heightUnitRange[0], ROCK_WALL_DEF.heightUnitRange[1]) * refUnit;
      var burialPx = CanvasUtils.randRange(localRng, ROCK_WALL_DEF.burialUnitRange[0], ROCK_WALL_DEF.burialUnitRange[1]) * refUnit;
      var pointCount = Math.round(CanvasUtils.randRange(localRng, ROCK_WALL_DEF.pointsRange[0], ROCK_WALL_DEF.pointsRange[1]));
      var tiltRad = CanvasUtils.randRange(localRng, ROCK_WALL_DEF.tiltDegRange[0], ROCK_WALL_DEF.tiltDegRange[1]) * Math.PI / 180;

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
        var rawX = baseX - wPx / 2 + u * wPx;
        var rawY = baseY - envelope * jag * hPx;
        // Inclina só a parte acima da base (shear proporcional à altura) -
        // a base em si (envelope=0 nas pontas) nunca se move.
        var shearedX = rawX + (baseY - rawY) * Math.tan(tiltRad);
        profilePts.push({ x: shearedX, y: rawY });
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

  // Manchas amplas e suaves na areia (regiões levemente mais claras/
  // escuras, como marcas deixadas por correntes) - bem maiores e mais
  // sutis que os speckles de grão fino, com seed própria (não reaproveita
  // a sequência dos speckles).
  function buildSandPatches(textureLayout, def, segments, width, height, refUnit) {
    var localRng = CanvasUtils.mulberry32(textureLayout.patchSeed);
    var count = Math.round(CanvasUtils.randRange(localRng, def.patchDensityRange[0], def.patchDensityRange[1]));
    var patches = [];
    for (var i = 0; i < count; i++) {
      var x = localRng() * width;
      var surfaceY = CanvasUtils.sampleSmoothPathY(segments, x);
      var depthPx = CanvasUtils.randRange(localRng, 0.015, def.speckleDepthUnit * 1.4) * refUnit;
      patches.push({
        x: x, y: surfaceY + depthPx,
        r: CanvasUtils.randRange(localRng, def.patchSizeUnitRange[0], def.patchSizeUnitRange[1]) * refUnit,
        lighter: localRng() < 0.5,
        opacity: CanvasUtils.randRange(localRng, 0.05, 0.12)
      });
    }
    return patches;
  }

  function buildGodRays(godRayLayout, width, height, refUnit) {
    var localRng = CanvasUtils.mulberry32(godRayLayout.seed);
    var count = densityCount(godRayLayout.density, width, refUnit, GOD_RAY_DEF.minCount, GOD_RAY_DEF.maxCount);
    var rays = [];
    for (var i = 0; i < count; i++) {
      rays.push({
        xf: CanvasUtils.randRange(localRng, 0.02, 0.98),
        widthUnit: CanvasUtils.randRange(localRng, GOD_RAY_DEF.widthUnitRange[0], GOD_RAY_DEF.widthUnitRange[1]),
        lengthFrac: CanvasUtils.randRange(localRng, GOD_RAY_DEF.lengthFracRange[0], GOD_RAY_DEF.lengthFracRange[1]),
        opacity: CanvasUtils.randRange(localRng, GOD_RAY_DEF.opacityRange[0], GOD_RAY_DEF.opacityRange[1]),
        blurUnit: CanvasUtils.randRange(localRng, GOD_RAY_DEF.blurUnitRange[0], GOD_RAY_DEF.blurUnitRange[1]),
        tiltDeg: godRayLayout.baseTiltDeg + CanvasUtils.randRange(localRng, -GOD_RAY_DEF.tiltJitterDeg, GOD_RAY_DEF.tiltJitterDeg),
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

    var farRidgePts = buildDuneAnchorPoints(layout.farRidge, FAR_RIDGE_DEF, width, height, refUnit);
    var farRidgeSegs = CanvasUtils.buildSmoothSegments(farRidgePts);
    this._farRidgeTracePts = CanvasUtils.traceSmoothPath(farRidgeSegs, -40, width + 40, 64);

    this._pebblesPx = {};
    this._sandSpecklesPx = {};
    this._sandPatchesPx = {};
    DUNE_LAYER_ORDER.forEach(function (key) {
      var segments = self._duneSegments[key];
      self._pebblesPx[key] = buildPebbles(layout.pebbles[key], PEBBLE_LAYER_DEFS[key], segments, width, refUnit);
      self._sandSpecklesPx[key] = buildSandSpeckles(layout.sandTexture[key], SAND_TEXTURE_DEFS[key], segments, width, height, refUnit);
      self._sandPatchesPx[key] = buildSandPatches(layout.sandTexture[key], SAND_TEXTURE_DEFS[key], segments, width, height, refUnit);
    });

    this._godRays = buildGodRays(layout.godRays, width, height, refUnit);
  };

  Background.prototype._seedParticles = function (rng, width, height) {
    var self = this;
    this._particleTiers = {};
    PARTICLE_TIER_ORDER.forEach(function (key) {
      var def = PARTICLE_TIER_DEFS[key];
      var count = Math.max(3, Math.round((width * height) / def.countDivisor));
      var list = [];
      for (var i = 0; i < count; i++) {
        list.push({
          x: rng() * width,
          y: rng() * height,
          r: CanvasUtils.randRange(rng, def.sizeRange[0], def.sizeRange[1]),
          speed: CanvasUtils.randRange(rng, def.speedRange[0], def.speedRange[1]),
          drift: CanvasUtils.randRange(rng, def.driftRange[0], def.driftRange[1]),
          phase: rng() * Math.PI * 2,
          opacity: CanvasUtils.randRange(rng, def.opacityRange[0], def.opacityRange[1])
        });
      }
      self._particleTiers[key] = list;
    });
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
  // Mantido por compatibilidade - equivalente a surfaceYf('front', x).
  Background.prototype.sandSurfaceYf = function (x) {
    return this.surfaceYf('front', x);
  };

  // Versão genérica por camada (back/mid/front) - é isso que permite os
  // componentes nascerem em profundidades diferentes de fato, não só na
  // duna da frente.
  Background.prototype.surfaceYf = function (layerKey, x) {
    var segs = this._duneSegments && this._duneSegments[layerKey];
    if (!segs) return this._height * (DUNE_LAYER_DEFS[layerKey] ? DUNE_LAYER_DEFS[layerKey].baseYf : 0.86);
    return CanvasUtils.sampleSmoothPathY(segs, x);
  };

  // Paleta do horário ATUAL, calculada na hora (não usa cache de draw()) -
  // seguro de chamar durante a montagem da composição, antes do primeiro
  // frame de canvas ter rodado.
  Background.prototype.getPalette = function () {
    return getTimePalette(this._resolveHourFraction());
  };

  // Mesmo cálculo de neblina de profundidade usado pelo terreno - exposto
  // pra quem monta os organismos SVG poder aplicar a MESMA regra de fog,
  // em vez de inventar uma cor separada que não bate com o cenário.
  Background.prototype.getFogAmount = function (depth) {
    return fogAmountForDepth(depth);
  };

  // ---- Obstáculos (evitar nascer em cima de rochedo/pedrinha) ----

  // X livre de rochedo NAQUELE Y (checagem 2D de verdade) - o rochedo é
  // ancorado na curva de trás e cresce pra CIMA a partir dali; um
  // organismo em mid/front fica bem mais embaixo na tela, então X sozinho
  // gera falso-positivo (marca colisão mesmo quando o rochedo termina bem
  // acima de onde o organismo realmente nasce). xWindowPx é a janela em X
  // usada pra amostrar a altura do contorno do rochedo perto desse ponto.
  Background.prototype.isPositionClearOfRocks = function (x, y, marginPx, xWindowPx) {
    if (!this._rockPolys) return true;
    xWindowPx = xWindowPx || 40;
    for (var i = 0; i < this._rockPolys.length; i++) {
      var poly = this._rockPolys[i];
      var minY = Infinity, maxY = -Infinity, found = false;
      for (var j = 0; j < poly.length; j++) {
        if (Math.abs(poly[j].x - x) <= xWindowPx) {
          found = true;
          if (poly[j].y < minY) minY = poly[j].y;
          if (poly[j].y > maxY) maxY = poly[j].y;
        }
      }
      if (found && y >= minY - marginPx && y <= maxY + marginPx) return false;
    }
    return true;
  };

  // Posição livre de pedrinha NAQUELA camada, com margem em px.
  Background.prototype.isPositionClearOfPebbles = function (layerKey, x, y, marginPx) {
    var pebbles = this._pebblesPx && this._pebblesPx[layerKey];
    if (!pebbles) return true;
    for (var i = 0; i < pebbles.length; i++) {
      var p = pebbles[i];
      var dx = x - p.x, dy = y - p.y;
      var minDist = p.r + marginPx;
      if ((dx * dx + dy * dy) < (minDist * minDist)) return false;
    }
    return true;
  };

  // Força um horário específico (0-24, fracionário) pra pré-visualização;
  // null/undefined volta a usar o horário real do aparelho.
  Background.prototype.setTimeOverrideHour = function (hour) {
    this._timeOverrideHour = (hour === null || hour === undefined) ? null : hour;
  };

  Background.prototype._resolveHourFraction = function () {
    if (this._timeOverrideHour !== null && this._timeOverrideHour !== undefined) {
      return this._timeOverrideHour;
    }
    var now = new Date();
    return now.getHours() + now.getMinutes() / 60;
  };

  Background.prototype.update = function (dt) {
    this._time += dt;
    var h = this._height;
    var w = this._width;
    var rng = this._rng;
    var self = this;
    PARTICLE_TIER_ORDER.forEach(function (key) {
      var list = self._particleTiers && self._particleTiers[key];
      if (!list) return;
      list.forEach(function (p) {
        p.y -= p.speed * dt;
        p.x += Math.sin(self._time * 0.5 + p.phase) * p.drift * dt;
        if (p.y < -10) {
          p.y = h + 10;
          if (rng) p.x = rng() * w;
        }
      });
    });
  };

  Background.prototype.draw = function (ctx, camera, width, height) {
    this._width = width;
    this._height = height;

    var palette = getTimePalette(this._resolveHourFraction());
    this._currentPalette = palette;

    // "Respiração" da água: modulação de brilho extremamente sutil e lenta
    // (±1.5%, ciclo de ~2min) - nada perceptível conscientemente, só tira
    // a sensação de imagem estática.
    var breathe = 1 + Math.sin(this._time * 0.05) * 0.015;
    var waterStops = CanvasUtils.scaleStops(palette.waterStops, breathe);

    var waterGrad = CanvasUtils.makeVerticalGradient(ctx, 0, 0, 0, height, waterStops);
    ctx.fillStyle = waterGrad;
    ctx.fillRect(0, 0, width, height);

    this._drawSunPool(ctx, width, height, palette);
    this._drawSurfaceGlow(ctx, width, height, palette);
    this._drawFarRidge(ctx, width, height, camera, palette);
    this._drawGodRays(ctx, width, height, camera, palette);
    this._drawCaustics(ctx, width, height, palette, { zone: 'upper' });
    this._drawParticleTier(ctx, 'back', palette);
    this._drawRockWalls(ctx, camera, palette);

    this._drawDuneLayer(ctx, width, height, camera, 'back', palette);
    this._drawSandTexture(ctx, camera, 'back', palette);
    this._drawPebbleLayer(ctx, camera, 'back', palette);

    this._drawDuneLayer(ctx, width, height, camera, 'mid', palette);
    this._drawSandTexture(ctx, camera, 'mid', palette);
    this._drawPebbleLayer(ctx, camera, 'mid', palette);
    this._drawCaustics(ctx, width, height, palette, { zone: 'mid', opacityMul: 0.55 });
    this._drawParticleTier(ctx, 'mid', palette);

    this._drawDuneLayer(ctx, width, height, camera, 'front', palette);
    this._drawSandTexture(ctx, camera, 'front', palette);
    this._drawPebbleLayer(ctx, camera, 'front', palette);
    this._drawCaustics(ctx, width, height, palette, { zone: 'lower', opacityMul: 0.35 });
    this._drawParticleTier(ctx, 'front', palette);

    this._drawDepthFog(ctx, width, height, palette);
    this._drawVignette(ctx, width, height, palette);
  };

  // Disco solar difuso no topo - reforça a sensação de luz vinda da superfície.
  Background.prototype._drawSunPool = function (ctx, width, height, palette) {
    var cx = width * 0.5 + Math.sin(this._time * 0.03) * width * 0.025;
    var cy = height * 0.04;
    var r = Math.max(width, height) * 0.38;
    ctx.save();
    var grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    grad.addColorStop(0, CanvasUtils.hexToRgba(palette.rayColor, 0.22 * palette.rayOpacityMul));
    grad.addColorStop(0.35, CanvasUtils.hexToRgba(palette.rayColor, 0.08 * palette.rayOpacityMul));
    grad.addColorStop(1, CanvasUtils.hexToRgba(palette.rayColor, 0));
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height * 0.55);
    ctx.restore();
  };

  // Glow suave e largo bem no topo (luz entrando pela superfície) - a
  // "linha" ondula devagar e de forma irregular, nunca marcada/oceânica.
  Background.prototype._drawSurfaceGlow = function (ctx, width, height, palette) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(0, 0);
    for (var x = 0; x <= width; x += 32) {
      var y = Math.sin(x * 0.006 + this._time * 0.035) * height * 0.012
             + Math.sin(x * 0.0021 - this._time * 0.018) * height * 0.018;
      ctx.lineTo(x, Math.max(0, y));
    }
    ctx.lineTo(width, height * 0.12);
    ctx.lineTo(0, height * 0.12);
    ctx.closePath();
    var grad = ctx.createLinearGradient(0, 0, 0, height * 0.12);
    grad.addColorStop(0, CanvasUtils.hexToRgba(palette.rayColor, 0.16 * palette.rayOpacityMul));
    grad.addColorStop(1, CanvasUtils.hexToRgba(palette.rayColor, 0));
    ctx.fillStyle = grad;
    ctx.fill();

    // Ondulações finas de refração na superfície.
    ctx.globalCompositeOperation = 'screen';
    for (var s = 0; s < 5; s++) {
      var sy = height * (0.018 + s * 0.014);
      ctx.beginPath();
      ctx.moveTo(0, sy);
      for (x = 0; x <= width; x += 18) {
        ctx.lineTo(x, sy + Math.sin(x * 0.018 + this._time * 0.45 + s * 1.4) * 2.5
                      + Math.sin(x * 0.007 - this._time * 0.22 + s) * 1.8);
      }
      ctx.strokeStyle = CanvasUtils.hexToRgba(palette.rayColor, 0.22 * palette.rayOpacityMul);
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }
    ctx.restore();
  };

  // Cordilheira bem distante - preenche até o FUNDO do canvas (como uma
  // duna), então nunca tem base reta exposta: os paredões e a duna de trás
  // desenhados por cima sempre cobrem a parte de baixo. É uma faixa
  // contínua (mesma curva suave, sem gaps entre "picos"), bem enevoada e
  // desfocada, quase fundida com a cor de neblina do horário atual.
  Background.prototype._drawFarRidge = function (ctx, width, height, camera, palette) {
    var pts = this._farRidgeTracePts;
    if (!pts) return;
    var refUnit = Math.min(width, height);
    ctx.save();
    var parallax = camera ? camera.parallaxFor(FAR_RIDGE_DEF.depth) : { x: 0, y: 0 };
    ctx.translate(parallax.x * 0.5, parallax.y * 0.1);
    // Blur com teto fixo - em telas grandes, refUnit*fator sozinho passava
    // de 20px e dissolvia a silhueta inteira numa mancha sem forma.
    if ('filter' in ctx) ctx.filter = 'blur(' + CanvasUtils.clamp(refUnit * 0.014, 2, 8) + 'px)';

    var baseColor = applyFog('#3a5468', palette.fogColor, FAR_RIDGE_DEF.depth);
    var highlightColor = applyFog('#4d7088', palette.fogColor, FAR_RIDGE_DEF.depth * 0.8);
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.lineTo(width + 40, height + 40);
    ctx.lineTo(-40, height + 40);
    ctx.closePath();
    ctx.fillStyle = CanvasUtils.hexToRgba(baseColor, 0.65);
    ctx.fill();

    // Realce no crista distante - separa a silhueta do céu aquático.
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    var ridgeRim = CanvasUtils.makeVerticalGradient(ctx, 0, pts[0].y - 6, 0, pts[0].y + 14, [
      [0, CanvasUtils.hexToRgba(highlightColor, 0)],
      [0.45, CanvasUtils.hexToRgba(highlightColor, 0.28)],
      [1, CanvasUtils.hexToRgba(highlightColor, 0)]
    ]);
    ctx.strokeStyle = ridgeRim;
    ctx.lineWidth = 2.5;
    ctx.stroke();

    if ('filter' in ctx) ctx.filter = 'none';
    ctx.restore();
  };

  // Vinheta extremamente sutil - escurece as bordas com um tom azulado,
  // reforça profundidade sem nunca ser percebida conscientemente.
  Background.prototype._drawVignette = function (ctx, width, height, palette) {
    var cx = width / 2, cy = height * 0.42;
    var maxR = Math.sqrt(width * width + height * height) * 0.62;
    var grad = ctx.createRadialGradient(cx, cy, maxR * 0.52, cx, cy, maxR);
    var vColor = CanvasUtils.scaleHexColor(palette.fogColor, 0.45);
    grad.addColorStop(0, CanvasUtils.hexToRgba(vColor, 0));
    grad.addColorStop(1, CanvasUtils.hexToRgba(vColor, 0.28));
    ctx.save();
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  };

  // Feixes de luz finos, com largura/intensidade/comprimento variados por
  // raio (nunca padrão repetitivo), todos na mesma direção geral
  // (baseTiltDeg da sessão + jitter pequeno - nunca cruzam), com desfoque
  // próprio por raio e cor/intensidade do horário atual.
  Background.prototype._drawGodRays = function (ctx, width, height, camera, palette) {
    if (!this._godRays) return;
    var refUnit = Math.min(width, height);
    var self = this;
    ctx.save();
    var parallax = camera ? camera.parallaxFor(0.08) : { x: 0, y: 0 };
    ctx.translate(parallax.x * 0.25, 0);

    // Coluna central difusa - ancora os raios num ponto de luz coerente.
    var colCx = width * 0.5 + Math.sin(this._time * 0.04) * width * 0.02;
    var colGrad = ctx.createLinearGradient(colCx, 0, colCx, height * 0.7);
    colGrad.addColorStop(0, CanvasUtils.hexToRgba(palette.rayColor, 0.16 * palette.rayOpacityMul));
    colGrad.addColorStop(0.45, CanvasUtils.hexToRgba(palette.rayColor, 0.05 * palette.rayOpacityMul));
    colGrad.addColorStop(1, CanvasUtils.hexToRgba(palette.rayColor, 0));
    ctx.fillStyle = colGrad;
    ctx.fillRect(colCx - width * 0.2, 0, width * 0.4, height * 0.7);

    this._godRays.forEach(function (ray) {
      var sway = Math.sin(self._time * ray.swaySpeed + ray.phase) * refUnit * 0.018;
      var topX = ray.xf * width + sway;
      var rayLen = height * ray.lengthFrac;
      var tiltPx = Math.tan(ray.tiltDeg * Math.PI / 180) * rayLen;
      var bottomX = topX + tiltPx;
      var rayW = Math.max(1, ray.widthUnit * refUnit);
      var opacity = ray.opacity * palette.rayOpacityMul;

      if ('filter' in ctx) ctx.filter = 'blur(' + CanvasUtils.clamp(ray.blurUnit * refUnit, 1, 6) + 'px)';

      var grad = ctx.createLinearGradient(topX, 0, bottomX, rayLen);
      grad.addColorStop(0, CanvasUtils.hexToRgba(palette.rayColor, opacity));
      grad.addColorStop(0.3, CanvasUtils.hexToRgba(palette.rayColor, opacity * 0.65));
      grad.addColorStop(0.55, CanvasUtils.hexToRgba(palette.rayColor, opacity * 0.28));
      grad.addColorStop(1, CanvasUtils.hexToRgba(palette.rayColor, 0));
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
  // fundo), base sempre afundada na curva real da duna de trás. Cor
  // misturada com a neblina de profundidade (ficam mais hazy/escuros).
  Background.prototype._drawRockWalls = function (ctx, camera, palette) {
    if (!this._rockPolys) return;
    ctx.save();
    var parallax = camera ? camera.parallaxFor(0.25) : { x: 0, y: 0 };
    ctx.translate(parallax.x * 0.4, parallax.y * 0.15);

    var rockStops = applyFogToStops([
      [0, '#3d5b6e'],
      [0.55, '#223742'],
      [1, '#0f1c24']
    ], palette.fogColor, 0.25);

    this._rockPolys.forEach(function (points) {
      var top = points.reduce(function (m, p) { return Math.min(m, p.y); }, Infinity);
      var bottom = points[0].y;
      var centerX = points.reduce(function (s, p) { return s + p.x; }, 0) / points.length;
      var grad = CanvasUtils.makeVerticalGradient(ctx, centerX, top, centerX, bottom, rockStops);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (var i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
      ctx.closePath();
      ctx.fill();

      // Variação de face - clareia o topo, escurece a base interna.
      var faceGrad = CanvasUtils.makeVerticalGradient(ctx, centerX, top, centerX, bottom, [
        [0, 'rgba(180,210,220,0.10)'],
        [0.25, 'rgba(0,0,0,0)'],
        [0.65, 'rgba(0,0,0,0.06)'],
        [1, 'rgba(0,0,0,0.18)']
      ]);
      ctx.fillStyle = faceGrad;
      ctx.fill();

      // realce sutil no contorno superior - dá volume, sem contorno preto
      var rimGrad = CanvasUtils.makeVerticalGradient(ctx, 0, top - 4, 0, top + 10, [
        [0, 'rgba(170,205,220,0.30)'],
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

  // Cáusticas orgânicas - células de luz deformadas que se movem lentamente,
  // simulando refração na superfície. Três zonas (upper|mid|lower) com
  // intensidade decrescente conforme a profundidade.
  Background.prototype._drawCaustics = function (ctx, width, height, palette, opts) {
    opts = opts || {};
    var zone = opts.zone || 'upper';
    var opacityMul = opts.opacityMul === undefined ? 1 : opts.opacityMul;
    var zoneDef = {
      upper: { yStart: 0.04, ySpan: 0.38, layers: 3, cellDiv: 72, peak: 0.20 },
      mid:   { yStart: 0.22, ySpan: 0.38, layers: 2, cellDiv: 88, peak: 0.14 },
      lower: { yStart: 0.48, ySpan: 0.30, layers: 2, cellDiv: 96, peak: 0.10 }
    }[zone];
    if (!zoneDef) return;

    var refUnit = Math.min(width, height);
    var t = this._time;
    ctx.save();
    ctx.globalCompositeOperation = zone === 'upper' ? 'soft-light' : 'overlay';

    for (var layer = 0; layer < zoneDef.layers; layer++) {
      var cellCount = Math.max(3, Math.round(width / zoneDef.cellDiv));
      var layerPhase = t * (0.22 + layer * 0.11);
      var yBase = height * (zoneDef.yStart + layer * zoneDef.ySpan * 0.22);

      for (var i = 0; i < cellCount; i++) {
        var baseX = (i + 0.5) / cellCount * width;
        var cx = baseX
          + Math.sin(layerPhase + i * 1.9) * refUnit * 0.028
          + Math.sin(layerPhase * 0.6 + i * 0.7) * refUnit * 0.016;
        var cy = yBase
          + Math.sin(layerPhase * 0.45 + i * 2.3) * height * zoneDef.ySpan * 0.18
          + Math.cos(layerPhase * 0.35 + i * 1.1) * refUnit * 0.012;
        var rx = refUnit * (0.034 + Math.sin(layerPhase + i * 0.8) * 0.012);
        var ry = refUnit * (0.022 + Math.cos(layerPhase * 0.7 + i) * 0.008);
        var rot = Math.sin(layerPhase * 0.5 + i * 1.4) * 0.35;
        var peak = zoneDef.peak * opacityMul * palette.rayOpacityMul;

        var grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(rx, ry));
        grad.addColorStop(0, CanvasUtils.hexToRgba(palette.rayColor, peak));
        grad.addColorStop(0.45, CanvasUtils.hexToRgba(palette.rayColor, peak * 0.35));
        grad.addColorStop(1, CanvasUtils.hexToRgba(palette.rayColor, 0));
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, rot, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  };

  Background.prototype._drawParticleTier = function (ctx, key, palette) {
    var list = this._particleTiers && this._particleTiers[key];
    if (!list) return;
    var def = PARTICLE_TIER_DEFS[key];
    ctx.save();
    if (def.blurPx && 'filter' in ctx) ctx.filter = 'blur(' + def.blurPx + 'px)';
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      var tint = palette
        ? CanvasUtils.lerpHexColor('#ffffff', palette.rayColor, def.depth * 0.35)
        : '#ffffff';
      ctx.beginPath();
      ctx.fillStyle = CanvasUtils.hexToRgba(tint, p.opacity);
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    if (def.blurPx && 'filter' in ctx) ctx.filter = 'none';
    ctx.restore();
  };

  // Camada única de duna (back|mid|front) - mesma paleta de areia
  // (SAND_STOPS), escurecida por shadeFactor e misturada com a neblina de
  // profundidade (mais forte quanto mais ao fundo).
  Background.prototype._drawDuneLayer = function (ctx, width, height, camera, key, palette) {
    var pts = this._duneTracePts && this._duneTracePts[key];
    if (!pts) return;
    var def = DUNE_LAYER_DEFS[key];
    var colorStops = applyFogToStops(CanvasUtils.scaleStops(SAND_STOPS, def.shadeFactor), palette.fogColor, def.depth);

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

    // Sombra de contato sob a crista - dá volume à duna.
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    var aoDepth = key === 'front' ? 16 : key === 'mid' ? 12 : 8;
    var aoGrad = ctx.createLinearGradient(0, pts[0].y - 4, 0, pts[0].y + aoDepth);
    aoGrad.addColorStop(0, 'rgba(0,0,0,0)');
    aoGrad.addColorStop(0.4, 'rgba(0,0,0,' + (key === 'front' ? 0.10 : 0.07) + ')');
    aoGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.strokeStyle = aoGrad;
    ctx.lineWidth = aoDepth;
    ctx.lineCap = 'round';
    ctx.stroke();

    var rimGrad = CanvasUtils.makeVerticalGradient(ctx, 0, pts[0].y - 6, 0, pts[0].y + 6, [
      [0, 'rgba(255,255,255,0)'],
      [0.5, def.rimColor],
      [1, 'rgba(255,255,255,0)']
    ]);
    ctx.strokeStyle = rimGrad;
    ctx.lineWidth = key === 'front' ? 3.5 : 2;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();

    // Brilho especular na crista da duna da frente.
    if (key === 'front') {
      var specGrad = CanvasUtils.makeVerticalGradient(ctx, 0, pts[0].y - 3, 0, pts[0].y + 2, [
        [0, 'rgba(255,250,235,0.45)'],
        [1, 'rgba(255,250,235,0)']
      ]);
      ctx.strokeStyle = specGrad;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.stroke();
    }

    ctx.restore();
  };

  // Textura da areia: linhas de contorno "eco" (ondulações) seguindo a
  // mesma curva em profundidades crescentes, mais grão fino (speckles).
  // Cores também passam pela neblina de profundidade.
  Background.prototype._drawSandTexture = function (ctx, camera, key, palette) {
    var pts = this._duneTracePts && this._duneTracePts[key];
    var speckles = this._sandSpecklesPx && this._sandSpecklesPx[key];
    var patches = this._sandPatchesPx && this._sandPatchesPx[key];
    if (!pts) return;
    var def = DUNE_LAYER_DEFS[key];
    var texDef = SAND_TEXTURE_DEFS[key];
    var refUnit = Math.min(this._width, this._height);
    var darkLine = applyFog(CanvasUtils.scaleHexColor(SAND_STOPS[2][1], def.shadeFactor * 0.75), palette.fogColor, def.depth);
    var lightLine = applyFog(CanvasUtils.scaleHexColor(SAND_STOPS[0][1], Math.min(1, def.shadeFactor * 1.15)), palette.fogColor, def.depth);

    ctx.save();
    var parallax = camera ? camera.parallaxFor(def.depth) : { x: 0, y: 0 };
    ctx.translate(parallax.x, parallax.y * 0.3);

    if (patches) {
      patches.forEach(function (patch) {
        var tone = patch.lighter ? lightLine : darkLine;
        var grad = ctx.createRadialGradient(patch.x, patch.y, 0, patch.x, patch.y, patch.r);
        grad.addColorStop(0, CanvasUtils.hexToRgba(tone, patch.opacity));
        grad.addColorStop(1, CanvasUtils.hexToRgba(tone, 0));
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(patch.x, patch.y, patch.r, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    texDef.rippleOffsetsUnit.forEach(function (offUnit, idx) {
      var offset = offUnit * refUnit;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y + offset);
      for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y + offset);
      ctx.strokeStyle = idx % 2 === 0 ? darkLine : lightLine;
      ctx.globalAlpha = key === 'front' ? 0.14 : key === 'mid' ? 0.11 : 0.09;
      ctx.lineWidth = key === 'front' ? 1.4 : 1.2;
      ctx.stroke();
    });
    ctx.globalAlpha = 1;

    if (speckles) {
      speckles.forEach(function (s) {
        ctx.beginPath();
        ctx.fillStyle = applyFog(CanvasUtils.scaleHexColor(SAND_STOPS[1][1], def.shadeFactor * s.tone), palette.fogColor, def.depth);
        ctx.globalAlpha = s.opacity;
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1;
    }

    ctx.restore();
  };

  // Pedrinhas de uma camada - blob orgânico irregular, sempre no Y real
  // da curva daquela camada, com sombra de contato. Cor passa pela
  // neblina de profundidade também.
  Background.prototype._drawPebbleLayer = function (ctx, camera, key, palette) {
    var pebbles = this._pebblesPx && this._pebblesPx[key];
    if (!pebbles || pebbles.length === 0) return;
    var def = DUNE_LAYER_DEFS[key];
    var shadeFactor = PEBBLE_LAYER_DEFS[key].shadeFactor;

    ctx.save();
    var parallax = camera ? camera.parallaxFor(def.depth) : { x: 0, y: 0 };
    ctx.translate(parallax.x, parallax.y * 0.3);

    pebbles.forEach(function (p) {
      var variant = PEBBLE_VARIANTS[p.colorVariant] || PEBBLE_VARIANTS[0];
      var topColor = applyFog(CanvasUtils.scaleHexColor(variant.top, shadeFactor), palette.fogColor, def.depth);
      var bottomColor = applyFog(CanvasUtils.scaleHexColor(variant.bottom, shadeFactor), palette.fogColor, def.depth);

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

  // Neblina do fundo do poço d'água (parte de baixo da tela) - usa a
  // mesma cor "ambiente" do horário atual, então à noite fica bem mais
  // escura/azulada e ao entardecer ganha um tom quente.
  Background.prototype._drawDepthFog = function (ctx, width, height, palette) {
    var fogColor = palette.fogColor;
    var midFog = CanvasUtils.scaleHexColor(fogColor, 0.55);
    var darkFog = CanvasUtils.scaleHexColor(fogColor, 0.35);

    // Neblina intermediária - suaviza a transição água → areia.
    var midGrad = CanvasUtils.makeVerticalGradient(ctx, 0, height * 0.32, 0, height * 0.62, [
      [0, CanvasUtils.hexToRgba(midFog, 0)],
      [0.55, CanvasUtils.hexToRgba(midFog, 0.10)],
      [1, CanvasUtils.hexToRgba(midFog, 0)]
    ]);
    ctx.fillStyle = midGrad;
    ctx.fillRect(0, height * 0.32, width, height * 0.30);

    // Neblina do fundo do poço - mais densa na base.
    var bottomGrad = CanvasUtils.makeVerticalGradient(ctx, 0, height * 0.52, 0, height, [
      [0, CanvasUtils.hexToRgba(darkFog, 0)],
      [0.45, CanvasUtils.hexToRgba(darkFog, 0.18)],
      [1, CanvasUtils.hexToRgba(darkFog, 0.48)]
    ]);
    ctx.fillStyle = bottomGrad;
    ctx.fillRect(0, height * 0.52, width, height * 0.48);
  };

  // Profundidade fixa de cada camada (mesmos valores de DUNE_LAYER_DEFS) -
  // exposta pra composition.js poder alinhar o depth dos organismos à
  // MESMA camada física em que eles nascem, em vez de um número solto.
  Background.LAYER_DEPTHS = {
    back: DUNE_LAYER_DEFS.back.depth,
    mid: DUNE_LAYER_DEFS.mid.depth,
    front: DUNE_LAYER_DEFS.front.depth
  };

  PMV.Themes.Recife.Background = Background;
})(window.PMV = window.PMV || {});
