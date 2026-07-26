// Fauna do Recife (Etapa 5 + Etapa 7). Usa o `biasType` que cada
// organismo do recife já carrega (ver reefComposition.js) pra
// decidir QUAL peixe nasce onde: clownfish perto de anêmona,
// camuflado perto de coral-cérebro (alga/rocha), os demais soltos
// pela coluna d'água. Nada aqui é sorteio puro — o viés vem do
// contexto real da cena, só o detalhe fino (duração/fase) é seedado.
(function (PMV) {
  'use strict';

  function buildSwimPath(width, height, yBase, direction, waveAmp) {
    const startX = direction === 'right' ? -60 : width + 60;
    const endX = direction === 'right' ? width + 60 : -60;
    const midX1 = startX + (endX - startX) * 0.33;
    const midX2 = startX + (endX - startX) * 0.66;
    const wave = waveAmp || height * 0.035;
    return `M ${startX} ${yBase} C ${midX1} ${yBase - wave}, ${midX2} ${yBase + wave}, ${endX} ${yBase}`;
  }

  function pickAnchors(reefItems) {
    const anemones = reefItems.filter((i) => i.meta && i.meta.biasType === 'clownfish');
    const camo = reefItems.filter((i) => i.meta && i.meta.biasType === 'camouflage');
    const others = reefItems.filter((i) => i.meta && i.meta.type === 'coral' && i.meta.biasType === 'default');
    return { anemones, camo, others };
  }

  function planFish(reefItems, width, height, rng) {
    const { anemones, camo, others } = pickAnchors(reefItems);
    const plan = [];
    let begin = 0;

    anemones.slice(0, 2).forEach((anchor, i) => {
      const yBase = Math.max(height * 0.22, anchor.pivotY - height * 0.16);
      plan.push({
        species: 'clownfish', direction: i % 2 === 0 ? 'right' : 'left', yBase,
        scale: 0.9 + rng() * 0.3, duration: 24 + rng() * 8, begin
      });
      begin += 3.2;
    });

    camo.slice(0, 1).forEach((anchor) => {
      const yBase = Math.max(height * 0.22, anchor.pivotY - height * 0.14);
      plan.push({
        species: 'camouflage', direction: 'left', yBase,
        scale: 0.85 + rng() * 0.2, duration: 30 + rng() * 10, begin
      });
      begin += 3.2;
    });

    const generalCount = Math.min(3, Math.max(2, Math.floor(others.length / 6)));
    for (let i = 0; i < generalCount; i++) {
      plan.push({
        species: rng() < 0.5 ? 'tangYellow' : 'tangBlue',
        direction: rng() < 0.5 ? 'right' : 'left',
        yBase: height * (0.24 + rng() * 0.22),
        scale: 0.8 + rng() * 0.35, duration: 26 + rng() * 12, begin
      });
      begin += 2.6;
    }

    return plan;
  }

  // Nada os peixes de novo (viradas foco -> pausa seguintes trocam
  // o elenco). `seed` varia por chamada (ex.: número do ciclo).
  function spawnFauna(svgRoot, faunaGroup, reefItems, width, height, seed) {
    const rng = PMV.Engine.CanvasUtils.mulberry32(seed);
    const plan = planFish(reefItems, width, height, rng);

    while (faunaGroup.firstChild) faunaGroup.removeChild(faunaGroup.firstChild);

    plan.forEach((p) => {
      const pathD = buildSwimPath(width, height, p.yBase, p.direction);
      const fish = PMV.Components.Fish.create(svgRoot, {
        species: p.species, scale: p.scale, direction: p.direction,
        pathD, duration: p.duration, begin: p.begin
      });
      faunaGroup.appendChild(fish.element);
    });
  }

  // Evento raro — arraia/manta atravessando devagar, ao fundo.
  function spawnRareEvent(svgRoot, rareGroup, width, height, seed) {
    const rng = PMV.Engine.CanvasUtils.mulberry32(seed);
    const direction = rng() < 0.5 ? 'right' : 'left';
    const yBase = height * (0.16 + rng() * 0.08);
    const pathD = buildSwimPath(width, height, yBase, direction, height * 0.015);

    while (rareGroup.firstChild) rareGroup.removeChild(rareGroup.firstChild);
    const manta = PMV.Components.Manta.create(svgRoot, {
      direction, scale: 1 + rng() * 0.35, pathD, duration: 50 + rng() * 18
    });
    rareGroup.appendChild(manta.element);
  }

  PMV.Themes = PMV.Themes || {};
  PMV.Themes.Recife = PMV.Themes.Recife || {};
  PMV.Themes.Recife.spawnFauna = spawnFauna;
  PMV.Themes.Recife.spawnRareEvent = spawnRareEvent;
})(window.PMV = window.PMV || {});
