(() => {
  const TAU = Math.PI * 2;
  const SVG_NS = "http://www.w3.org/2000/svg";
  const VIEW = { w: 1600, h: 900 };

  const THEMES = {
    reef: {
      label: "Recife",
      canvas: {
        skyTop: "#0a2742",
        skyMid: "#0e4e77",
        skyBot: "#167193",
        groundTop: "#053247",
        groundBot: "#031d2e",
        mist: "rgba(171,240,255,0.12)",
        water: true
      },
      focusPoint: { x: 800, y: 620 },
      baseScale: 1.0,
      palette: ["#66e7ff", "#39c9ff", "#7bf1c2", "#93ffd7", "#e6fff7", "#ffe28a", "#ff7db0"],
      seeds: [
        { kind: "coral", x: 340, y: 670, size: 0.88, color: "#ff8d87", progress: 0.65 },
        { kind: "coral", x: 450, y: 690, size: 1.04, color: "#ff6da8", progress: 0.52 },
        { kind: "coral", x: 560, y: 700, size: 0.74, color: "#ffbf6b", progress: 0.48 },
        { kind: "anemone", x: 685, y: 725, size: 0.72, color: "#8af2e3", progress: 0.42 },
        { kind: "algae", x: 980, y: 710, size: 0.9, color: "#77e4ad", progress: 0.44 }
      ]
    },
    park: {
      label: "Parque",
      canvas: {
        skyTop: "#21305f",
        skyMid: "#4a69a7",
        skyBot: "#b2d0ff",
        groundTop: "#2f4d34",
        groundBot: "#18321b",
        mist: "rgba(255,255,255,0.07)",
        water: false
      },
      focusPoint: { x: 790, y: 615 },
      baseScale: 1.0,
      palette: ["#ffd76e", "#ff9d6e", "#9fdcff", "#8cf0b7", "#fff3bf", "#f6a8ff"],
      seeds: [
        { kind: "ferris", x: 930, y: 520, size: 1.0, color: "#ffd76e", progress: 0.48 },
        { kind: "booth", x: 560, y: 690, size: 0.82, color: "#9fdcff", progress: 0.42 },
        { kind: "arch", x: 720, y: 705, size: 0.92, color: "#8cf0b7", progress: 0.45 },
        { kind: "lamp", x: 1100, y: 720, size: 0.8, color: "#fff3bf", progress: 0.33 },
        { kind: "trail", x: 770, y: 760, size: 1, color: "#ffffff", progress: 0.5 }
      ]
    },
    camp: {
      label: "Acampamento",
      canvas: {
        skyTop: "#13233b",
        skyMid: "#203f61",
        skyBot: "#6f8ea4",
        groundTop: "#42362b",
        groundBot: "#20160f",
        mist: "rgba(250,214,157,0.08)",
        water: false
      },
      focusPoint: { x: 740, y: 655 },
      baseScale: 0.98,
      palette: ["#ffd38a", "#ff9e6b", "#9bffc5", "#8bb7ff", "#fff4c6", "#f7d7a8"],
      seeds: [
        { kind: "campfire", x: 760, y: 710, size: 1.0, color: "#ff9c58", progress: 0.62 },
        { kind: "tent", x: 530, y: 720, size: 0.82, color: "#9bffc5", progress: 0.38 },
        { kind: "tent", x: 940, y: 724, size: 0.98, color: "#8bb7ff", progress: 0.44 },
        { kind: "motorhome", x: 1110, y: 700, size: 0.84, color: "#fff4c6", progress: 0.41 },
        { kind: "pine", x: 310, y: 710, size: 0.86, color: "#7cd38e", progress: 0.33 }
      ]
    },
    garden: {
      label: "Jardim",
      canvas: {
        skyTop: "#1d3247",
        skyMid: "#345b73",
        skyBot: "#8ab2b8",
        groundTop: "#223d2b",
        groundBot: "#142416",
        mist: "rgba(157,255,196,0.08)",
        water: false
      },
      focusPoint: { x: 780, y: 645 },
      baseScale: 1.0,
      palette: ["#9cffb1", "#7ef4d6", "#c5ff7a", "#ffd66e", "#ff91d5", "#8dc7ff"],
      seeds: [
        { kind: "tree", x: 520, y: 650, size: 0.86, color: "#8ef0c5", progress: 0.52 },
        { kind: "tree", x: 960, y: 670, size: 1.0, color: "#a8ff82", progress: 0.46 },
        { kind: "flower", x: 690, y: 725, size: 0.88, color: "#ffd66e", progress: 0.36 },
        { kind: "flower", x: 820, y: 730, size: 0.92, color: "#ff91d5", progress: 0.41 },
        { kind: "flower", x: 1140, y: 720, size: 0.8, color: "#8dc7ff", progress: 0.31 }
      ]
    }
  };

  const state = {
    theme: "reef",
    mode: "focus",
    focusCount: 0,
    targetZoom: 1.0,
    zoom: 1.0,
    targetShift: { x: 0, y: 0 },
    shift: { x: 0, y: 0 },
    time: 0,
    phase: 0,
    rare: null,
    elements: Object.fromEntries(Object.keys(THEMES).map(k => [k, []])),
    particles: createParticles(220),
    stars: createStars(110),
    clouds: createClouds(8)
  };

  const ui = {
    viewport: document.getElementById("sceneViewport"),
    canvas: document.getElementById("bgCanvas"),
    svg: document.getElementById("svgLayer"),
    svgContent: document.getElementById("svgContent"),
    focusCount: document.getElementById("focusCount"),
    zoomLabel: document.getElementById("zoomLabel"),
    themeLabel: document.getElementById("themeLabel"),
    modeLabel: document.getElementById("modeLabel"),
    tabs: [...document.querySelectorAll(".tab")],
    modes: [...document.querySelectorAll(".mode")],
    focusBtn: document.getElementById("focusComplete"),
    rareBtn: document.getElementById("rareEvent")
  };

  const ctx = ui.canvas.getContext("2d", { alpha: false });

  function createParticles(count){
    const arr = [];
    for(let i=0;i<count;i++){
      arr.push({
        x: Math.random(),
        y: Math.random(),
        vx: (Math.random() - 0.5) * 0.004,
        vy: -0.008 - Math.random() * 0.01,
        r: 0.6 + Math.random() * 1.9,
        a: 0.2 + Math.random() * 0.6,
        hue: Math.random()
      });
    }
    return arr;
  }

  function createStars(count){
    const arr = [];
    for(let i=0;i<count;i++){
      arr.push({
        x: Math.random(),
        y: Math.random() * 0.56,
        r: 0.5 + Math.random() * 1.8,
        tw: Math.random() * TAU,
        s: 0.3 + Math.random() * 1.4
      });
    }
    return arr;
  }

  function createClouds(count){
    const arr = [];
    for(let i=0;i<count;i++){
      arr.push({
        x: Math.random() * 1.2 - 0.1,
        y: 0.05 + Math.random() * 0.28,
        w: 160 + Math.random() * 260,
        h: 32 + Math.random() * 72,
        sp: 0.004 + Math.random() * 0.01,
        p: Math.random() * TAU
      });
    }
    return arr;
  }

  function seedTheme(theme){
    if (state.elements[theme].length) return;
    state.elements[theme] = THEMES[theme].seeds.map((seed, index) => ({
      id: `${theme}-${index}-${seed.kind}`,
      ...seed,
      age: Math.random() * 0.9,
      sway: Math.random() * TAU,
      glow: 0,
      built: seed.progress ?? 0.1,
      seed: true
    }));
  }

  Object.keys(THEMES).forEach(seedTheme);

  function setTheme(theme){
    state.theme = theme;
    ui.tabs.forEach(btn => btn.classList.toggle("is-active", btn.dataset.theme === theme));
    ui.tabs.forEach(btn => btn.setAttribute("aria-selected", String(btn.dataset.theme === theme)));
    ui.themeLabel.textContent = THEMES[theme].label;
    state.targetShift = themeCameraShift(theme);
    updateZoomTarget();
  }

  function setMode(mode){
    state.mode = mode;
    ui.modes.forEach(btn => btn.classList.toggle("is-active", btn.dataset.mode === mode));
    ui.modeLabel.textContent = mode === "focus" ? "Foco" : mode === "pause" ? "Pausa" : "Pausa Longa";
    updateZoomTarget();
    if (mode === "pause"){
      state.rare = state.rare && state.rare.mode === "pause" ? state.rare : null;
    }
  }

  function updateZoomTarget(){
    const focusBoost = Math.min(0.22, state.focusCount * 0.015);
    if(state.mode === "focus"){
      state.targetZoom = 1 + focusBoost;
    } else if(state.mode === "pause"){
      state.targetZoom = 0.92 + Math.min(0.08, focusBoost * 0.4);
    } else {
      state.targetZoom = 0.74;
    }
  }

  function themeCameraShift(theme){
    switch(theme){
      case "reef": return { x: 0, y: 12 };
      case "park": return { x: -8, y: 8 };
      case "camp": return { x: 6, y: 16 };
      case "garden": return { x: 0, y: 10 };
      default: return { x: 0, y: 0 };
    }
  }

  function resize(){
    const rect = ui.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    ui.canvas.width = Math.round(rect.width * dpr);
    ui.canvas.height = Math.round(rect.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
  }

  function clamp(v, min, max){ return Math.max(min, Math.min(max, v)); }
  function lerp(a, b, t){ return a + (b - a) * t; }
  function easeInOut(t){ return t < 0.5 ? 2*t*t : 1 - Math.pow(-2*t + 2, 2)/2; }

  function hsl(h, s, l, a = 1){
    return `hsla(${h}, ${s}%, ${l}%, ${a})`;
  }

  function drawCanvas(dt){
    const theme = THEMES[state.theme];
    const w = ui.canvas.clientWidth;
    const h = ui.canvas.clientHeight;
    const ctxW = w, ctxH = h;
    const mode = state.mode;
    const focusBoost = Math.min(0.2, state.focusCount * 0.015);
    const nightMix = mode === "focus" ? 0.05 : mode === "pause" ? 0.42 : 0.66;
    const longMix = mode === "long" ? 1 : 0;
    const skyTop = mixColor(theme.canvas.skyTop, "#02050d", nightMix * 0.7 + longMix * 0.25);
    const skyMid = mixColor(theme.canvas.skyMid, "#0e1730", nightMix * 0.65 + longMix * 0.16);
    const skyBot = mixColor(theme.canvas.skyBot, "#06111f", nightMix * 0.72 + longMix * 0.34);
    const groundTop = mixColor(theme.canvas.groundTop, "#09110d", mode === "pause" ? 0.18 : 0.08);
    const groundBot = mixColor(theme.canvas.groundBot, "#02070a", mode === "pause" ? 0.24 : 0.15);

    const sky = ctx.createLinearGradient(0, 0, 0, ctxH);
    sky.addColorStop(0, skyTop);
    sky.addColorStop(0.55, skyMid);
    sky.addColorStop(1, skyBot);

    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, ctxW, ctxH);

    if (theme.canvas.water){
      const water = ctx.createLinearGradient(0, ctxH * 0.45, 0, ctxH);
      water.addColorStop(0, "rgba(27, 132, 159, 0.22)");
      water.addColorStop(0.55, "rgba(10, 69, 96, 0.52)");
      water.addColorStop(1, "rgba(3, 23, 39, 0.92)");
      ctx.fillStyle = water;
      ctx.fillRect(0, 0, ctxW, ctxH);
    }

    const horizonY = theme.canvas.water ? ctxH * 0.58 : ctxH * 0.67;
    const terrain = ctx.createLinearGradient(0, horizonY, 0, ctxH);
    terrain.addColorStop(0, groundTop);
    terrain.addColorStop(1, groundBot);
    ctx.fillStyle = terrain;
    ctx.beginPath();
    if(theme.canvas.water){
      ctx.moveTo(0, horizonY + 28);
      ctx.bezierCurveTo(ctxW * 0.12, horizonY - 14, ctxW * 0.3, horizonY + 8, ctxW * 0.42, horizonY + 3);
      ctx.bezierCurveTo(ctxW * 0.58, horizonY - 12, ctxW * 0.7, horizonY + 18, ctxW, horizonY + 2);
      ctx.lineTo(ctxW, ctxH);
      ctx.lineTo(0, ctxH);
    } else {
      ctx.moveTo(0, horizonY);
      ctx.bezierCurveTo(ctxW * 0.18, horizonY - 34, ctxW * 0.34, horizonY + 14, ctxW * 0.52, horizonY - 12);
      ctx.bezierCurveTo(ctxW * 0.68, horizonY - 30, ctxW * 0.82, horizonY + 12, ctxW, horizonY - 8);
      ctx.lineTo(ctxW, ctxH);
      ctx.lineTo(0, ctxH);
    }
    ctx.closePath();
    ctx.fill();

    drawClouds(ctx, w, h, mode, focusBoost);
    drawStars(ctx, w, h, mode);
    drawMist(ctx, w, h, mode, longMix);
    drawParticles(ctx, w, h, mode, dt, theme);

    if(theme.canvas.water){
      drawWaterHighlights(ctx, w, h, mode, focusBoost);
    } else {
      drawGroundLight(ctx, w, h, mode, focusBoost);
    }

    drawGlowOrbs(ctx, w, h, mode);
    drawReflectionBand(ctx, w, h, theme, mode);
  }

  function mixColor(a, b, t){
    const pa = hexToRgb(a);
    const pb = hexToRgb(b);
    const r = Math.round(lerp(pa.r, pb.r, t));
    const g = Math.round(lerp(pa.g, pb.g, t));
    const bl = Math.round(lerp(pa.b, pb.b, t));
    return `rgb(${r}, ${g}, ${bl})`;
  }

  function hexToRgb(hex){
    const c = hex.replace("#","");
    const v = c.length === 3 ? c.split("").map(x => x + x).join("") : c;
    const n = parseInt(v, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }

  function drawClouds(ctx, w, h, mode, focusBoost){
    const alpha = mode === "focus" ? 0.17 : mode === "pause" ? 0.23 : 0.14;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "white";
    const now = state.time * 0.00002;
    for(const cloud of state.clouds){
      const x = ((cloud.x + now * cloud.sp) % 1.2) * w - 0.1 * w;
      const y = cloud.y * h + Math.sin(state.time * 0.0004 + cloud.p) * 8;
      const scale = 0.86 + focusBoost * 0.2;
      const cw = cloud.w * scale;
      const ch = cloud.h * scale;
      blobCloud(ctx, x, y, cw, ch);
    }
    ctx.restore();
  }

  function blobCloud(ctx, x, y, w, h){
    ctx.beginPath();
    ctx.ellipse(x, y, w * 0.26, h * 0.42, 0, 0, TAU);
    ctx.ellipse(x + w * 0.18, y - h * 0.12, w * 0.22, h * 0.38, 0, 0, TAU);
    ctx.ellipse(x + w * 0.36, y, w * 0.28, h * 0.4, 0, 0, TAU);
    ctx.ellipse(x + w * 0.58, y - h * 0.06, w * 0.22, h * 0.34, 0, 0, TAU);
    ctx.fill();
  }

  function drawStars(ctx, w, h, mode){
    const alpha = mode === "long" ? 0.95 : mode === "pause" ? 0.55 : 0.15;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    for(const star of state.stars){
      const twinkle = 0.45 + 0.55 * Math.sin(state.time * 0.0012 * star.s + star.tw);
      const size = star.r * (0.75 + twinkle * 0.9);
      const x = star.x * w;
      const y = star.y * h;
      ctx.beginPath();
      ctx.arc(x, y, size, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawMist(ctx, w, h, mode, longMix){
    const alpha = mode === "focus" ? 0.06 : mode === "pause" ? 0.12 : 0.2 + longMix * 0.1;
    ctx.save();
    ctx.globalAlpha = alpha;
    const grad = ctx.createLinearGradient(0, h * 0.45, 0, h);
    grad.addColorStop(0, "rgba(255,255,255,0)");
    grad.addColorStop(0.55, "rgba(255,255,255,0.14)");
    grad.addColorStop(1, "rgba(255,255,255,0.02)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, h * 0.45, w, h * 0.4);
    ctx.restore();
  }

  function drawParticles(ctx, w, h, mode, dt, theme){
    const s = state.particles;
    const rise = mode === "focus" ? 0.55 : mode === "pause" ? 0.2 : 0.12;
    ctx.save();
    for(const p of s){
      p.y -= (0.0008 + rise * 0.0012) * dt;
      p.x += p.vx * dt * 0.06;
      if(p.y < -0.05){
        p.y = 1.02;
        p.x = Math.random();
      }
      if(p.x < -0.05) p.x = 1.05;
      if(p.x > 1.05) p.x = -0.05;
      const px = p.x * w;
      const py = p.y * h;
      const intensity = mode === "focus" ? 0.18 : mode === "pause" ? 0.32 : 0.26;
      ctx.globalAlpha = p.a * intensity;
      ctx.fillStyle = theme.canvas.water ? "rgba(180,255,255,1)" : "rgba(215,255,201,1)";
      ctx.beginPath();
      ctx.arc(px, py, p.r, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawWaterHighlights(ctx, w, h, mode, focusBoost){
    ctx.save();
    const alpha = mode === "focus" ? 0.35 : mode === "pause" ? 0.18 : 0.1;
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = "rgba(145, 240, 255, 0.65)";
    ctx.lineWidth = 2;
    for(let i=0;i<7;i++){
      const y = h * (0.58 + i * 0.04);
      const offset = Math.sin(state.time * 0.001 + i) * 18;
      ctx.beginPath();
      ctx.moveTo(0, y + offset);
      ctx.bezierCurveTo(w * 0.25, y - 12 + offset, w * 0.55, y + 8 + offset, w, y + 1 + offset);
      ctx.stroke();
    }
    ctx.globalAlpha = 0.12 + focusBoost * 0.3;
    const glow = ctx.createRadialGradient(w * 0.5, h * 0.76, 40, w * 0.5, h * 0.76, w * 0.4);
    glow.addColorStop(0, "rgba(110,250,255,0.48)");
    glow.addColorStop(1, "rgba(110,250,255,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  function drawGroundLight(ctx, w, h, mode, focusBoost){
    ctx.save();
    const y = h * 0.82;
    const glow = ctx.createRadialGradient(w * 0.5, y, 40, w * 0.5, y, w * 0.38);
    const alpha = mode === "focus" ? 0.18 : mode === "pause" ? 0.28 : 0.34;
    glow.addColorStop(0, `rgba(255, 218, 130, ${0.36 * alpha + focusBoost * 0.08})`);
    glow.addColorStop(0.5, `rgba(198, 255, 192, ${0.08 * alpha})`);
    glow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  function drawGlowOrbs(ctx, w, h, mode){
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    const orbs = [
      [0.22, 0.18, 85, "rgba(123, 245, 255, 0.15)"],
      [0.74, 0.24, 110, "rgba(255, 195, 114, 0.14)"],
      [0.64, 0.68, 120, "rgba(156, 255, 209, 0.10)"]
    ];
    for(const [ox, oy, r, color] of orbs){
      const a = mode === "focus" ? 0.95 : mode === "pause" ? 1.1 : 1.3;
      const g = ctx.createRadialGradient(ox * w, oy * h, 2, ox * w, oy * h, r * a);
      g.addColorStop(0, color);
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(ox * w, oy * h, r * a, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawReflectionBand(ctx, w, h, theme, mode){
    if(!theme.canvas.water) return;
    ctx.save();
    const y = h * 0.67;
    const g = ctx.createLinearGradient(0, y - 18, 0, y + 120);
    const alpha = mode === "focus" ? 0.4 : mode === "pause" ? 0.2 : 0.12;
    g.addColorStop(0, `rgba(255,255,255,${0})`);
    g.addColorStop(0.4, `rgba(136, 245, 255, ${0.10 * alpha})`);
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, y, w, h - y);
    ctx.restore();
  }

  function updateScene(dt){
    state.time += dt;
    state.phase += dt * 0.0005;

    if(state.mode === "focus"){
      const growthRate = 0.00016 * dt;
      state.elements[state.theme].forEach((item, index) => {
        item.age += dt * 0.00035;
        item.built = clamp(item.built + growthRate * (1 + index * 0.04), 0, 1);
        item.glow = lerp(item.glow, 0.15, 0.04);
      });
      if(Math.random() < dt * 0.00002){
        state.particles[Math.floor(Math.random() * state.particles.length)].a = 0.2 + Math.random() * 0.5;
      }
    } else if(state.mode === "pause"){
      state.elements[state.theme].forEach((item) => {
        item.age += dt * 0.00022;
        item.glow = lerp(item.glow, 0.32, 0.05);
      });
    } else {
      state.elements[state.theme].forEach((item) => {
        item.age += dt * 0.00015;
        item.glow = lerp(item.glow, 0.56, 0.04);
      });
    }

    if(state.rare){
      state.rare.t -= dt;
      if(state.rare.t <= 0) state.rare = null;
    }

    const wobble = Math.sin(state.time * 0.00035) * 0.01;
    state.zoom = lerp(state.zoom, state.targetZoom + wobble, 0.08);
    state.shift.x = lerp(state.shift.x, state.targetShift.x, 0.08);
    state.shift.y = lerp(state.shift.y, state.targetShift.y, 0.08);

    ui.viewport.style.transform = `translate3d(${state.shift.x.toFixed(2)}px, ${state.shift.y.toFixed(2)}px, 0) scale(${state.zoom.toFixed(4)})`;
    ui.zoomLabel.textContent = `${state.zoom.toFixed(2)}×`;
    ui.focusCount.textContent = state.focusCount;
  }

  function renderSVG(){
    const theme = THEMES[state.theme];
    const items = state.elements[state.theme];
    const mode = state.mode;
    const group = [];

    group.push(`<g opacity="1">`);
    group.push(renderWorldBase(theme, mode));

    for(const item of items){
      group.push(renderItem(item, theme, mode));
    }

    if(mode === "pause" || mode === "long"){
      group.push(renderAmbientLife(theme, mode));
    }

    if(state.rare){
      group.push(renderRareEvent(state.rare, theme, mode));
    }

    group.push(`</g>`);
    ui.svgContent.innerHTML = group.join("");
  }

  function renderWorldBase(theme, mode){
    const baseY = theme.label === "Recife" ? 710 : theme.label === "Parque" ? 745 : theme.label === "Acampamento" ? 745 : 730;
    const modeDim = mode === "focus" ? 0.88 : mode === "pause" ? 0.75 : 0.62;
    const baseScale = theme.baseScale;
    const s = [];
    s.push(`<g opacity="${modeDim}">`);
    if(theme.label === "Recife"){
      s.push(svgSeabed(0, 670, 1600, 230, "rgba(8,31,47,0.92)", "rgba(19,72,105,0.65)"));
      s.push(svgBubbles(1040, 470, 10, 0.45));
    } else {
      s.push(svgGround(theme, baseY));
    }
    s.push(svgLightRays(theme, mode));
    s.push(`</g>`);
    return s.join("");
  }

  function svgSeabed(x, y, w, h, c1, c2){
    return `
      <path d="M0 ${y+26}
        C200 ${y-8}, 330 ${y+46}, 510 ${y+22}
        C680 ${y-2}, 860 ${y+30}, 1020 ${y+10}
        C1180 ${y-12}, 1330 ${y+44}, 1600 ${y+18}
        L1600 ${y+h} L0 ${y+h} Z"
        fill="url(#reefGroundGrad)"/>
      <defs>
        <linearGradient id="reefGroundGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${c1}"/>
          <stop offset="100%" stop-color="${c2}"/>
        </linearGradient>
      </defs>
    `;
  }

  function svgGround(theme, baseY){
    const kind = theme.label;
    const top = kind === "Parque" ? "#28462f" : kind === "Acampamento" ? "#3a2e24" : "#233b2a";
    const bottom = kind === "Parque" ? "#182c1a" : kind === "Acampamento" ? "#1c130f" : "#142216";
    const path = kind === "Parque"
      ? `M0 ${baseY-6} C180 ${baseY-32}, 340 ${baseY+14}, 520 ${baseY-8} C710 ${baseY-30}, 860 ${baseY+10}, 1060 ${baseY-2} C1260 ${baseY+16}, 1400 ${baseY-18}, 1600 ${baseY-4} L1600 900 L0 900 Z`
      : kind === "Acampamento"
        ? `M0 ${baseY-10} C220 ${baseY-30}, 400 ${baseY+18}, 610 ${baseY-8} C820 ${baseY+18}, 1020 ${baseY-24}, 1260 ${baseY-10} C1410 ${baseY-2}, 1510 ${baseY+10}, 1600 ${baseY-2} L1600 900 L0 900 Z`
        : `M0 ${baseY-2} C180 ${baseY-24}, 360 ${baseY+18}, 540 ${baseY-8} C730 ${baseY-30}, 920 ${baseY+14}, 1140 ${baseY-6} C1340 ${baseY+12}, 1490 ${baseY-14}, 1600 ${baseY-4} L1600 900 L0 900 Z`;
    return `
      <path d="${path}" fill="url(#groundGrad-${kind.replace(/\s/g,"")})"/>
      <defs>
        <linearGradient id="groundGrad-${kind.replace(/\s/g,"")}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${top}"/>
          <stop offset="100%" stop-color="${bottom}"/>
        </linearGradient>
      </defs>`;
  }

  function svgLightRays(theme, mode){
    const alpha = mode === "focus" ? 0.14 : mode === "pause" ? 0.24 : 0.32;
    const isWater = theme.label === "Recife";
    const gradId = isWater ? "reefRays" : "landRays";
    return `
      <g opacity="${alpha}">
        <rect x="0" y="0" width="1600" height="900" fill="url(#${gradId})"/>
      </g>
      <defs>
        <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${isWater ? "rgba(120,255,245,0.22)" : "rgba(255,235,170,0.18)"}"/>
          <stop offset="58%" stop-color="rgba(255,255,255,0)"/>
          <stop offset="100%" stop-color="rgba(255,255,255,0)"/>
        </linearGradient>
      </defs>
    `;
  }

  function svgBubbles(x, y, count, spread){
    const out = [];
    for(let i=0;i<count;i++){
      const dx = x + (i % 3) * 24 - 18;
      const dy = y - i * 22;
      out.push(`<circle cx="${dx}" cy="${dy}" r="${3 + (i % 4)}" fill="rgba(196,255,255,0.2)"/>`);
    }
    return `<g>${out.join("")}</g>`;
  }

  function renderItem(item, theme, mode){
    const growth = easeInOut(clamp(item.built, 0, 1));
    const sway = Math.sin(state.time * 0.0012 + item.sway) * 5;
    const pulse = 0.86 + Math.sin(state.time * 0.002 + item.sway * 2) * 0.03;
    const appear = 0.15 + growth * 0.85;
    const alpha = mode === "focus" ? 0.97 : mode === "pause" ? 0.94 : 0.9;
    const tx = item.x + sway * 0.5;
    const ty = item.y + Math.sin(state.time * 0.001 + item.sway) * 4;

    switch(item.kind){
      case "coral":
        return `<g class="scene-part" transform="translate(${tx} ${ty}) scale(${item.size * (0.48 + growth * 0.78)})" opacity="${alpha}">
          ${drawCoralSVG(item.color, growth, item.glow)}
        </g>`;
      case "anemone":
        return `<g class="scene-part" transform="translate(${tx} ${ty}) scale(${item.size * (0.52 + growth * 0.72)})" opacity="${alpha}">
          ${drawAnemoneSVG(item.color, growth, item.glow)}
        </g>`;
      case "algae":
        return `<g class="scene-part" transform="translate(${tx} ${ty}) scale(${item.size * (0.7 + growth * 0.5)})" opacity="${alpha}">
          ${drawAlgaeSVG(item.color, growth, item.glow)}
        </g>`;
      case "fish":
        return `<g class="scene-part" transform="translate(${tx} ${ty}) scale(${item.size * pulse})" opacity="${alpha * appear}">
          ${drawFishSVG(item.color, growth, item.glow, item.dir || 1)}
        </g>`;
      case "ferris":
        return `<g class="scene-part" transform="translate(${tx} ${ty}) scale(${item.size * (0.42 + growth * 0.66)})" opacity="${alpha}">
          ${drawFerrisWheelSVG(item.color, growth, item.glow)}
        </g>`;
      case "booth":
        return `<g class="scene-part" transform="translate(${tx} ${ty}) scale(${item.size * (0.52 + growth * 0.62)})" opacity="${alpha}">
          ${drawBoothSVG(item.color, growth, item.glow)}
        </g>`;
      case "arch":
        return `<g class="scene-part" transform="translate(${tx} ${ty}) scale(${item.size * (0.42 + growth * 0.66)})" opacity="${alpha}">
          ${drawArchSVG(item.color, growth, item.glow)}
        </g>`;
      case "lamp":
        return `<g class="scene-part" transform="translate(${tx} ${ty}) scale(${item.size})" opacity="${alpha}">
          ${drawLampSVG(item.color, growth, item.glow, mode)}
        </g>`;
      case "trail":
        return `<g class="scene-part" transform="translate(${tx} ${ty}) scale(${item.size})" opacity="${alpha}">
          ${drawTrailSVG(item.color, growth, item.glow)}
        </g>`;
      case "tent":
        return `<g class="scene-part" transform="translate(${tx} ${ty}) scale(${item.size * (0.5 + growth * 0.68)})" opacity="${alpha}">
          ${drawTentSVG(item.color, growth, item.glow)}
        </g>`;
      case "motorhome":
        return `<g class="scene-part" transform="translate(${tx} ${ty}) scale(${item.size * (0.5 + growth * 0.66)})" opacity="${alpha}">
          ${drawMotorhomeSVG(item.color, growth, item.glow)}
        </g>`;
      case "campfire":
        return `<g class="scene-part" transform="translate(${tx} ${ty}) scale(${item.size * (0.52 + growth * 0.7)})" opacity="${alpha}">
          ${drawCampfireSVG(item.color, growth, item.glow, state.focusCount)}
        </g>`;
      case "pine":
        return `<g class="scene-part" transform="translate(${tx} ${ty}) scale(${item.size * (0.58 + growth * 0.64)})" opacity="${alpha}">
          ${drawPineSVG(item.color, growth, item.glow)}
        </g>`;
      case "tree":
        return `<g class="scene-part" transform="translate(${tx} ${ty}) scale(${item.size * (0.54 + growth * 0.72)})" opacity="${alpha}">
          ${drawTreeSVG(item.color, growth, item.glow)}
        </g>`;
      case "flower":
        return `<g class="scene-part" transform="translate(${tx} ${ty}) scale(${item.size * (0.46 + growth * 0.72)})" opacity="${alpha}">
          ${drawFlowerSVG(item.color, growth, item.glow)}
        </g>`;
      case "bird":
        return `<g class="scene-part" transform="translate(${tx} ${ty}) scale(${item.size})" opacity="${alpha}">
          ${drawBirdSVG(item.color, growth, item.glow, item.dir || 1)}
        </g>`;
      case "lizard":
        return `<g class="scene-part" transform="translate(${tx} ${ty}) scale(${item.size})" opacity="${alpha}">
          ${drawLizardSVG(item.color, growth, item.glow)}
        </g>`;
      default:
        return "";
    }
  }

  function renderAmbientLife(theme, mode){
    const out = [];
    const t = state.time * 0.001;
    if(state.theme === "reef"){
      const fishCount = state.focusCount < 1 ? 2 : Math.min(9, 3 + state.focusCount);
      for(let i=0;i<fishCount;i++){
        const x = 260 + i * 125 + Math.sin(t * 1.1 + i) * 30;
        const y = 510 + Math.sin(t * 1.6 + i * 1.7) * 28;
        out.push(`<g transform="translate(${x} ${y}) scale(${0.55 + (i%3)*0.08}) rotate(${Math.sin(t+i)*6})" opacity="0.92">${drawFishSVG(theme.palette[i % theme.palette.length], 0.95, 0.18, i % 2 ? 1 : -1)}</g>`);
      }
    } else if(state.theme === "park"){
      const lamps = [
        [430, 708], [580, 704], [730, 700], [890, 703], [1040, 708]
      ];
      lamps.forEach((p, i) => {
        out.push(`<g transform="translate(${p[0]} ${p[1]}) scale(0.8)" opacity="0.9">${drawLampSVG(i % 2 ? "#fff3bf" : "#9fdcff", 1, 0.25 + (Math.sin(t + i) * 0.08), "pause")}</g>`);
      });
    } else if(state.theme === "camp"){
      const birds = [
        [430, 210], [540, 170], [780, 145], [1030, 190]
      ];
      birds.forEach((p, i) => {
        out.push(`<g transform="translate(${p[0] + Math.sin(t*0.7+i)*12} ${p[1] + Math.cos(t*0.8+i)*8}) scale(${0.8 + i*0.05}) rotate(${Math.sin(t+i)*4})" opacity="0.86">${drawBirdSVG("#dfe8ff", 0.8, 0.18, i % 2 ? 1 : -1)}</g>`);
      });
    } else if(state.theme === "garden"){
      const creatures = [
        { kind: "bird", x: 500, y: 240, s: 0.82, dir: 1 },
        { kind: "lizard", x: 1020, y: 742, s: 0.76, dir: -1 }
      ];
      creatures.forEach((c, i) => {
        out.push(`<g transform="translate(${c.x + Math.sin(t*0.9+i)*10} ${c.y + Math.cos(t*1.2+i)*5}) scale(${c.s}) rotate(${Math.sin(t+i)*3})" opacity="0.92">${
          c.kind === "bird" ? drawBirdSVG("#eaffea", 0.9, 0.12, c.dir) : drawLizardSVG("#95f0c2", 0.92, 0.15)
        }</g>`);
      });
    }
    return `<g filter="url(#softGlow)">${out.join("")}</g>`;
  }

  function renderRareEvent(rare, theme, mode){
    const t = 1 - clamp(rare.t / rare.life, 0, 1);
    const p = easeInOut(t);
    if(rare.kind === "manta"){
      const x = lerp(-260, 1860, p);
      const y = 310 + Math.sin(p * TAU) * 42;
      return `<g transform="translate(${x} ${y}) scale(1.35) rotate(${Math.sin(p * 8) * 4})" opacity="${0.92 - p * 0.2}">
        ${drawMantaSVG("#9cf8ff", 1, 0.42)}
      </g>`;
    }
    if(rare.kind === "whale"){
      const x = lerp(1880, -360, p);
      const y = 360 + Math.sin(p * TAU * 1.4) * 28;
      return `<g transform="translate(${x} ${y}) scale(1.6) rotate(${Math.sin(p * 4) * 3})" opacity="${0.88}">
        ${drawWhaleSVG("#86e7ff", 1, 0.38)}
      </g>`;
    }
    if(rare.kind === "fireworks"){
      return renderFireworks(rare, p);
    }
    if(rare.kind === "shooting"){
      const x = lerp(1320, 260, p);
      const y = lerp(160, 460, p);
      return `<g transform="translate(${x} ${y}) rotate(-20)" opacity="${0.9}">
        ${drawShootingStarSVG("#ffe8a6", p)}
      </g>`;
    }
    if(rare.kind === "moth"){
      const x = 900 + Math.cos(p * TAU * 2.3) * 120;
      const y = 300 + Math.sin(p * TAU * 3.0) * 85;
      return `<g transform="translate(${x} ${y}) scale(0.95) rotate(${Math.sin(p * 14) * 18})" opacity="${0.96}">
        ${drawMothSVG("#d7b8ff", 1, 0.45)}
      </g>`;
    }
    if(rare.kind === "wisp"){
      const x = 740 + Math.sin(p * TAU * 2) * 220;
      const y = 360 + Math.cos(p * TAU * 2.6) * 120;
      return `<g transform="translate(${x} ${y}) scale(1.1)" opacity="0.98">
        ${drawWispSVG("#98ffd6", 1, 0.5)}
      </g>`;
    }
    return "";
  }

  function renderFireworks(rare, p){
    const bursts = [];
    const centers = [
      [860, 210], [1020, 170], [1240, 240]
    ];
    centers.forEach((c, idx) => {
      const delay = idx * 0.17;
      const local = clamp((p - delay) / 0.55, 0, 1);
      const ease = easeInOut(local);
      bursts.push(`<g transform="translate(${c[0]} ${c[1]}) scale(${0.8 + idx*0.18})">
        ${drawFireworkSVG(["#ffe38e","#9de5ff","#ff9ff1"][idx % 3], ease)}
      </g>`);
    });
    return `<g filter="url(#softGlow)">${bursts.join("")}</g>`;
  }

  function addFocusCompleted(){
    state.focusCount += 1;
    const theme = state.theme;
    const list = state.elements[theme];
    const spawn = spawnThemeElement(theme, state.focusCount);
    list.push(spawn);
    if(theme === "reef" && state.focusCount % 2 === 0){
      list.push(spawnFish(theme, state.focusCount));
    }
    if(theme === "park" && state.focusCount % 3 === 0){
      list.push({ kind: "booth", x: 420 + Math.random()*260, y: 705 + Math.random()*18, size: 0.78, color: "#ffd76e", progress: 0.12, age: 0, sway: Math.random()*TAU, glow: 0 });
    }
    if(theme === "camp" && state.focusCount % 2 === 1){
      list.push({ kind: "pine", x: 240 + Math.random()*110, y: 720, size: 0.72, color: "#78d59b", progress: 0.1, age: 0, sway: Math.random()*TAU, glow: 0 });
    }
    if(theme === "garden" && state.focusCount % 2 === 0){
      list.push({ kind: "flower", x: 980 + Math.random()*220, y: 724 + Math.random()*12, size: 0.74, color: "#c5ff7a", progress: 0.1, age: 0, sway: Math.random()*TAU, glow: 0 });
    }
    updateZoomTarget();
    ui.focusCount.textContent = state.focusCount;
    pulseButton(ui.focusBtn);
  }

  function spawnThemeElement(theme, focusCount){
    const t = THEMES[theme];
    const seed = Math.random();
    const add = (obj) => ({ ...obj, age: 0, glow: 0, sway: Math.random()*TAU });
    if(theme === "reef"){
      const coralKinds = ["coral", "anemone", "algae"];
      const kind = coralKinds[focusCount % coralKinds.length];
      return add({
        kind,
        x: 220 + focusCount * 70 + (Math.random() * 80 - 40),
        y: kind === "algae" ? 715 : 688 + Math.random() * 26,
        size: kind === "algae" ? 0.7 + Math.random() * 0.35 : 0.8 + Math.random() * 0.4,
        color: t.palette[(focusCount + 1) % t.palette.length],
        built: 0.08 + seed * 0.06
      });
    }
    if(theme === "park"){
      const kinds = ["ferris", "arch", "lamp"];
      const kind = kinds[focusCount % kinds.length];
      const pos = {
        ferris: { x: 900 + (Math.random()*60 - 30), y: 520 },
        arch: { x: 720 + (Math.random()*50 - 25), y: 705 },
        lamp: { x: 1100 + (Math.random()*90 - 45), y: 716 }
      }[kind];
      return add({
        kind,
        ...pos,
        size: kind === "lamp" ? 0.75 : kind === "arch" ? 0.86 : 1,
        color: t.palette[(focusCount + 2) % t.palette.length],
        built: 0.05 + seed * 0.05
      });
    }
    if(theme === "camp"){
      const kinds = ["tent", "motorhome", "pine"];
      const kind = kinds[focusCount % kinds.length];
      const pos = {
        tent: { x: 470 + (Math.random()*120 - 60), y: 716 },
        motorhome: { x: 1080 + (Math.random()*70 - 35), y: 698 },
        pine: { x: 300 + (Math.random()*130 - 65), y: 710 }
      }[kind];
      return add({
        kind,
        ...pos,
        size: kind === "motorhome" ? 0.84 : 0.92,
        color: t.palette[(focusCount + 1) % t.palette.length],
        built: 0.1 + seed * 0.06
      });
    }
    const kinds = ["tree", "flower"];
    const kind = kinds[focusCount % kinds.length];
    const pos = kind === "tree"
      ? { x: 520 + (Math.random()*120 - 60), y: 652 + (Math.random()*22 - 11) }
      : { x: 620 + (Math.random()*420), y: 724 + (Math.random()*16 - 8) };
    return add({
      kind,
      ...pos,
      size: kind === "tree" ? 0.84 + Math.random() * 0.2 : 0.75 + Math.random() * 0.25,
      color: t.palette[(focusCount + 3) % t.palette.length],
      built: 0.07 + seed * 0.06
    });
  }

  function spawnFish(theme, focusCount){
    return {
      kind: "fish",
      x: 210 + Math.random() * 980,
      y: 470 + Math.random() * 120,
      size: 0.4 + Math.random() * 0.4,
      color: THEMES[theme].palette[(focusCount + 4) % THEMES[theme].palette.length],
      built: 1,
      age: 0,
      sway: Math.random() * TAU,
      glow: 0,
      dir: Math.random() > 0.5 ? 1 : -1
    };
  }

  function triggerRareEvent(){
    const theme = state.theme;
    const map = {
      reef: Math.random() > 0.5 ? "manta" : "whale",
      park: "fireworks",
      camp: "shooting",
      garden: Math.random() > 0.5 ? "moth" : "wisp"
    };
    state.rare = {
      kind: map[theme],
      t: 2800,
      life: 2800,
      mode: state.mode
    };
    pulseButton(ui.rareBtn);
  }

  function pulseButton(btn){
    btn.animate([
      { transform: "translateY(0) scale(1)" },
      { transform: "translateY(-2px) scale(1.03)" },
      { transform: "translateY(0) scale(1)" }
    ], { duration: 260, easing: "cubic-bezier(.2,.8,.2,1)" });
  }

  function drawFrame(dt){
    updateScene(dt);
    drawCanvas(dt);
    renderSVG();
  }

  function updateBackgroundLabels(){
    ui.themeLabel.textContent = THEMES[state.theme].label;
    ui.modeLabel.textContent = state.mode === "focus" ? "Foco" : state.mode === "pause" ? "Pausa" : "Pausa Longa";
  }

  let last = performance.now();
  let accumulator = 0;
  const step = 1000 / 30;

  function loop(now){
    const delta = Math.min(50, now - last);
    last = now;
    accumulator += delta;
    while(accumulator >= step){
      drawFrame(step);
      accumulator -= step;
    }
    requestAnimationFrame(loop);
  }

  ui.tabs.forEach(btn => btn.addEventListener("click", () => {
    setTheme(btn.dataset.theme);
    pulseButton(btn);
  }));

  ui.modes.forEach(btn => btn.addEventListener("click", () => {
    setMode(btn.dataset.mode);
    pulseButton(btn);
  }));

  ui.focusBtn.addEventListener("click", addFocusCompleted);
  ui.rareBtn.addEventListener("click", triggerRareEvent);

  window.addEventListener("resize", resize);

  resize();
  setTheme("reef");
  setMode("focus");
  updateBackgroundLabels();
  requestAnimationFrame(loop);

  function makeStaticDecor(){
    // Static SVG seeds that make the scene feel alive immediately.
    const reef = state.elements.reef;
    if(!reef.some(i => i.kind === "fish")) reef.push(spawnFish("reef", 0));
    const garden = state.elements.garden;
    if(!garden.some(i => i.kind === "bird")) garden.push({ kind: "bird", x: 460, y: 220, size: 0.8, color: "#eaffea", built: 1, age: 0, sway: 0.2, glow: 0, dir: 1 });
    const camp = state.elements.camp;
    if(!camp.some(i => i.kind === "pine")) camp.push({ kind: "pine", x: 1200, y: 700, size: 0.78, color: "#78d59b", built: 0.75, age: 0, sway: 0.4, glow: 0 });
    const park = state.elements.park;
    if(!park.some(i => i.kind === "lamp")) park.push({ kind: "lamp", x: 1280, y: 712, size: 0.78, color: "#fff3bf", built: 0.72, age: 0, sway: 0.8, glow: 0 });
  }

  makeStaticDecor();

  // --- SVG component builders ---

  function drawCoralSVG(color, growth, glow){
    const stem = 52 + growth * 88;
    const branch = 34 + growth * 56;
    return `
      <g filter="url(#softShadow)">
        <path d="M 0 92
                 C 8 68, 16 46, 18 20
                 C 21 0, 30 -12, 38 -18
                 C 44 -22, 48 -12, 50 2
                 C 52 20, 48 45, 48 64
                 C 48 78, 54 88, 66 100
                 L 52 112
                 C 34 100, 26 88, 22 76
                 C 18 64, 16 46, 12 34
                 C 9 22, 4 16, -4 10
                 C -8 6, -10 -2, -8 -10
                 C -4 -20, 6 -18, 10 -10
                 C 18 0, 20 8, 22 18
                 C 24 30, 24 42, 24 58
                 C 24 72, 32 88, 42 104
                 Z"
              fill="${color}" opacity="${0.7 + growth * 0.3}"/>
        <path d="M 26 100
                 C 20 72, 16 52, 8 34
                 C 2 18, -10 10, -18 2
                 C -24 -4, -22 -14, -14 -16
                 C -4 -18, 2 -8, 8 2
                 C 16 14, 22 24, 30 38
                 C 36 48, 42 66, 44 88
                 Z"
              fill="${shade(color, -10)}" opacity="0.92"/>
        <ellipse cx="20" cy="54" rx="${12 + growth * 8}" ry="${8 + growth * 4}" fill="rgba(255,255,255,0.16)"/>
        <ellipse cx="38" cy="18" rx="${10 + growth * 6}" ry="${7 + growth * 4}" fill="rgba(255,255,255,0.15)"/>
        <circle cx="44" cy="72" r="${6 + glow * 8}" fill="rgba(255,255,255,0.16)"/>
      </g>
    `;
  }

  function drawAnemoneSVG(color, growth, glow){
    const petal = 10 + growth * 10;
    const count = 8;
    const petals = [];
    for(let i=0;i<count;i++){
      const angle = (TAU / count) * i;
      petals.push(`<path d="M0 -58 C ${-petal} -28, ${-petal * 0.8} -4, 0 16 C ${petal * 0.8} -4, ${petal} -28, 0 -58 Z"
         fill="${i % 2 ? shade(color, 8) : color}" transform="rotate(${(360 / count) * i}) translate(0 ${Math.sin(growth*TAU)*2})"/>`);
    }
    return `
      <g filter="url(#softShadow)">
        <circle cx="0" cy="10" r="${18 + growth * 10}" fill="${shade(color, -20)}"/>
        ${petals.join("")}
        <circle cx="0" cy="10" r="${7 + glow * 8}" fill="rgba(255,255,255,0.22)"/>
      </g>
    `;
  }

  function drawAlgaeSVG(color, growth, glow){
    const leaves = [];
    for(let i=0;i<5;i++){
      const sway = Math.sin(state.time * 0.001 + i) * (6 + growth * 8);
      const height = 70 + i * 20 + growth * 18;
      leaves.push(`<path d="M0 0 C ${-12 - i} ${-height * 0.36}, ${-14 - i} ${-height * 0.74}, ${-8 - i} ${-height}
                C ${-2 - i} ${-height * 0.86}, ${3 + i} ${-height * 0.5}, ${8 + i} 0 Z"
                fill="${i % 2 ? shade(color, -6) : shade(color, 8)}"
                transform="translate(${(i - 2) * 8 + sway * 0.15} 0) rotate(${sway * 0.25})"/>`);
    }
    return `
      <g filter="url(#softShadow)">
        ${leaves.join("")}
        <ellipse cx="-5" cy="8" rx="18" ry="7" fill="rgba(255,255,255,0.12)"/>
        <circle cx="0" cy="-84" r="${6 + glow * 6}" fill="rgba(200,255,220,0.24)"/>
      </g>
    `;
  }

  function drawFishSVG(color, growth, glow, dir){
    const scale = dir < 0 ? `scale(-1 1)` : "";
    return `
      <g transform="${scale}">
        <path d="M -56 0
                 C -28 -26, 10 -24, 28 -8
                 C 40 3, 44 18, 36 30
                 C 20 54, -26 46, -48 20
                 C -54 14, -58 8, -56 0 Z"
              fill="${color}"/>
        <path d="M 28 -8 L 64 -30 L 56 0 L 64 30 L 28 8 Z" fill="${shade(color, -16)}"/>
        <circle cx="-18" cy="6" r="5" fill="rgba(255,255,255,0.9)"/>
        <circle cx="-16" cy="7" r="2.2" fill="rgba(10,20,30,0.8)"/>
        <path d="M -10 -5 C 0 -15, 8 -16, 16 -10" stroke="rgba(255,255,255,0.18)" stroke-width="5" fill="none" stroke-linecap="round"/>
        <ellipse cx="-36" cy="10" rx="${14 + glow * 2}" ry="${7 + growth * 2}" fill="rgba(255,255,255,0.14)" opacity="0.45"/>
      </g>
    `;
  }

  function drawFerrisWheelSVG(color, growth, glow){
    const spokes = [];
    const cabinCount = 8;
    for(let i=0;i<cabinCount;i++){
      const a = (TAU / cabinCount) * i + state.time * 0.0002;
      const x = Math.cos(a) * 110;
      const y = Math.sin(a) * 110;
      spokes.push(`<g transform="translate(${x} ${y}) rotate(${(a * 180 / Math.PI) + 90})">
        <rect x="-16" y="-12" width="32" height="24" rx="8" fill="${shade(color, i % 2 ? 8 : -10)}"/>
      </g>`);
    }
    const spokeLines = [];
    for(let i=0;i<12;i++){
      const a = (TAU / 12) * i;
      const x = Math.cos(a) * 110;
      const y = Math.sin(a) * 110;
      spokeLines.push(`<line x1="0" y1="0" x2="${x}" y2="${y}" stroke="${shade(color, -18)}" stroke-width="6" stroke-linecap="round"/>`);
    }
    return `
      <g filter="url(#softShadow)">
        <circle cx="0" cy="0" r="140" fill="none" stroke="${shade(color, 8)}" stroke-width="20"/>
        <circle cx="0" cy="0" r="118" fill="none" stroke="${shade(color, -6)}" stroke-width="6" opacity="0.9"/>
        ${spokeLines.join("")}
        ${spokes.join("")}
        <circle cx="0" cy="0" r="20" fill="${shade(color, -22)}"/>
        <rect x="-24" y="118" width="48" height="168" rx="18" fill="${shade(color, -18)}"/>
        <rect x="-180" y="220" width="360" height="18" rx="9" fill="${shade(color, -22)}"/>
        <path d="M-180 238 L-120 118 L-60 238 M60 238 L120 118 L180 238" stroke="${shade(color, -20)}" stroke-width="14" fill="none" stroke-linecap="round"/>
        <circle cx="0" cy="0" r="${156 + glow * 18}" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="4"/>
      </g>
    `;
  }

  function drawBoothSVG(color, growth, glow){
    return `
      <g filter="url(#softShadow)">
        <path d="M-80 -10 L0 -72 L80 -10 Z" fill="${shade(color, 8)}"/>
        <rect x="-68" y="-10" width="136" height="110" rx="18" fill="${color}"/>
        <rect x="-58" y="8" width="116" height="16" rx="8" fill="rgba(255,255,255,0.24)"/>
        <rect x="-34" y="28" width="68" height="70" rx="14" fill="${shade(color, -20)}"/>
        <circle cx="-26" cy="52" r="10" fill="rgba(255,255,255,0.18)"/>
        <circle cx="0" cy="52" r="10" fill="rgba(255,255,255,0.18)"/>
        <circle cx="26" cy="52" r="10" fill="rgba(255,255,255,0.18)"/>
        <rect x="-78" y="100" width="156" height="16" rx="8" fill="${shade(color, -28)}"/>
      </g>
    `;
  }

  function drawArchSVG(color, growth, glow){
    const trace = [];
    for(let i=0;i<8;i++){
      const p = i / 7;
      const x = -160 + p * 320;
      const y = -Math.sin(p * Math.PI) * 110;
      trace.push(`<circle cx="${x}" cy="${y}" r="12" fill="${i % 2 ? color : shade(color, 14)}"/>`);
    }
    return `
      <g filter="url(#softShadow)">
        <path d="M-180 130 C-180 -44, -88 -120, 0 -120 C88 -120, 180 -44, 180 130" fill="none" stroke="${shade(color, -20)}" stroke-width="24" stroke-linecap="round"/>
        <path d="M-180 130 C-180 -36, -88 -110, 0 -110 C88 -110, 180 -36, 180 130" fill="none" stroke="${color}" stroke-width="12" stroke-linecap="round"/>
        ${trace.join("")}
      </g>
    `;
  }

  function drawLampSVG(color, growth, glow, mode){
    const brightness = mode === "focus" ? 0.3 : mode === "pause" ? 0.55 : 0.8;
    return `
      <g filter="url(#softGlow)">
        <rect x="-6" y="-120" width="12" height="170" rx="6" fill="${shade(color, -20)}"/>
        <path d="M-26 -120 H 26 L 16 -82 H -16 Z" fill="${shade(color, 4)}"/>
        <circle cx="0" cy="-96" r="${12 + glow * 8}" fill="rgba(255,255,255,${0.22 + brightness * 0.26})"/>
      </g>
    `;
  }

  function drawTrailSVG(color, growth, glow){
    return `
      <g filter="url(#softShadow)">
        <path d="M0 0 C 76 -4, 122 -10, 206 0" stroke="${shade(color, -20)}" stroke-width="12" fill="none" stroke-linecap="round"/>
        <path d="M0 0 C 76 -4, 122 -10, 206 0" stroke="${color}" stroke-width="5" fill="none" stroke-linecap="round" opacity="0.62"/>
        ${[28, 84, 140, 186].map(x => `<circle cx="${x}" cy="${Math.sin(x*0.03) * 2}" r="6" fill="rgba(255,255,255,0.2)"/>`).join("")}
      </g>
    `;
  }

  function drawTentSVG(color, growth, glow){
    return `
      <g filter="url(#softShadow)">
        <path d="M-100 84 L0 -76 L100 84 Z" fill="${shade(color, 8)}"/>
        <path d="M-72 84 L0 -52 L72 84 Z" fill="${color}"/>
        <path d="M0 -76 L-24 -18 L0 84" stroke="rgba(255,255,255,0.18)" stroke-width="8" fill="none"/>
        <rect x="-96" y="84" width="192" height="20" rx="10" fill="${shade(color, -16)}"/>
        <path d="M-58 84 L-28 36" stroke="rgba(255,255,255,0.2)" stroke-width="8" stroke-linecap="round"/>
        <path d="M58 84 L28 36" stroke="rgba(255,255,255,0.2)" stroke-width="8" stroke-linecap="round"/>
      </g>
    `;
  }

  function drawMotorhomeSVG(color, growth, glow){
    return `
      <g filter="url(#softShadow)">
        <rect x="-120" y="-54" width="240" height="118" rx="28" fill="${shade(color, 4)}"/>
        <rect x="-92" y="-28" width="92" height="46" rx="14" fill="rgba(255,255,255,0.2)"/>
        <rect x="12" y="-28" width="72" height="46" rx="14" fill="rgba(255,255,255,0.12)"/>
        <rect x="-48" y="20" width="90" height="44" rx="16" fill="${color}"/>
        <circle cx="-72" cy="68" r="22" fill="${shade(color, -32)}"/>
        <circle cx="72" cy="68" r="22" fill="${shade(color, -32)}"/>
        <circle cx="-72" cy="68" r="10" fill="rgba(255,255,255,0.24)"/>
        <circle cx="72" cy="68" r="10" fill="rgba(255,255,255,0.24)"/>
        <path d="M96 -54 h 52 v 118 h -52" fill="${shade(color, -12)}"/>
      </g>
    `;
  }

  function drawCampfireSVG(color, growth, glow, focusCount){
    const flame = 44 + growth * 48;
    const intensity = clamp(0.22 + focusCount * 0.07, 0.22, 1);
    return `
      <g filter="url(#softGlow)">
        <path d="M-72 82 L-18 32" stroke="${shade(color, -32)}" stroke-width="18" stroke-linecap="round"/>
        <path d="M72 82 L18 32" stroke="${shade(color, -32)}" stroke-width="18" stroke-linecap="round"/>
        <path d="M-92 40 L94 40" stroke="${shade(color, -20)}" stroke-width="14" stroke-linecap="round"/>
        <path d="M0 ${70 - flame * 0.9}
                 C ${-28 - glow * 4} ${24 - flame * 0.24}, ${-18 - glow * 3} ${-12 - flame * 0.34}, 0 ${-48 - flame * 0.3}
                 C ${22 + glow * 2} ${-10 - flame * 0.26}, ${34 + glow * 3} ${22 - flame * 0.18}, 0 ${70 - flame * 0.9} Z"
              fill="${shade(color, 14)}" opacity="${0.95}"/>
        <path d="M0 ${48 - flame * 0.6}
                 C ${-18} ${14 - flame * 0.2}, ${-8} ${-2 - flame * 0.2}, 0 ${-26 - flame * 0.2}
                 C 9 ${-6 - flame * 0.14}, 20 ${14 - flame * 0.1}, 0 ${48 - flame * 0.6} Z"
              fill="#fff2be" opacity="${0.85 * intensity}"/>
        <circle cx="0" cy="-16" r="${18 + glow * 12}" fill="rgba(255,216,120,0.24)"/>
      </g>
    `;
  }

  function drawPineSVG(color, growth, glow){
    const height = 230 + growth * 100;
    return `
      <g filter="url(#softShadow)">
        <rect x="-10" y="74" width="20" height="84" rx="8" fill="${shade(color, -28)}"/>
        <path d="M0 -${height * 0.2} L-90 -20 L-42 -20 L-120 30 L-70 30 L-144 84 L144 84 L70 30 L120 30 L42 -20 L90 -20 Z"
              fill="${color}"/>
        <circle cx="0" cy="-56" r="${7 + glow * 5}" fill="rgba(255,255,255,0.2)"/>
      </g>
    `;
  }

  function drawTreeSVG(color, growth, glow){
    return `
      <g filter="url(#softShadow)">
        <path d="M-16 96 C-18 20, -4 -22, 0 -92 C 4 -22, 18 20, 16 96 Z" fill="${shade(color, -28)}"/>
        <circle cx="-54" cy="-34" r="${52 + growth * 18}" fill="${shade(color, 5)}"/>
        <circle cx="0" cy="-70" r="${66 + growth * 20}" fill="${color}"/>
        <circle cx="58" cy="-24" r="${50 + growth * 16}" fill="${shade(color, -6)}"/>
        <circle cx="-12" cy="-14" r="24" fill="rgba(255,255,255,0.14)"/>
        <circle cx="34" cy="-62" r="${10 + glow * 6}" fill="rgba(255,255,255,0.18)"/>
      </g>
    `;
  }

  function drawFlowerSVG(color, growth, glow){
    const petals = [];
    const count = 6;
    for(let i=0;i<count;i++){
      petals.push(`<ellipse cx="0" cy="-36" rx="16" ry="28" fill="${i % 2 ? shade(color, 10) : color}" transform="rotate(${i * 60})"/>`);
    }
    return `
      <g filter="url(#softShadow)">
        <path d="M0 120 C-4 58, -6 24, 0 -12 C4 22, 6 58, 0 120 Z" fill="${shade(color, -24)}"/>
        ${petals.join("")}
        <circle cx="0" cy="0" r="${18 + glow * 8}" fill="rgba(255,255,255,0.22)"/>
        <circle cx="0" cy="0" r="10" fill="${shade(color, -18)}"/>
      </g>
    `;
  }

  function drawBirdSVG(color, growth, glow, dir){
    const flip = dir < 0 ? "scale(-1 1)" : "";
    return `
      <g transform="${flip}" filter="url(#softShadow)">
        <path d="M-84 12 C-42 -24, -14 -24, 10 0 C 28 -24, 58 -26, 92 6 C 58 0, 38 14, 18 32 C -2 18, -24 10, -48 10 C -58 10, -72 10, -84 12 Z"
              fill="${color}"/>
        <path d="M-18 10 C-36 0, -54 -6, -72 -4" stroke="rgba(255,255,255,0.26)" stroke-width="6" fill="none" stroke-linecap="round"/>
        <circle cx="28" cy="-2" r="4" fill="rgba(10,20,30,0.7)"/>
      </g>
    `;
  }

  function drawLizardSVG(color, growth, glow){
    return `
      <g filter="url(#softShadow)">
        <path d="M-90 18 C-54 -12, -10 -18, 32 -2 C58 6, 76 22, 88 42 C62 28, 42 22, 22 24 C2 26, -18 34, -42 42 C-60 50, -76 48, -90 18 Z"
              fill="${color}"/>
        <circle cx="-68" cy="18" r="10" fill="rgba(255,255,255,0.18)"/>
        <path d="M16 24 L48 48" stroke="rgba(255,255,255,0.18)" stroke-width="8" stroke-linecap="round"/>
        <path d="M-14 22 L-38 48" stroke="rgba(255,255,255,0.18)" stroke-width="8" stroke-linecap="round"/>
        <path d="M18 18 C48 8, 68 8, 90 14" stroke="rgba(255,255,255,0.18)" stroke-width="7" fill="none" stroke-linecap="round"/>
      </g>
    `;
  }

  function drawMantaSVG(color, growth, glow){
    return `
      <g filter="url(#softShadow)">
        <path d="M0 -34 C 44 -16, 88 0, 120 20 C 72 26, 38 52, 0 82 C -38 52, -72 26, -120 20 C -88 0, -44 -16, 0 -34 Z"
              fill="${color}"/>
        <path d="M-12 74 C-48 98, -64 120, -72 156" stroke="${shade(color, -16)}" stroke-width="8" stroke-linecap="round" fill="none"/>
        <path d="M12 74 C48 98, 64 120, 72 156" stroke="${shade(color, -16)}" stroke-width="8" stroke-linecap="round" fill="none"/>
        <circle cx="0" cy="6" r="14" fill="rgba(255,255,255,0.22)"/>
      </g>
    `;
  }

  function drawWhaleSVG(color, growth, glow){
    return `
      <g filter="url(#softShadow)">
        <path d="M-176 18 C-122 -54, -22 -68, 76 -44 C 130 -30, 164 8, 176 48 C 140 58, 104 64, 72 54 C 50 48, 36 36, 18 30 C -10 20, -38 32, -72 48 C -112 66, -146 62, -176 18 Z"
              fill="${color}"/>
        <path d="M70 50 C114 74, 146 82, 186 82" stroke="${shade(color, -24)}" stroke-width="14" stroke-linecap="round" fill="none"/>
        <circle cx="-98" cy="0" r="16" fill="rgba(255,255,255,0.18)"/>
      </g>
    `;
  }

  function drawShootingStarSVG(color, p){
    return `
      <g filter="url(#softGlow)">
        <path d="M0 0 L140 42" stroke="${color}" stroke-width="10" stroke-linecap="round"/>
        <path d="M0 0 L-18 -22 L4 -8 L22 -30 Z" fill="${color}"/>
        <circle cx="0" cy="0" r="12" fill="${color}"/>
      </g>
    `;
  }

  function drawFireworkSVG(color, p){
    const rays = [];
    const raysCount = 14;
    const len = 36 + p * 120;
    for(let i=0;i<raysCount;i++){
      const a = (TAU / raysCount) * i;
      const x = Math.cos(a) * len;
      const y = Math.sin(a) * len;
      rays.push(`<line x1="0" y1="0" x2="${x}" y2="${y}" stroke="${color}" stroke-width="${3 + p * 4}" stroke-linecap="round"/>`);
    }
    return `
      <g filter="url(#softGlow)">
        <circle cx="0" cy="0" r="${8 + p * 14}" fill="${color}"/>
        ${rays.join("")}
      </g>
    `;
  }

  function drawMothSVG(color, growth, glow){
    return `
      <g filter="url(#softGlow)">
        <path d="M0 -32 C-34 -38, -66 -18, -86 16 C-52 18, -34 28, -8 44 C-6 22, -2 2, 0 -32 Z" fill="${shade(color, 8)}"/>
        <path d="M0 -32 C34 -38, 66 -18, 86 16 C52 18, 34 28, 8 44 C6 22, 2 2, 0 -32 Z" fill="${color}"/>
        <circle cx="0" cy="6" r="10" fill="rgba(255,255,255,0.28)"/>
        <path d="M0 44 C-2 64, -4 80, -8 96" stroke="${shade(color, -20)}" stroke-width="5" fill="none" stroke-linecap="round"/>
      </g>
    `;
  }

  function drawWispSVG(color, growth, glow){
    return `
      <g filter="url(#softGlow)">
        <circle cx="0" cy="0" r="34" fill="${color}" opacity="0.28"/>
        <circle cx="0" cy="0" r="16" fill="${color}" opacity="0.75"/>
        <path d="M0 -58 C 14 -30, 22 -12, 28 4 C 16 0, 8 -2, 0 -10 C -8 -2, -16 0, -28 4 C -22 -12, -14 -30, 0 -58 Z" fill="${shade(color, 10)}"/>
      </g>
    `;
  }

  function shade(hex, delta){
    const {r,g,b} = hexToRgb(hex);
    const rr = clamp(r + delta, 0, 255);
    const gg = clamp(g + delta, 0, 255);
    const bb = clamp(b + delta, 0, 255);
    return `rgb(${rr}, ${gg}, ${bb})`;
  }

  function renderFixedShell(){
    // keep canvas cleared after resize before first frame
    ctx.clearRect(0,0,ui.canvas.width, ui.canvas.height);
  }

  renderFixedShell();

})();
