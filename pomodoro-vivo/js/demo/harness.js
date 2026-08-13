(function (PMV) {
  'use strict';

  PMV.Demo = PMV.Demo || {};

  var CYCLE_INCREMENT = 0.12; // "um pomodoro completado" simulado

  // A persistência não mora aqui: quem guarda progresso e peças é o
  // PMV.World.Inventory. Esta camada só dispara ciclos e desenha o estado.
  //
  // Duas superfícies, e a divisão entre elas é proposital:
  //
  //   o CARTÃO, no canto, tem as coisas que valem pra sessão inteira -
  //     progresso, peças ganhas, horário, a cara da fogueira;
  //   os CONTROLES FLUTUANTES nascem grudados na peça que está sendo
  //     colocada e morrem quando ela é confirmada. Girar e espelhar são
  //     verbos sobre AQUELA peça, e num painel de canto a pessoa precisa
  //     olhar pra um lugar e ver o efeito em outro.
  function Harness(sceneManager, inventory, placement) {
    this.scene = sceneManager;
    this.inventory = inventory || null;
    this.placement = placement || null;
  }

  Harness.prototype.mount = function (root) {
    var self = this;
    var a11yStatus = document.getElementById('pmv-a11y-status');

    function theme() { return self.scene.theme; }
    function nomeDe(slotId) { return theme().rotuloDe ? theme().rotuloDe(slotId) : slotId; }
    function anunciar(texto) { if (a11yStatus) a11yStatus.textContent = texto; }

    // ---- Cartão ----
    var card = document.createElement('div');
    card.className = 'pmv-demo-card';

    var closeBtn = document.createElement('button');
    closeBtn.className = 'pmv-demo-card-close';
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', 'Fechar');
    closeBtn.textContent = '×';
    card.appendChild(closeBtn);

    // ---- Abas ----
    var abas = document.createElement('div');
    abas.className = 'pmv-abas';
    abas.setAttribute('role', 'tablist');
    card.appendChild(abas);

    var paineis = {};
    var botoesAba = {};

    function criarAba(id, rotulo) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'pmv-aba';
      b.textContent = rotulo;
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', 'false');
      b.addEventListener('click', function () { abrirAba(id); });
      abas.appendChild(b);
      botoesAba[id] = b;

      var painel = document.createElement('div');
      painel.className = 'pmv-painel';
      painel.setAttribute('role', 'tabpanel');
      card.appendChild(painel);
      paineis[id] = painel;
      return painel;
    }

    function abrirAba(id) {
      Object.keys(paineis).forEach(function (k) {
        var ativo = k === id;
        paineis[k].classList.toggle('pmv-visivel', ativo);
        botoesAba[k].classList.toggle('pmv-active', ativo);
        botoesAba[k].setAttribute('aria-selected', String(ativo));
      });
    }

    var painelProgresso = criarAba('progresso', 'Progresso');
    var painelPecas = criarAba('pecas', 'Peças');

    // ---- Aba: progresso ----
    var progressLabel = document.createElement('div');
    progressLabel.className = 'pmv-demo-progress-label';
    painelProgresso.appendChild(progressLabel);

    var barTrack = document.createElement('div');
    barTrack.className = 'pmv-demo-bar-track';
    var barFill = document.createElement('div');
    barFill.className = 'pmv-demo-bar-fill';
    barTrack.appendChild(barFill);
    painelProgresso.appendChild(barTrack);

    var completeBtn = document.createElement('button');
    completeBtn.className = 'pmv-demo-btn';
    completeBtn.type = 'button';
    completeBtn.textContent = 'Completar ciclo de foco';
    painelProgresso.appendChild(completeBtn);

    var timeLabel = document.createElement('div');
    timeLabel.className = 'pmv-demo-subtitle';
    timeLabel.textContent = 'Horário (prévia)';
    painelProgresso.appendChild(timeLabel);

    var timeRow = document.createElement('div');
    timeRow.className = 'pmv-demo-time-row';
    var TIME_OPTIONS = [
      { label: 'Auto', hour: null }, { label: 'Manhã', hour: 8 },
      { label: 'Meio-dia', hour: 13 }, { label: 'Pôr do sol', hour: 19 },
      { label: 'Noite', hour: 22 }
    ];
    var timeButtons = [];
    TIME_OPTIONS.forEach(function (opt) {
      var btn = document.createElement('button');
      btn.className = 'pmv-demo-time-btn';
      btn.type = 'button';
      btn.textContent = opt.label;
      btn.addEventListener('click', function () {
        if (theme() && typeof theme().setTimeOverrideHour === 'function') {
          theme().setTimeOverrideHour(opt.hour);
        }
        timeButtons.forEach(function (b) { b.classList.toggle('pmv-active', b === btn); });
      });
      timeRow.appendChild(btn);
      timeButtons.push(btn);
    });
    timeButtons[0].classList.add('pmv-active');
    painelProgresso.appendChild(timeRow);

    var resetBtn = document.createElement('button');
    resetBtn.className = 'pmv-demo-btn pmv-demo-btn-ghost';
    resetBtn.type = 'button';
    resetBtn.textContent = 'Zerar demo (nova cena)';
    painelProgresso.appendChild(resetBtn);

    // ---- Aba: peças ----
    var bandejaTitulo = document.createElement('div');
    bandejaTitulo.className = 'pmv-demo-subtitle';
    bandejaTitulo.textContent = 'Esperando um lugar';
    painelPecas.appendChild(bandejaTitulo);

    var bandeja = document.createElement('div');
    bandeja.className = 'pmv-bandeja';
    painelPecas.appendChild(bandeja);

    var fogTitulo = document.createElement('div');
    fogTitulo.className = 'pmv-demo-subtitle';
    fogTitulo.textContent = 'Na fogueira';
    painelPecas.appendChild(fogTitulo);

    var fogRow = document.createElement('div');
    fogRow.className = 'pmv-demo-time-row';
    var fogBotoes = {};
    [{ id: 'tripe', label: 'Tripé' }, { id: 'lenha', label: 'Lenha' }].forEach(function (opt) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'pmv-demo-time-btn';
      b.textContent = opt.label;
      b.addEventListener('click', function () {
        theme().setEstiloFogueira(opt.id);
        anunciar('Fogueira agora com ' + opt.label.toLowerCase() + '.');
        refresh();
      });
      fogRow.appendChild(b);
      fogBotoes[opt.id] = b;
    });
    painelPecas.appendChild(fogRow);

    var note = document.createElement('div');
    note.className = 'pmv-demo-note';
    note.textContent = 'Cada ciclo entrega uma peça. Escolha o lugar dela com calma: ' +
      'depois de confirmar, a peça faz parte do acampamento e não se move mais.';
    painelPecas.appendChild(note);

    // ---- Pastilha ----
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

    // ---- Controles flutuantes da peça em colocação ----
    var flutuante = document.createElement('div');
    flutuante.className = 'pmv-flutuante';
    flutuante.setAttribute('role', 'toolbar');

    function botaoFlutuante(texto, rotulo, acao) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'pmv-flutuante-btn';
      b.textContent = texto;
      b.title = rotulo;
      b.setAttribute('aria-label', rotulo);
      b.addEventListener('click', acao);
      flutuante.appendChild(b);
      return b;
    }
    var fbGirarEsq = botaoFlutuante('↶', 'Girar para a esquerda', function () { girar(-2); });
    var fbGirarDir = botaoFlutuante('↷', 'Girar para a direita', function () { girar(2); });
    var fbEspelhar = botaoFlutuante('⇄', 'Espelhar', function () {
      var sel = alvoAtual();
      if (!sel) return;
      var virada = theme().espelharPeca(sel);
      anunciar(nomeDe(sel) + (virada ? ' espelhada.' : ' desespelhada.'));
      posicionarFlutuante();
    });
    var fbConfirmar = botaoFlutuante('✓', 'Confirmar: a peça não se move mais', function () {
      var sel = alvoAtual();
      if (!sel) return;
      anunciar(nomeDe(sel) + ' fixada. Ela faz parte do acampamento agora.');
      theme().confirmarPeca(sel);
    });
    fbConfirmar.classList.add('pmv-flutuante-ok');
    var fbCancelar = botaoFlutuante('✕', 'Devolver à bandeja', function () {
      var sel = alvoAtual();
      if (!sel) return;
      anunciar(nomeDe(sel) + ' voltou para a bandeja.');
      theme().devolverPeca(sel);
    });

    function alvoAtual() {
      return theme().pecaEmColocacao ? theme().pecaEmColocacao() : null;
    }

    function girar(delta) {
      var sel = alvoAtual();
      if (!sel) return;
      var novo = theme().girarPeca(sel, delta);
      if (novo !== null) anunciar(nomeDe(sel) + ' girada para ' + novo.toFixed(0) + ' graus.');
      posicionarFlutuante();
    }

    // A barra acompanha a peça. Fica ACIMA dela e presa à tela, porque uma
    // peça no fundo da cena é pequena e a barra não pode encolher junto -
    // botão que encolhe com a perspectiva vira alvo impossível.
    function posicionarFlutuante() {
      var sel = alvoAtual();
      if (!sel) { flutuante.classList.remove('pmv-visivel'); return; }
      var entry = theme().entradaDe(sel);
      if (!entry) { flutuante.classList.remove('pmv-visivel'); return; }

      var caixa = entry.group.getBoundingClientRect();
      flutuante.classList.add('pmv-visivel');
      var larguraBarra = flutuante.offsetWidth || 150;
      var alturaBarra = flutuante.offsetHeight || 34;
      var x = caixa.left + caixa.width / 2 - larguraBarra / 2;
      var y = caixa.top - alturaBarra - 10;
      // Se não couber acima (peça colada no topo), vai pra baixo dela.
      if (y < 6) y = caixa.bottom + 10;
      x = Math.max(6, Math.min(x, window.innerWidth - larguraBarra - 6));
      y = Math.max(6, Math.min(y, window.innerHeight - alturaBarra - 6));
      flutuante.style.left = Math.round(x) + 'px';
      flutuante.style.top = Math.round(y) + 'px';

      var faixa = theme().giroPermitido ? theme().giroPermitido(sel) : [0, 0];
      var podeGirar = faixa[0] !== faixa[1];
      fbGirarEsq.disabled = !podeGirar;
      fbGirarDir.disabled = !podeGirar;
    }

    // ---- Bandeja ----
    function montarBandeja() {
      while (bandeja.firstChild) bandeja.removeChild(bandeja.firstChild);
      var ids = self.inventory ? self.inventory.bandeja() : [];
      if (!ids.length) {
        var vazia = document.createElement('div');
        vazia.className = 'pmv-bandeja-vazia';
        vazia.textContent = alvoAtual()
          ? 'Posicione a peça que está em cena para liberar as próximas.'
          : 'Nada esperando. Complete um ciclo para ganhar uma peça.';
        bandeja.appendChild(vazia);
        return;
      }
      ids.forEach(function (slotId) { bandeja.appendChild(itemDaBandeja(slotId)); });
    }

    function itemDaBandeja(slotId) {
      var nome = nomeDe(slotId);
      var item = document.createElement('button');
      item.type = 'button';
      item.className = 'pmv-bandeja-item';
      item.setAttribute('data-pmv-slot', slotId);
      // Enquanto uma peça está sendo colocada, as outras esperam: duas peças
      // soltas ao mesmo tempo dariam duas barras de controle e a pergunta
      // "confirmar qual?".
      var ocupado = !!alvoAtual();
      item.disabled = ocupado;
      item.title = ocupado
        ? 'Confirme a peça em cena primeiro'
        : nome + ' — clique para posicionar, arraste para escolher o lugar';
      item.setAttribute('aria-label', nome + ', posicionar');

      var mini = theme().miniatura ? theme().miniatura(slotId, 40) : null;
      if (mini) item.appendChild(mini);
      var legenda = document.createElement('span');
      legenda.className = 'pmv-bandeja-nome';
      legenda.textContent = nome;
      item.appendChild(legenda);

      var arrastou = false;

      // Arrastar da bandeja só começa DEPOIS de um limiar de movimento. Sem
      // ele, um clique simples viraria arrasto e a peça seria largada
      // debaixo da própria bandeja, que é onde o dedo estava.
      item.addEventListener('pointerdown', function (ev) {
        if (item.disabled || !self.placement) return;
        var inicio = { x: ev.clientX, y: ev.clientY };
        arrastou = false;

        function mover(e2) {
          if (Math.abs(e2.clientX - inicio.x) + Math.abs(e2.clientY - inicio.y) < 8) return;
          desligar();
          arrastou = true;
          if (self.placement.iniciarDaBandeja(slotId, e2, item)) {
            anunciar(nome + ' na mão. Solte onde quiser deixar.');
          }
        }
        function desligar() {
          item.removeEventListener('pointermove', mover);
          item.removeEventListener('pointerup', desligar);
          item.removeEventListener('pointercancel', desligar);
        }
        try { item.setPointerCapture(ev.pointerId); } catch (e) { /* sem captura */ }
        item.addEventListener('pointermove', mover);
        item.addEventListener('pointerup', desligar);
        item.addEventListener('pointercancel', desligar);
      });

      item.addEventListener('click', function () {
        if (arrastou) { arrastou = false; return; }
        theme().colocarPeca(slotId, null);
        anunciar(nome + ' posicionada no lugar sugerido. Ajuste e confirme.');
      });

      return item;
    }

    // ---- Atualização ----
    function refresh() {
      var pct = Math.min(100, Math.round(self.scene.progress * 100));
      var esperando = self.inventory ? self.inventory.bandeja().length : 0;
      var colocando = !!alvoAtual();

      progressLabel.textContent = 'Progresso acumulado: ' + pct + '%';
      barFill.style.width = pct + '%';
      pillPct.textContent = pct + '%';
      pill.classList.toggle('pmv-tem-pendente', esperando > 0 || colocando);
      botoesAba.pecas.classList.toggle('pmv-tem-pendente', esperando > 0 || colocando);

      montarBandeja();
      posicionarFlutuante();

      var estilo = theme().estiloFogueira ? theme().estiloFogueira() : 'tripe';
      Object.keys(fogBotoes).forEach(function (k) {
        fogBotoes[k].classList.toggle('pmv-active', k === estilo);
      });

      if (a11yStatus && !colocando) {
        var montadas = theme() && theme().grownCount ? theme().grownCount() : 0;
        a11yStatus.textContent = 'Acampamento em ' + pct + '%: ' + montadas +
          ' coisas montadas' +
          (esperando ? ', ' + esperando + ' esperando para ser posicionadas' : '') + '.';
      }
    }

    function setOpen(open) {
      card.classList.toggle('pmv-open', open);
      pill.classList.toggle('pmv-active', open);
    }

    completeBtn.addEventListener('click', function () {
      self.scene.onFocusComplete(self.scene.progress + CYCLE_INCREMENT);
      refresh();
    });

    resetBtn.addEventListener('click', function () {
      if (self.inventory) self.inventory.limpar();
      window.location.reload();
    });

    pill.addEventListener('click', function () {
      setOpen(!card.classList.contains('pmv-open'));
    });
    closeBtn.addEventListener('click', function () { setOpen(false); });

    // Qualquer mudança de estado redesenha - inclusive uma peça destravada
    // lá dentro do setProgress. Guarda contra reentrância porque refresh()
    // lê o inventário e não deve poder reentrar nele.
    if (self.inventory) {
      var redesenhando = false;
      self.inventory.onChange = function () {
        if (redesenhando) return;
        redesenhando = true;
        try { refresh(); } finally { redesenhando = false; }
      };
    }

    if (self.placement) {
      self.placement.onChange = function () { refresh(); };
      // Durante o arrasto a barra precisa acompanhar a peça quadro a quadro;
      // esperar o fim do gesto a deixaria parada no lugar antigo.
      self.placement.onMove = posicionarFlutuante;
      self.placement.onAnnounce = anunciar;
    }
    window.addEventListener('resize', posicionarFlutuante);

    root.appendChild(card);
    root.appendChild(pill);
    root.appendChild(flutuante);
    abrirAba('progresso');
    refresh();
  };

  PMV.Demo.Harness = Harness;
})(window.PMV = window.PMV || {});
