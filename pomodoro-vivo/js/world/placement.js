(function (PMV) {
  'use strict';

  PMV.World = PMV.World || {};

  // Arrastar uma peça do acampamento pelo chão.
  //
  // A pergunta difícil de um editor de cena em perspectiva - "o usuário
  // soltou aqui na tela; onde isso fica no mundo?" - já estava respondida
  // antes deste arquivo existir: o plano de chão é inversível
  // (`background.depthAtY`). Daí sai a profundidade, e da profundidade saem
  // sozinhos o Y de contato, a escala, a névoa e a ordem de desenho.
  //
  // Por isso aqui não existe nenhuma matemática de cena. Este módulo só
  // traduz eventos de ponteiro em (xf, depth) e deixa o tema fazer o resto.
  //
  // Pointer Events, e não mouse+touch separados: é um caminho só pra dedo,
  // mouse e caneta, e traz setPointerCapture - que é o que impede o arrasto
  // de morrer quando o ponteiro sai de cima da peça (e ele SEMPRE sai, porque
  // a peça encolhe enquanto vai pro fundo).

  // Passo do teclado. Fino de propósito: quem posiciona por seta quer
  // ajustar, e quem quer atravessar a tela segura a tecla. Shift multiplica.
  var PASSO_XF = 0.008;
  var PASSO_DEPTH = 0.006;
  var MULT_RAPIDO = 5;

  function Placement(opts) {
    this.theme = opts.theme;
    // A escuta e a busca por peças móveis são no PALCO, não numa camada: as
    // peças estão espalhadas por várias raízes SVG e uma delas sozinha não
    // enxerga as outras. Pro cálculo de coordenadas serve qualquer raiz -
    // todas compartilham o mesmo viewBox -, e `svgRef` fixa uma.
    this.stage = opts.stage;
    this.svgRef = opts.stage.querySelector('.pmv-layer-svg');
    this.onChange = opts.onChange || function () {};
    this.onAnnounce = opts.onAnnounce || function () {};
    // Disparado a cada movimento do ponteiro - é o que deixa a barra de
    // controles grudada na peça durante o arrasto.
    this.onMove = opts.onMove || function () {};

    this.enabled = false;
    this.selecionado = null;
    this._drag = null;

    this._onDown = this._pointerDown.bind(this);
    this._onMove = this._pointerMove.bind(this);
    this._onUp = this._pointerUp.bind(this);
    this._onKey = this._keyDown.bind(this);
    this._onFocus = this._focusIn.bind(this);

    // A camada do acampamento é refeita do zero em vários caminhos (resize,
    // colocar, devolver). Cada reconstrução joga fora os grupos antigos e
    // com eles o tabindex e o rótulo acessível - que precisam ser repostos,
    // senão o Tab para de alcançar as peças depois do primeiro resize.
    var self = this;
    this.theme.onRebuild = function () { self.sincronizar(); };
  }

  // Não existe mais "modo de edição".
  //
  // O que pode ser mexido é decidido peça a peça, pelo estado dela: só a que
  // está EM COLOCAÇÃO carrega `data-pmv-movel`, e é só nela que o CSS libera
  // ponteiro. Um modo global era uma pergunta a mais ("estou editando?")
  // para responder a mesma coisa que o estado da peça já responde - e
  // permitia mexer no que já tinha sido decidido, que é justamente o que a
  // regra do jogo não quer.
  Placement.prototype.ligarEscuta = function () {
    this.stage.addEventListener('pointerdown', this._onDown);
    this.stage.addEventListener('keydown', this._onKey);
    this.stage.addEventListener('focusin', this._onFocus);
    this.sincronizar();
  };

  // ---- Teclado ----
  //
  // Sem isto o recurso inteiro depende de arrastar, e arrastar é justamente
  // o gesto que exclui quem não usa ponteiro. A página já se deu o trabalho
  // de narrar a cena pra leitor de tela; entregar um editor que só responde
  // a dedo jogaria esse trabalho fora.
  //
  // Só as peças MÓVEIS entram na ordem de tabulação, e só no modo de edição:
  // fora dele a cena é decoração, e decoração não deve prender o Tab.
  // Põe a camada em dia depois de qualquer reconstrução: quem é móvel ganha
  // foco de teclado e rótulo, e a peça em colocação vira a selecionada.
  Placement.prototype.sincronizar = function () {
    var moveis = this.stage.querySelectorAll('[data-pmv-movel]');
    // A classe existe só pelas regras de ponteiro e touch-action do CSS, e
    // acompanha a existência de uma peça em colocação - ninguém liga nem
    // desliga isso à mão. Vai no palco porque as regras precisam alcançar a
    // peça em qualquer uma das camadas.
    this.stage.classList.toggle('pmv-editando', moveis.length > 0);
    this.enabled = moveis.length > 0;

    var slotId = null;
    for (var i = 0; i < moveis.length; i++) {
      var g = moveis[i];
      slotId = g.getAttribute('data-pmv-slot');
      g.setAttribute('tabindex', '0');
      g.setAttribute('role', 'application');
      g.setAttribute('aria-label',
        this.theme.rotuloDe(slotId) + ', ' + this.descrever(slotId) +
        '. Use as setas para mover, Enter para confirmar.');
      g.classList.add('pmv-selecionado');
    }
    this.selecionado = slotId;
    this.onChange(this);
  };

  // Posição em PALAVRAS. Para quem move por seta e não vê a tela, "esquerda,
  // ao fundo" diz mais que 0.23 e 0.41 - e é a única devolutiva que essa
  // pessoa recebe do gesto.
  Placement.prototype.descrever = function (slotId) {
    var entry = this.theme.entradaDe(slotId);
    if (!entry) return '';
    var xf = entry.inst.xf, d = entry.inst.depth;
    var lado = xf < 0.33 ? 'à esquerda' : (xf > 0.67 ? 'à direita' : 'ao centro');
    var lim = this.theme.limites().depth;
    var t = (d - lim[0]) / (lim[1] - lim[0]);
    var plano = t < 0.33 ? 'ao fundo' : (t > 0.67 ? 'à frente' : 'no meio');
    return lado + ', ' + plano;
  };

  Placement.prototype._focusIn = function (ev) {
    var alvo = ev.target.closest ? ev.target.closest('[data-pmv-movel]') : null;
    if (!alvo) return;
    // Peça nova em foco: a próxima descrição é sempre digna de anúncio,
    // mesmo que por acaso caia na mesma faixa da peça anterior.
    this._ultimaDescricao = null;
  };

  Placement.prototype._keyDown = function (ev) {
    if (!this.enabled) return;
    var alvo = ev.target.closest ? ev.target.closest('[data-pmv-movel]') : null;
    if (!alvo) return;
    var slotId = alvo.getAttribute('data-pmv-slot');
    var entry = this.theme.entradaDe(slotId);
    if (!entry) return;

    var mult = ev.shiftKey ? MULT_RAPIDO : 1;
    var dxf = 0, ddepth = 0;
    switch (ev.key) {
      case 'ArrowLeft':  dxf = -PASSO_XF * mult; break;
      case 'ArrowRight': dxf = PASSO_XF * mult; break;
      // Cima é PRA LONGE. A tecla aponta pra onde a peça vai na tela, e no
      // plano de chão o fundo é em cima - inverter isso aqui faria a seta
      // discordar do que os olhos de quem enxerga veem acontecer.
      case 'ArrowUp':    ddepth = -PASSO_DEPTH * mult; break;
      case 'ArrowDown':  ddepth = PASSO_DEPTH * mult; break;
      case 'Enter':
      case ' ':
        // Enter CONFIRMA - e confirmar é definitivo.
        this.onAnnounce(this.theme.rotuloDe(slotId) + ' fixada ' + this.descrever(slotId) + '. Ela não se move mais.');
        this.theme.confirmarPeca(slotId);
        ev.preventDefault();
        return;
      case 'Escape':
        this.onAnnounce(this.theme.rotuloDe(slotId) + ' voltou para a bandeja.');
        this.theme.devolverPeca(slotId);
        ev.preventDefault();
        return;
      default:
        return;
    }

    var inst = entry.inst;
    var novoXf = inst.xf + dxf;
    var novoDepth = inst.depth + ddepth;
    if (this.theme.background.isWater(novoXf * this.theme.width, novoDepth)) {
      this.onAnnounce('Ali é água.');
      ev.preventDefault();
      return;
    }
    this.theme.moverPeca(slotId, novoXf, novoDepth);
    this.theme.soltarPeca(slotId);

    var desc = this.descrever(slotId);
    // O rótulo é o que o leitor de tela relê quando o foco não mudou - fica
    // sempre em dia, mesmo quando nada é anunciado.
    alvo.setAttribute('aria-label',
      this.theme.rotuloDe(slotId) + ', ' + desc + '. Use as setas para mover.');

    // Só anuncia quando a descrição MUDA. O passo da seta é fino e a
    // descrição é grossa (esquerda/centro/direita × fundo/meio/frente),
    // então repetir "à direita, ao fundo" a cada tecla enche a região viva
    // de ruído e afoga o que importa - inclusive a recusa da água, que é a
    // única coisa que a pessoa precisa mesmo ouvir na hora.
    if (desc !== this._ultimaDescricao) {
      this._ultimaDescricao = desc;
      this.onAnnounce(desc);
    }
    ev.preventDefault();
  };

  // Coordenadas do evento no sistema da CENA.
  //
  // Passa pelo viewBox em vez de usar clientX cru: hoje o SVG é do tamanho da
  // janela e a razão é 1:1, mas isso é coincidência de layout, não contrato -
  // e um dia em que deixe de ser, o arrasto sairia deslizando em relação ao
  // dedo, que é o tipo de bug que se sente antes de se entender.
  Placement.prototype._toScene = function (ev) {
    var rect = this.svgRef.getBoundingClientRect();
    var vb = this.svgRef.viewBox.baseVal;
    var largura = rect.width || vb.width || 1;
    var altura = rect.height || vb.height || 1;
    return {
      x: (ev.clientX - rect.left) * ((vb.width || largura) / largura),
      y: (ev.clientY - rect.top) * ((vb.height || altura) / altura)
    };
  };

  Placement.prototype._pointerDown = function (ev) {
    if (!this.enabled || this._drag) return;
    var alvo = ev.target.closest ? ev.target.closest('[data-pmv-movel]') : null;
    if (!alvo) return;
    var slotId = alvo.getAttribute('data-pmv-slot');
    var entry = this.theme.entradaDe(slotId);
    if (!entry) return;

    var p = this._toScene(ev);
    // Pega pelo ponto em que o dedo encostou, não pelo pivô: sem guardar esse
    // deslocamento a peça salta pra debaixo do cursor no primeiro movimento.
    this._iniciar(slotId, alvo, alvo, ev,
                  p.x - entry.inst.x, p.y - entry.inst.y);
  };

  // Puxar uma peça DA BANDEJA direto pra cena.
  //
  // A peça ainda não existe no DOM, então ela é colocada primeiro, já no
  // ponto onde o dedo está, e o arrasto começa em seguida - com
  // deslocamento zero, que é o gesto de "tirar da caixa e apoiar".
  //
  // O `captor` é o botão da bandeja, e não a peça: o pointerdown aconteceu
  // LÁ, e é ele que pode capturar o ponteiro. A peça em cena nem existia
  // quando o dedo encostou.
  Placement.prototype.iniciarDaBandeja = function (slotId, ev, captor) {
    if (!this.enabled || this._drag) return false;

    var p = this._toScene(ev);
    var bg = this.theme.background;
    var lim = this.theme.limites();
    var depth = clamp(bg.depthAtY(p.x, p.y), lim.depth[0], lim.depth[1]);
    var xf = clamp(p.x / (this.theme.width || 1), lim.xf[0], lim.xf[1]);
    var padrao = this.theme.posicaoPadrao(slotId) || { rot: 0 };

    if (!this.theme.colocarPeca(slotId, { xf: xf, depth: depth, rot: padrao.rot, espelhada: false })) {
      return false;
    }
    var entry = this.theme.entradaDe(slotId);
    if (!entry) return false;

    this._iniciar(slotId, entry.group, captor, ev, 0, 0);
    // Nasceu na mão: se o usuário soltar em cima d'água, a peça não tem
    // "lugar de origem" pra onde voltar - ela volta pra bandeja.
    this._drag.daBandeja = true;
    return true;
  };

  Placement.prototype._iniciar = function (slotId, grupo, captor, ev, offsetX, offsetY) {
    var entry = this.theme.entradaDe(slotId);
    this._drag = {
      slotId: slotId,
      grupo: grupo,
      captor: captor,
      offsetX: offsetX,
      offsetY: offsetY,
      origem: {
        xf: entry.inst.xf, depth: entry.inst.depth,
        rot: entry.inst.rotation, espelhada: !!entry.inst.espelhada
      },
      valido: true,
      moveu: false,
      daBandeja: false
    };

    grupo.classList.add('pmv-arrastando');
    this.theme.trazerPraFrente(slotId);

    // A captura garante que os eventos seguintes venham pra cá mesmo que o
    // ponteiro saia da peça, do SVG ou da janela.
    try { captor.setPointerCapture(ev.pointerId); } catch (e) { /* sem captura */ }
    captor.addEventListener('pointermove', this._onMove);
    captor.addEventListener('pointerup', this._onUp);
    captor.addEventListener('pointercancel', this._onUp);
    if (ev.cancelable) ev.preventDefault();
  };

  Placement.prototype._pointerMove = function (ev) {
    var d = this._drag;
    if (!d) return;

    var p = this._toScene(ev);
    var x = p.x - d.offsetX;
    var y = p.y - d.offsetY;

    var bg = this.theme.background;
    var lim = this.theme.limites();
    var depth = clamp(bg.depthAtY(x, y), lim.depth[0], lim.depth[1]);
    var xf = clamp(x / (this.theme.width || 1), lim.xf[0], lim.xf[1]);

    // Água: a peça continua acompanhando o dedo (tirar o controle da mão de
    // quem arrasta é pior que deixar passar), mas fica marcada como inválida
    // e é recusada no momento de soltar.
    d.valido = !bg.isWater(xf * this.theme.width, depth);
    d.grupo.classList.toggle('pmv-invalido', !d.valido);

    this.theme.moverPeca(d.slotId, xf, depth);
    d.moveu = true;
    this.onMove(this);
    if (ev.cancelable) ev.preventDefault();
  };

  Placement.prototype._pointerUp = function (ev) {
    var d = this._drag;
    if (!d) return;
    var slotId = d.slotId;
    var eraDaBandeja = d.daBandeja;
    var moveu = d.moveu;

    if (d.valido) {
      this.theme.soltarPeca(slotId);
    } else if (eraDaBandeja) {
      // Nasceu na mão e foi largada num lugar recusado: não há lugar de
      // origem em cena, então ela volta pra bandeja de onde saiu.
      this._encerrar(ev);
      this.theme.devolverPeca(slotId);
      return;
    } else {
      // Recusado: volta exatamente pra onde estava, inclusive giro e espelho.
      this.theme.moverPeca(slotId, d.origem.xf, d.origem.depth,
                           { rot: d.origem.rot, espelhada: d.origem.espelhada });
      this.theme.soltarPeca(slotId);
    }
    this._encerrar(ev);
    this.onChange(this);
  };

  Placement.prototype._cancelar = function () {
    var d = this._drag;
    if (!d) return;
    var slotId = d.slotId, daBandeja = d.daBandeja;
    this._encerrar(null);
    if (daBandeja) {
      this.theme.devolverPeca(slotId);
    } else {
      this.theme.moverPeca(slotId, d.origem.xf, d.origem.depth,
                           { rot: d.origem.rot, espelhada: d.origem.espelhada });
      this.theme.soltarPeca(slotId);
    }
  };

  Placement.prototype._encerrar = function (ev) {
    var d = this._drag;
    if (!d) return;
    d.grupo.classList.remove('pmv-arrastando', 'pmv-invalido');
    d.captor.removeEventListener('pointermove', this._onMove);
    d.captor.removeEventListener('pointerup', this._onUp);
    d.captor.removeEventListener('pointercancel', this._onUp);
    if (ev) {
      try { d.captor.releasePointerCapture(ev.pointerId); } catch (e) { /* já solto */ }
    }
    this._drag = null;
  };

  Placement.prototype.arrastando = function () {
    return this._drag ? this._drag.slotId : null;
  };

  function clamp(v, min, max) {
    return v < min ? min : (v > max ? max : v);
  }

  PMV.World.Placement = Placement;
})(window.PMV = window.PMV || {});
