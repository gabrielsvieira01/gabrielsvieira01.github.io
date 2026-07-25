// Etapa 1 — Base da cena do Recife.
// Desenha só o que é responsabilidade do Canvas: água (com ciclo
// dia/noite baseado no horário real do dispositivo) e o leito de
// areia. Corais, peixes e demais elementos SVG chegam a partir da
// Etapa 2 — aqui a tela ainda não conhece nenhum componente.
(function (PMV) {
  'use strict';

  const { smoothstep, lerpColor, smoothPathThrough } = PMV.Engine.CanvasUtils;

  // Paletas dia/noite. Poucas cores, transição suave — sem
  // contrastes duros, para manter o clima de ilustração.
  const WATER_DAY = ['#cdf4ef', '#5ec2d6', '#1f7fa8', '#0d4066'];
  const WATER_NIGHT = ['#1a2647', '#141c3c', '#0d1430', '#050814'];
  const WATER_STOPS = [0, 0.35, 0.65, 1];

  const SAND_DAY = ['#e9d6a8', '#8a6b3f'];
  const SAND_NIGHT = ['#262638', '#12121c'];

  const ROCK_DAY = ['#a99878', '#5c4e38'];
  const ROCK_NIGHT = ['#22222f', '#0e0e16'];

  // Silhueta do leito de areia, desenhada à mão como fração da
  // tela (assim ela escala junto com o resize). As pontas passam
  // de 0 e de 1 de propósito, pra curva "sair" da tela sem deixar
  // quina visível nas bordas.
  const SAND_POINTS = [
    { xf: -0.08, yf: 0.83 },
    { xf: 0.16, yf: 0.70 },
    { xf: 0.40, yf: 0.80 },
    { xf: 0.66, yf: 0.65 },
    { xf: 0.88, yf: 0.77 },
    { xf: 1.08, yf: 0.71 }
  ];

  // Duas pedras discretas, meio enterradas nas depressões da duna.
  const ROCKS = [
    { xf: 0.40, yf: 0.797, rxf: 0.045, ryf: 0.030 },
    { xf: 0.635, yf: 0.688, rxf: 0.030, ryf: 0.022 }
  ];

  // Altura (yf) da superfície da areia num x qualquer (xf, 0-1) —
  // interpolação suave entre os pontos autorais da duna. Usada pela
  // Etapa 2 pra encaixar coral/anêmona/alga na altura certa do
  // terreno, sem precisar redesenhar a curva do zero.
  function sandSurfaceYf(xf) {
    const pts = SAND_POINTS;
    const clamped = Math.max(pts[0].xf, Math.min(pts[pts.length - 1].xf, xf));

    for (let i = 0; i < pts.length - 1; i++) {
      if (clamped >= pts[i].xf && clamped <= pts[i + 1].xf) {
        const t = (clamped - pts[i].xf) / (pts[i + 1].xf - pts[i].xf);
        return pts[i].yf + (pts[i + 1].yf - pts[i].yf) * smoothstep(t);
      }
    }
    return pts[pts.length - 1].yf;
  }

  // Fator de 0 (dia pleno) a 1 (noite plena), com transições
  // suaves no amanhecer e no entardecer — baseado no relógio real.
  function computeNightFactor(date) {
    const hours = date.getHours() + date.getMinutes() / 60;
    const dawnStart = 4.5, dawnEnd = 6.5;
    const duskStart = 17.5, duskEnd = 19.5;

    if (hours < dawnStart || hours >= duskEnd) return 1;
    if (hours >= dawnEnd && hours < duskStart) return 0;

    if (hours < dawnEnd) {
      return 1 - smoothstep((hours - dawnStart) / (dawnEnd - dawnStart));
    }
    return smoothstep((hours - duskStart) / (duskEnd - duskStart));
  }

  function drawWater(ctx, width, height, nightFactor) {
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    WATER_STOPS.forEach((stop, i) => {
      gradient.addColorStop(stop, lerpColor(WATER_DAY[i], WATER_NIGHT[i], nightFactor));
    });
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    // Leve queda de luz vinda da superfície — quase some à noite.
    const glow = ctx.createRadialGradient(
      width * 0.5, 0, 0,
      width * 0.5, 0, height * 0.9
    );
    const glowAlpha = 0.16 * (1 - nightFactor);
    glow.addColorStop(0, `rgba(255, 255, 255, ${glowAlpha})`);
    glow.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);
  }

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

  function drawSand(ctx, width, height, nightFactor) {
    const points = SAND_POINTS.map((p) => ({ x: p.xf * width, y: p.yf * height }));
    const topY = Math.min(...points.map((p) => p.y));

    ctx.beginPath();
    smoothPathThrough(ctx, points);
    ctx.lineTo(width * 1.08, height);
    ctx.lineTo(width * -0.08, height);
    ctx.closePath();

    const gradient = ctx.createLinearGradient(0, topY, 0, height);
    gradient.addColorStop(0, lerpColor(SAND_DAY[0], SAND_NIGHT[0], nightFactor));
    gradient.addColorStop(1, lerpColor(SAND_DAY[1], SAND_NIGHT[1], nightFactor));
    ctx.fillStyle = gradient;
    ctx.fill();

    // Friso claro no topo da duna — luz raspando a areia.
    ctx.beginPath();
    smoothPathThrough(ctx, points);
    ctx.lineWidth = Math.max(1, height * 0.004);
    ctx.strokeStyle = nightFactor > 0.5
      ? `rgba(140, 160, 200, ${0.10 * (1 - (nightFactor - 0.5) * 2)})`
      : `rgba(255, 244, 214, ${0.22 * (1 - nightFactor)})`;
    ctx.stroke();
  }

  // elapsedMs ainda não é usado aqui — passa a animar a cena
  // (balanço de algas, cintilação da água) a partir da Etapa 6.
  function drawBackground(ctx, width, height, elapsedMs) {
    const nightFactor = computeNightFactor(new Date());

    drawWater(ctx, width, height, nightFactor);
    drawRocks(ctx, width, height, nightFactor);
    drawSand(ctx, width, height, nightFactor);
  }

  PMV.Themes = PMV.Themes || {};
  PMV.Themes.Recife = PMV.Themes.Recife || {};
  PMV.Themes.Recife.drawBackground = drawBackground;
  PMV.Themes.Recife.sandSurfaceYf = sandSurfaceYf;
  PMV.Themes.Recife.computeNightFactor = computeNightFactor;
})(window.PMV = window.PMV || {});
