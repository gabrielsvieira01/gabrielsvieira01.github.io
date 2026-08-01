(function (PMV) {
  'use strict';

  PMV.Demo = PMV.Demo || {};

  var STORAGE_KEY = 'pmv-demo-progress-recife';
  var CUSTOM_HOURS_KEY = 'pmv-demo-custom-hours-recife';
  var MAX_CUSTOM_HOURS = 8;
  var CYCLE_INCREMENT = 0.12; // "um pomodoro completado" simulado

  function Harness(sceneManager) {
    this.scene = sceneManager;
  }

  Harness.prototype.loadProgress = function () {
    try {
      var raw = window.localStorage.getItem(STORAGE_KEY);
      return raw ? Math.max(0, parseFloat(raw)) : 0;
    } catch (e) {
      return 0;
    }
  };

  Harness.prototype.saveProgress = function (value) {
    try {
      window.localStorage.setItem(STORAGE_KEY, String(value));
    } catch (e) { /* localStorage indisponível - segue sem persistir */ }
  };

  // Horários personalizados (ex.: "Estudo às 14:00") - a pessoa adiciona os
  // próprios compromissos pra pré-visualizar a cena naquele horário, além
  // dos presets fixos (Manhã/Meio-dia/...).
  Harness.prototype.loadCustomHours = function () {
    try {
      var raw = window.localStorage.getItem(CUSTOM_HOURS_KEY);
      var parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  };

  Harness.prototype.saveCustomHours = function (list) {
    try {
      window.localStorage.setItem(CUSTOM_HOURS_KEY, JSON.stringify(list));
    } catch (e) { /* localStorage indisponível - segue sem persistir */ }
  };

  function formatHour(hour) {
    var hh = Math.floor(hour);
    var mm = Math.round((hour - hh) * 60);
    if (mm === 60) { mm = 0; hh += 1; }
    hh = hh % 24;
    return (hh < 10 ? '0' : '') + hh + ':' + (mm < 10 ? '0' : '') + mm;
  }

  // Vitrine compacta: uma pastilha no canto (não bloqueia o cenário) que
  // expande um cartão pequeno com os controles, ancorado no mesmo canto.
  Harness.prototype.mount = function (root) {
    var self = this;

    var card = document.createElement('div');
    card.className = 'pmv-demo-card';

    var closeBtn = document.createElement('button');
    closeBtn.className = 'pmv-demo-card-close';
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', 'Fechar');
    closeBtn.textContent = '\u00D7';
    card.appendChild(closeBtn);

    var progressLabel = document.createElement('div');
    progressLabel.className = 'pmv-demo-progress-label';
    card.appendChild(progressLabel);

    var barTrack = document.createElement('div');
    barTrack.className = 'pmv-demo-bar-track';
    var barFill = document.createElement('div');
    barFill.className = 'pmv-demo-bar-fill';
    barTrack.appendChild(barFill);
    card.appendChild(barTrack);

    var completeBtn = document.createElement('button');
    completeBtn.className = 'pmv-demo-btn';
    completeBtn.type = 'button';
    completeBtn.textContent = 'Completar ciclo de foco';
    card.appendChild(completeBtn);

    var resetBtn = document.createElement('button');
    resetBtn.className = 'pmv-demo-btn pmv-demo-btn-ghost';
    resetBtn.type = 'button';
    resetBtn.textContent = 'Zerar demo (nova cena)';
    card.appendChild(resetBtn);

    var timeLabel = document.createElement('div');
    timeLabel.className = 'pmv-demo-subtitle';
    timeLabel.textContent = 'Horário (prévia)';
    card.appendChild(timeLabel);

    var timeRow = document.createElement('div');
    timeRow.className = 'pmv-demo-time-row';
    var TIME_OPTIONS = [
      { label: 'Auto', hour: null },
      { label: 'Manhã', hour: 8 },
      { label: 'Meio-dia', hour: 13 },
      { label: 'Pôr do sol', hour: 19 },
      { label: 'Noite', hour: 22 }
    ];
    var allTimeButtons = [];

    function setActiveButton(btn) {
      allTimeButtons.forEach(function (b) { b.classList.toggle('pmv-active', b === btn); });
    }

    function selectHour(hour, btn) {
      if (self.scene.theme && typeof self.scene.theme.setTimeOverrideHour === 'function') {
        self.scene.theme.setTimeOverrideHour(hour);
      }
      setActiveButton(btn);
    }

    TIME_OPTIONS.forEach(function (opt) {
      var btn = document.createElement('button');
      btn.className = 'pmv-demo-time-btn';
      btn.type = 'button';
      btn.textContent = opt.label;
      btn.addEventListener('click', function () { selectHour(opt.hour, btn); });
      timeRow.appendChild(btn);
      allTimeButtons.push(btn);
    });
    allTimeButtons[0].classList.add('pmv-active'); // "Auto" começa selecionado
    card.appendChild(timeRow);

    // Horários personalizados - a pessoa cria os próprios (ex.: "Estudo
    // 14:00") pra ver a cena naquele momento do dia, além dos presets.
    var customLabel = document.createElement('div');
    customLabel.className = 'pmv-demo-subtitle';
    customLabel.textContent = 'Seus horários';
    customLabel.style.display = 'none';
    card.appendChild(customLabel);

    var customRow = document.createElement('div');
    customRow.className = 'pmv-demo-time-row';
    card.appendChild(customRow);

    var customHours = this.loadCustomHours();

    function renderCustomChip(entry) {
      var chip = document.createElement('button');
      chip.className = 'pmv-demo-time-btn pmv-demo-chip';
      chip.type = 'button';

      var chipText = document.createElement('span');
      chipText.textContent = entry.label + ' \u00B7 ' + formatHour(entry.hour);
      chip.appendChild(chipText);

      var chipRemove = document.createElement('span');
      chipRemove.className = 'pmv-demo-chip-remove';
      chipRemove.textContent = '\u00D7';
      chipRemove.setAttribute('aria-label', 'Remover ' + entry.label);
      chip.appendChild(chipRemove);

      chip.addEventListener('click', function (ev) {
        if (ev.target === chipRemove) {
          ev.stopPropagation();
          customHours = customHours.filter(function (e) { return e.id !== entry.id; });
          self.saveCustomHours(customHours);
          var wasActive = chip.classList.contains('pmv-active');
          allTimeButtons = allTimeButtons.filter(function (b) { return b !== chip; });
          chip.remove();
          customLabel.style.display = customHours.length ? '' : 'none';
          updateAddState();
          if (wasActive) selectHour(null, allTimeButtons[0]); // volta pro "Auto"
          return;
        }
        selectHour(entry.hour, chip);
      });

      customRow.appendChild(chip);
      allTimeButtons.push(chip);
    }

    customHours.forEach(renderCustomChip);
    customLabel.style.display = customHours.length ? '' : 'none';
    card.appendChild(customRow);

    var addLabel = document.createElement('div');
    addLabel.className = 'pmv-demo-subtitle';
    addLabel.textContent = 'Adicionar horário';
    card.appendChild(addLabel);

    var addRow = document.createElement('div');
    addRow.className = 'pmv-demo-add-row';

    var nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.className = 'pmv-demo-input pmv-demo-input-name';
    nameInput.placeholder = 'Ex: Estudo';
    nameInput.maxLength = 24;
    addRow.appendChild(nameInput);

    var hourInput = document.createElement('input');
    hourInput.type = 'time';
    hourInput.className = 'pmv-demo-input pmv-demo-input-time';
    addRow.appendChild(hourInput);

    var addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'pmv-demo-add-btn';
    addBtn.textContent = '+';
    addBtn.setAttribute('aria-label', 'Adicionar horário personalizado');
    addRow.appendChild(addBtn);

    card.appendChild(addRow);

    function updateAddState() {
      addBtn.disabled = customHours.length >= MAX_CUSTOM_HOURS;
      addBtn.title = addBtn.disabled ? 'Máximo de ' + MAX_CUSTOM_HOURS + ' horários personalizados' : '';
    }
    updateAddState();

    addBtn.addEventListener('click', function () {
      if (customHours.length >= MAX_CUSTOM_HOURS) return;
      var raw = hourInput.value; // "HH:MM" ou vazio
      if (!raw) { hourInput.focus(); return; }
      var parts = raw.split(':');
      var hour = parseInt(parts[0], 10) + (parseInt(parts[1], 10) || 0) / 60;
      if (isNaN(hour)) { hourInput.focus(); return; }
      var label = nameInput.value.trim() || 'Personalizado';

      var entry = { id: 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), label: label, hour: hour };
      customHours.push(entry);
      self.saveCustomHours(customHours);
      renderCustomChip(entry);
      customLabel.style.display = '';
      updateAddState();

      nameInput.value = '';
      hourInput.value = '';
      selectHour(entry.hour, allTimeButtons[allTimeButtons.length - 1]);
    });

    var note = document.createElement('div');
    note.className = 'pmv-demo-note';
    note.textContent = 'Vitrine de desenvolvimento. Fauna e flora aparecem quando os componentes SVG forem integrados.';
    card.appendChild(note);

    var pill = document.createElement('button');
    pill.className = 'pmv-demo-pill';
    pill.type = 'button';
    pill.setAttribute('aria-label', 'Abrir controles da vitrine');
    var pillDot = document.createElement('span');
    pillDot.className = 'pmv-demo-pill-dot';
    var pillPct = document.createElement('span');
    pillPct.className = 'pmv-demo-pill-pct';
    pill.appendChild(pillDot);
    pill.appendChild(pillPct);

    function refresh() {
      var pct = Math.min(100, Math.round(self.scene.progress * 100));
      progressLabel.textContent = 'Progresso acumulado: ' + pct + '%';
      barFill.style.width = pct + '%';
      pillPct.textContent = pct + '%';
    }

    function setOpen(open) {
      card.classList.toggle('pmv-open', open);
      pill.classList.toggle('pmv-active', open);
    }

    completeBtn.addEventListener('click', function () {
      self.scene.onFocusComplete(self.scene.progress + CYCLE_INCREMENT);
      self.saveProgress(self.scene.progress);
      refresh();
    });

    resetBtn.addEventListener('click', function () {
      self.saveProgress(0);
      window.location.reload();
    });

    pill.addEventListener('click', function () {
      setOpen(!card.classList.contains('pmv-open'));
    });
    closeBtn.addEventListener('click', function () { setOpen(false); });

    root.appendChild(card);
    root.appendChild(pill);
    refresh();
  };

  PMV.Demo.Harness = Harness;
})(window.PMV = window.PMV || {});
