// Harness de DEMONSTRAÇÃO. Isto não é o motor de pomodoro real —
// é só uma vitrine que aciona os hooks do ThemeModule (a mesma
// interface que um timer de verdade chamaria) num ciclo acelerado,
// pra dar pra ver o recife crescendo, os peixes chegando e o
// evento raro acontecendo sem esperar 25 minutos de verdade.
(function (PMV) {
  'use strict';

  const FOCUS_MS = 45000;
  const PAUSA_MS = 14000;
  const RARE_EVENT_EVERY_N_CYCLES = 2;
  const CYCLES_TO_MATURE = 4; // em 4 ciclos o recife atinge o auge (bate com os 4 pontinhos da UI)

  function formatClock(ms) {
    const total = Math.max(0, Math.ceil(ms / 1000));
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  function createDemoHarness(theme, ui) {
    let cycle = 1;
    let cancelled = false;

    function tickFocus() {
      const start = performance.now();

      function step(now) {
        if (cancelled) return;
        const elapsed = now - start;
        const sessionProgress = Math.min(1, elapsed / FOCUS_MS);
        // Progresso é cumulativo entre ciclos — nunca regride. Uma
        // sessão sozinha não deixa o recife maduro; são precisas
        // várias (CYCLES_TO_MATURE) pra chegar ao auge.
        const globalProgress = Math.min(1, ((cycle - 1) + sessionProgress) / CYCLES_TO_MATURE);
        theme.onFocusComplete(globalProgress);
        if (ui) ui.update({ mode: 'foco', cycle, clock: formatClock(FOCUS_MS - elapsed), progress: sessionProgress });

        if (sessionProgress < 1) {
          requestAnimationFrame(step);
        } else {
          onFocusEnd();
        }
      }

      requestAnimationFrame(step);
    }

    function onFocusEnd() {
      theme.onCycleTurn('pausa');
      if (cycle % RARE_EVENT_EVERY_N_CYCLES === 0) theme.onRareEvent();

      const pausaStart = performance.now();
      function pausaStep(now) {
        if (cancelled) return;
        const elapsed = now - pausaStart;
        if (ui) ui.update({ mode: 'pausa', cycle, clock: formatClock(PAUSA_MS - elapsed), progress: 1 });

        if (elapsed < PAUSA_MS) {
          requestAnimationFrame(pausaStep);
        } else {
          theme.onCycleTurn('foco');
          cycle += 1;
          tickFocus();
        }
      }
      requestAnimationFrame(pausaStep);
    }

    return {
      start() { tickFocus(); },
      stop() { cancelled = true; }
    };
  }

  PMV.Demo = PMV.Demo || {};
  PMV.Demo.createDemoHarness = createDemoHarness;
})(window.PMV = window.PMV || {});
