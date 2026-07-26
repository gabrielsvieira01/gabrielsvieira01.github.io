// Base da cena do Recife — Canvas apenas: água (ciclo dia/noite
// real), penhascos enquadrando os dois lados (2 camadas de
// profundidade cada), leito de areia com textura, bolhas subindo e
// um raio de luz discreto. Corais/peixes/etc. são SVG, em outro
// arquivo — aqui é só o que o Canvas tem permissão de desenhar
// (céu, água, terreno, iluminação, partículas, raios de luz).
(function (PMV) {
  'use strict';

  const { smoothstep, lerpColor, smoothPathThrough, mulberry32 } = PMV.Engine.CanvasUtils;

  // ---- Paletas dia/noite ----------------------------------------
  const WATER_DAY = ['#e0f9f4', '#a9e8e2', '#5ec2d6', '#2f96b8', '#1a6389', '#0d4066'];
  const WATER_NIGHT = ['#212d54', '#1a2647', '#182142', '#141c3c', '#0f1733', '#050814'];
  const WATER_STOPS = [0, 0.18, 0.38, 0.6, 0.8, 1];

  const SAND_DAY = ['#f0e0b4', '#d8b978', '#8a6b3f'];
  const SAND_NIGHT = ['#2c2c40', '#242438', '#12121c'];
  const SAND_STOPS = [0, 0.45, 1];

  const ROCK_DAY = ['#a99878', '#5c4e38'];
  const ROCK_NIGHT = ['#22222f', '#0e0e16'];

  const CLIFF_FAR_DAY = ['#3d6577', '#1d3c4c'];
  const CLIFF_FAR_NIGHT = ['#131e2f', '#080f1a'];
  const CLIFF_NEAR_DAY = ['#2c5063', '#123040'];
  const CLIFF_NEAR_NIGHT = ['#0f1826', '#060b13'];

  // ---- Leito de areia (hand-authored, escala por fração) --------
  const SAND_POINTS = [
    { xf: -0.08, yf: 0.83 },
    { xf: 0.16, yf: 0.70 },
    { xf: 0.40, yf: 0.80 },
    { xf: 0.66, yf: 0.65 },
    { xf: 0.88, yf: 0.77 },
    { xf: 1.08, yf: 0.71 }
  ];

  const ROCKS = [
    { xf: 0.40, yf: 0.797, rxf: 0.045, ryf: 0.030 },
    { xf: 0.635, yf: 0.688, rxf: 0.030, ryf: 0.022 }
  ];

  const SAND_SEGMENTS = PMV.Engine.CanvasUtils.buildSmoothSegments(
    SAND_POINTS.map((p) => ({ x: p.xf, y: p.yf }))
  );

  // Altura (yf) real da curva de areia num x qualquer — não uma
  // aproximação pelos pontos autorais (ver nota histórica: eles só
  // controlam a curva, não ficam sobre ela).
  function sandSurfaceYf(xf) {
    return PMV.Engine.CanvasUtils.sampleSmoothPathY(SAND_SEGMENTS, xf);
  }

  // ---- Penhascos (hand-authored, 2 camadas de profundidade) ------
  // `inset` = o quanto o penhasco invade a tela a partir da borda,
  // como fração da largura. `t` = posição vertical (0 topo, 1 base).
  const CLIFF_LEFT_FAR = [
    { t: 0.0, inset: 0.14 }, { t: 0.07, inset: 0.19 }, { t: 0.15, inset: 0.09 },
    { t: 0.24, inset: 0.17 }, { t: 0.34, inset: 0.07 }, { t: 0.45, inset: 0.13 },
    { t: 0.57, inset: 0.05 }, { t: 0.7, inset: 0.10 }, { t: 0.85, inset: 0.03 },
    { t: 1.0, inset: 0.06 }
  ];
  const CLIFF_LEFT_NEAR = [
    { t: 0.0, inset: 0.07 }, { t: 0.1, inset: 0.11 }, { t: 0.2, inset: 0.04 },
    { t: 0.32, inset: 0.09 }, { t: 0.46, inset: 0.03 }, { t: 0.6, inset: 0.065 },
    { t: 0.76, inset: 0.02 }, { t: 0.9, inset: 0.045 }, { t: 1.0, inset: 0.0 }
  ];
  const CLIFF_RIGHT_FAR = [
    { t: 0.0, inset: 0.10 }, { t: 0.08, inset: 0.16 }, { t: 0.18, inset: 0.06 },
    { t: 0.29, inset: 0.14 }, { t: 0.40, inset: 0.05 }, { t: 0.53, inset: 0.115 },
    { t: 0.66, inset: 0.04 }, { t: 0.80, inset: 0.08 }, { t: 0.92, inset: 0.025 },
    { t: 1.0, inset: 0.05 }
  ];
  const CLIFF_RIGHT_NEAR = [
    { t: 0.0, inset: 0.03 }, { t: 0.12, inset: 0.065 }, { t: 0.24, inset: 0.02 },
    { t: 0.38, inset: 0.055 }, { t: 0.52, inset: 0.015 }, { t: 0.66, inset: 0.04 },
    { t: 0.82, inset: 0.012 }, { t: 1.0, inset: 0.0 }
  ];

  function drawCliff(ctx, width, height, points, side, colorTop, colorBottom, opacity) {
    const edgeX = side === 'left' ? 0 : width;
    const pts = [{ x: edgeX, y: 0 }];
    points.forEach((p) => {
      const x = side === 'left' ? width * p.inset : width * (1 - p.inset);
      pts.push({ x, y: height * p.t });
    });
    pts.push({ x: edgeX, y: height });

    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.beginPath();
    smoothPathThrough(ctx, pts);
    ctx.closePath();

    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, colorTop);
    gradient.addColorStop(1, colorBottom);
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.restore();
  }

  function drawCliffs(ctx, width, height, nightFactor) {
    const farTop = lerpColor(CLIFF_FAR_DAY[0], CLIFF_FAR_NIGHT[0], nightFactor);
    const farBottom = lerpColor(CLIFF_FAR_DAY[1], CLIFF_FAR_NIGHT[1], nightFactor);
    const nearTop = lerpColor(CLIFF_NEAR_DAY[0], CLIFF_NEAR_NIGHT[0], nightFactor);
    const nearBottom = lerpColor(CLIFF_NEAR_DAY[1], CLIFF_NEAR_NIGHT[1], nightFactor);

    drawCliff(ctx, width, height, CLIFF_LEFT_FAR, 'left', farTop, farBottom, 0.85);
    drawCliff(ctx, width, height, CLIFF_RIGHT_FAR, 'right', farTop, farBottom, 0.85);
    drawCliff(ctx, width, height, CLIFF_LEFT_NEAR, 'left', nearTop, nearBottom, 1);
    drawCliff(ctx, width, height, CLIFF_RIGHT_NEAR, 'right', nearTop, nearBottom, 1);
  }

  // ---- Água -------------------------------------------------------
  function drawWater(ctx, width, height, nightFactor) {
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    WATER_STOPS.forEach((stop, i) => {
      gradient.addColorStop(stop, lerpColor(WATER_DAY[i], WATER_NIGHT[i], nightFactor));
    });
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    const glow = ctx.createRadialGradient(width * 0.5, 0, 0, width * 0.5, 0, height * 0.9);
    const glowAlpha = 0.16 * (1 - nightFactor);
    glow.addColorStop(0, `rgba(255, 255, 255, ${glowAlpha})`);
    glow.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);
  }

  // ---- Raios de luz (discretos, diagonais, fixos) -----------------
  const LIGHT_SHAFTS = [
    { xf: 0.62, widthf: 0.09, angle: 12 },
    { xf: 0.78, widthf: 0.06, angle: 12 }
  ];

  function drawLightShafts(ctx, width, height, nightFactor) {
    const alpha = 0.05 * (1 - nightFactor * 0.72);
    if (alpha <= 0.002) return;

    LIGHT_SHAFTS.forEach((shaft) => {
      ctx.save();
      ctx.translate(width * shaft.xf, 0);
      ctx.rotate((shaft.angle * Math.PI) / 180);
      const w = width * shaft.widthf;
      const gradient = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
      gradient.addColorStop(0, 'rgba(255,255,255,0)');
      gradient.addColorStop(0.5, `rgba(255,255,255,${alpha})`);
      gradient.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(-w / 2, 0, w, height * 1.1);
      ctx.restore();
    });
  }

  // ---- Bolhas (partículas, seed fixa) -----------------------------
  const BUBBLES = (function () {
    const rng = mulberry32(2024);
    const list = [];
    for (let i = 0; i < 16; i++) {
      list.push({
        xf: rng(),
        rf: 0.0018 + rng() * 0.003,
        speed: 0.012 + rng() * 0.014,
        phase: rng(),
        driftAmp: 6 + rng() * 10,
        driftSpeed: 0.6 + rng() * 0.5
      });
    }
    return list;
  })();

  function drawBubbles(ctx, width, height, elapsedMs, nightFactor) {
    const t = elapsedMs / 1000;
    ctx.save();
    BUBBLES.forEach((b) => {
      const cycle = ((t * b.speed + b.phase) % 1 + 1) % 1;
      const y = height * (1 - cycle) - height * 0.05;
      if (y < height * 0.02 || y > height * 0.98) return;
      const x = width * b.xf + Math.sin(t * b.driftSpeed + b.phase * 10) * b.driftAmp;
      const r = width * b.rf;

      const alpha = (0.22 * (1 - nightFactor * 0.5)) * Math.sin(cycle * Math.PI);
      const gradient = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r);
      gradient.addColorStop(0, `rgba(255,255,255,${alpha})`);
      gradient.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
  }

  // ---- Rochas soltas na areia -------------------------------------
  function drawRocks(ctx, width, height, nightFactor) {
    ROCKS.forEach((rock) => {
      const cx = width * rock.xf;
      const cy = height * rock.yf;
      const rx = width * rock.rxf;
      const ry = height * rock.ryf;

      const gradient = ctx.createLinearGradient(cx, cy - ry, cx, cy + ry);
      gradient.addColorStop(0, lerpColor(ROCK_DAY[0], ROCK_NIGHT[0], nightFactor));
      gradient.addColorStop(1, lerpColor(ROCK_DAY[1], ROCK_NIGHT[1], nightFactor));

      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, Math.PI, 0, false);
      ctx.closePath();
      ctx.fillStyle = gradient;
      ctx.fill();
    });
  }

  // ---- Textura da areia (grãos/seixos discretos, seed fixa) -------
  const SAND_SPECKLES = (function () {
    const rng = mulberry32(777);
    const list = [];
    for (let i = 0; i < 24; i++) {
      list.push({
        xf: rng(),
        depthT: rng(),
        rf: 0.0016 + rng() * 0.0026,
        dark: rng() > 0.45
      });
    }
    return list;
  })();

  function drawSandTexture(ctx, width, height, nightFactor) {
    ctx.save();
    SAND_SPECKLES.forEach((s) => {
      const yf = sandSurfaceYf(s.xf) + s.depthT * 0.15;
      const x = s.xf * width;
      const y = yf * height;
      const r = s.rf * height;

      const alpha = s.dark ? 0.16 : 0.20 * (1 - nightFactor * 0.6);
      ctx.fillStyle = s.dark ? `rgba(60,45,25,${alpha})` : `rgba(255,244,214,${alpha})`;
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * 0.6, 0, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
  }

  function drawSand(ctx, width, height, nightFactor) {
    const points = SAND_POINTS.map((p) => ({ x: p.xf * width, y: p.yf * height }));
    const topY = Math.min(...points.map((p) => p.y));

    ctx.beginPath();
    smoothPathThrough(ctx, points);
    ctx.lineTo(width * 1.08, height);
    ctx.lineTo(width * -0.08, height);
    ctx.closePath();

    const gradient = ctx.createLinearGradient(0, topY, 0, height);
    SAND_STOPS.forEach((stop, i) => {
      gradient.addColorStop(stop, lerpColor(SAND_DAY[i], SAND_NIGHT[i], nightFactor));
    });
    ctx.fillStyle = gradient;
    ctx.fill();

    drawSandTexture(ctx, width, height, nightFactor);

    ctx.beginPath();
    smoothPathThrough(ctx, points);
    ctx.lineWidth = Math.max(1, height * 0.004);
    ctx.strokeStyle = nightFactor > 0.5
      ? `rgba(140, 160, 200, ${0.10 * (1 - (nightFactor - 0.5) * 2)})`
      : `rgba(255, 244, 214, ${0.22 * (1 - nightFactor)})`;
    ctx.stroke();
  }

  function computeNightFactor(date) {
    const hours = date.getHours() + date.getMinutes() / 60;
    const dawnStart = 4.5, dawnEnd = 6.5;
    const duskStart = 17.5, duskEnd = 19.5;

    if (hours < dawnStart || hours >= duskEnd) return 1;
    if (hours >= dawnEnd && hours < duskStart) return 0;
    if (hours < dawnEnd) return 1 - smoothstep((hours - dawnStart) / (dawnEnd - dawnStart));
    return smoothstep((hours - duskStart) / (duskEnd - duskStart));
  }

  function drawBackground(ctx, width, height, elapsedMs) {
    const nightFactor = computeNightFactor(new Date());

    drawWater(ctx, width, height, nightFactor);
    drawLightShafts(ctx, width, height, nightFactor);
    drawCliffs(ctx, width, height, nightFactor);
    drawRocks(ctx, width, height, nightFactor);
    drawSand(ctx, width, height, nightFactor);
    drawBubbles(ctx, width, height, elapsedMs, nightFactor);
  }

  PMV.Themes = PMV.Themes || {};
  PMV.Themes.Recife = PMV.Themes.Recife || {};
  PMV.Themes.Recife.drawBackground = drawBackground;
  PMV.Themes.Recife.sandSurfaceYf = sandSurfaceYf;
  PMV.Themes.Recife.computeNightFactor = computeNightFactor;
})(window.PMV = window.PMV || {});
