(function (PMV) {
  'use strict';

  PMV.World = PMV.World || {};

  // O que o usuário GANHOU e onde ele PÔS cada coisa.
  //
  // Estado puro: sem DOM, sem canvas, sem render. Dá pra ler e mexer inteiro
  // pelo console, e é de propósito - a colocação por arrasto é a parte que
  // mais vai mudar de ideia, e ela não pode arrastar a verdade junto.
  //
  // A divisão de trabalho com o catálogo (CAMP_PLAN em composition.js):
  //
  //   o catálogo diz o que EXISTE, em que ordem é ganho e onde fica por
  //     padrão - é direção de arte, versionada com o código;
  //   o inventário diz o que ESTE usuário já ganhou e o que ele fez com
  //     isso - é dado dele, e mora no localStorage.
  //
  // Por isso o registro de uma peça colocada pode não ter posição nenhuma:
  // significa "colocada onde o catálogo manda". Quem nunca arrastar nada
  // continua vendo exatamente a cena autoral, e o arquivo salvo fica do
  // tamanho do que a pessoa de fato personalizou.
  //
  // Guarda `xf` (fração da largura) e `depth`, NUNCA pixels: é o que faz a
  // cena sobreviver a um resize ou a abrir no celular depois do desktop.

  var CHAVE = 'pmv-acampamento-v1';
  var CHAVE_ANTIGA = 'pmv-demo-progress-acampamento';
  var VERSAO = 1;

  var BLOQUEADA = 'bloqueada';
  var NA_BANDEJA = 'na-bandeja';
  var COLOCADA = 'colocada';

  var ESTILO_FOGUEIRA_PADRAO = 'tripe';

  function Inventory() {
    this.progresso = 0;
    // Qual cara a fogueira tem: 'tripe' (panela pendurada) ou 'lenha'
    // (achas armadas em tenda). Não é peça ganha nem posicionada - é uma
    // escolha, e por isso mora fora do mapa de peças.
    this.estiloFogueira = ESTILO_FOGUEIRA_PADRAO;
    this.pecas = {};            // slotId -> { estado, ordem, xf?, depth?, rot?, espelhada? }
    this._migrarProgresso = null;
    // Avisado sempre que o estado muda e é gravado. Existe porque a bandeja
    // precisa se redesenhar quando uma peça é DESTRAVADA, e destravar
    // acontece dentro do setProgress do tema - longe de qualquer botão.
    // Sem isto a interface só ficava em dia por acidente, porque o botão da
    // vitrine chamava o refresh à mão logo depois; um cronômetro de verdade
    // completando um ciclo deixaria a peça ganha invisível até o próximo
    // clique em qualquer coisa.
    this.onChange = null;
  }

  Inventory.ESTADOS = { BLOQUEADA: BLOQUEADA, NA_BANDEJA: NA_BANDEJA, COLOCADA: COLOCADA };

  // ---- Persistência ----

  Inventory.prototype.load = function () {
    var bruto = null;
    try { bruto = window.localStorage.getItem(CHAVE); } catch (e) { return this; }

    if (bruto) {
      try {
        var dados = JSON.parse(bruto);
        if (dados && dados.versao === VERSAO) {
          this.progresso = Math.max(0, Number(dados.progresso) || 0);
          this.estiloFogueira = dados.estiloFogueira || ESTILO_FOGUEIRA_PADRAO;
          this.pecas = dados.pecas || {};
          // Peça que ficou PROVISÓRIA quando a aba fechou volta pra bandeja.
          // Ela nunca foi confirmada, então não pode ser congelada por
          // acidente - fechar o navegador no meio da colocação não é
          // decisão, é interrupção.
          var self = this;
          Object.keys(this.pecas).forEach(function (id) {
            var p = self.pecas[id];
            if (!p.provisoria) return;
            p.estado = NA_BANDEJA;
            delete p.provisoria;
            delete p.xf; delete p.depth; delete p.rot; delete p.espelhada;
          });
          return this;
        }
      } catch (e) { /* salvo corrompido - cai na migração/começo limpo */ }
    }

    // Migração de quem já tinha acampamento antes de existir bandeja: o
    // formato velho era um float solto com o progresso. Marcar a migração e
    // deixar o sync resolver, porque só lá existe a lista de slots - e
    // ninguém pode perder o acampamento que já tem por causa da mudança.
    try {
      var antigo = window.localStorage.getItem(CHAVE_ANTIGA);
      if (antigo !== null) {
        this.progresso = Math.max(0, parseFloat(antigo) || 0);
        this._migrarProgresso = this.progresso;
      }
    } catch (e) { /* sem localStorage - segue sem persistir */ }

    return this;
  };

  Inventory.prototype.save = function () {
    try {
      window.localStorage.setItem(CHAVE, JSON.stringify({
        versao: VERSAO,
        progresso: this.progresso,
        estiloFogueira: this.estiloFogueira,
        pecas: this.pecas
      }));
    } catch (e) { /* localStorage indisponível - a sessão segue sem persistir */ }
    if (this.onChange) this.onChange(this);
    return this;
  };

  // ---- Destrave ----

  // Recebe as instâncias já expandidas (elas trazem `slotId`, `threshold` e
  // `fixo` concretos) e destrava o que o progresso alcançou. Função pura do
  // progresso: chamar duas vezes com o mesmo valor não muda nada.
  //
  // Devolve os ids destravados AGORA - é o que a interface usa pra anunciar
  // "você ganhou uma barraca" sem ter que diferenciar estado por conta
  // própria.
  Inventory.prototype.sync = function (instancias, progresso) {
    var antes = this.progresso;
    if (typeof progresso === 'number') {
      this.progresso = Math.max(this.progresso, progresso);
    }
    var migrando = this._migrarProgresso !== null;
    var novas = [];

    for (var i = 0; i < instancias.length; i++) {
      var inst = instancias[i];
      // A fogueira nunca entra no inventário: não é ganha nem posicionada.
      if (inst.fixo) continue;
      if (this.pecas[inst.slotId]) continue;
      if (inst.threshold > this.progresso) continue;

      this.pecas[inst.slotId] = {
        // Na migração a peça já estava EM CENA, então ela continua em cena -
        // na posição do catálogo, que é onde o usuário a viu pela última vez.
        estado: migrando ? COLOCADA : NA_BANDEJA,
        ordem: inst.threshold
      };
      if (!migrando) novas.push(inst.slotId);
    }

    if (migrando) this._migrarProgresso = null;
    // Salvar aqui, e não em quem chama, é o que garante que o progresso
    // persiste por qualquer caminho que o faça andar - inclusive um
    // onFocusComplete disparado por código que não conhece o inventário.
    if (migrando || novas.length || this.progresso !== antes) this.save();
    return novas;
  };

  // ---- Consultas ----

  Inventory.prototype.estado = function (slotId) {
    var p = this.pecas[slotId];
    return p ? p.estado : BLOQUEADA;
  };

  // Posição escolhida pelo usuário, ou null pra "onde o catálogo manda".
  Inventory.prototype.colocacao = function (slotId) {
    var p = this.pecas[slotId];
    if (!p || p.estado !== COLOCADA) return null;
    if (typeof p.xf !== 'number' || typeof p.depth !== 'number') return null;
    return { xf: p.xf, depth: p.depth, rot: p.rot || 0, espelhada: !!p.espelhada };
  };

  // Ids na bandeja, na ordem em que foram ganhos.
  Inventory.prototype.bandeja = function () {
    var self = this;
    return Object.keys(this.pecas)
      .filter(function (id) { return self.pecas[id].estado === NA_BANDEJA; })
      .sort(function (a, b) { return (self.pecas[a].ordem || 0) - (self.pecas[b].ordem || 0); });
  };

  Inventory.prototype.colocadas = function () {
    var self = this;
    return Object.keys(this.pecas).filter(function (id) {
      return self.pecas[id].estado === COLOCADA;
    });
  };

  // ---- Mutações ----

  // pos: { xf, depth, rot, espelhada } ou nada, pra usar a posição autoral
  // ("posicionar por mim").
  //
  // `provisoria` marca a peça como AINDA EM COLOCAÇÃO: ela já aparece em
  // cena e pode ser arrastada, girada e espelhada, mas nada disso é
  // definitivo. Só o `confirmar` congela.
  Inventory.prototype.colocar = function (slotId, pos, provisoria) {
    var p = this.pecas[slotId];
    if (!p) return false;
    p.estado = COLOCADA;
    if (provisoria) p.provisoria = true; else delete p.provisoria;
    if (pos) {
      p.xf = pos.xf;
      p.depth = pos.depth;
      p.rot = pos.rot || 0;
      p.espelhada = !!pos.espelhada;
    } else {
      // Sem posição: apaga qualquer override antigo e volta pro catálogo.
      delete p.xf; delete p.depth; delete p.rot; delete p.espelhada;
    }
    this.save();
    return true;
  };

  // Congela a peça onde ela está. A partir daqui ela não se mexe mais - é a
  // regra do jogo: quem se arrepende não desfaz, contorna com as próximas
  // peças. O passo existe justamente pra que o congelamento seja um ATO, e
  // não a consequência de um dedo escorregando.
  Inventory.prototype.confirmar = function (slotId) {
    var p = this.pecas[slotId];
    if (!p || p.estado !== COLOCADA) return false;
    delete p.provisoria;
    this.save();
    return true;
  };

  Inventory.prototype.provisoria = function () {
    var ids = Object.keys(this.pecas);
    for (var i = 0; i < ids.length; i++) {
      if (this.pecas[ids[i]].provisoria) return ids[i];
    }
    return null;
  };

  Inventory.prototype.ehDefinitiva = function (slotId) {
    var p = this.pecas[slotId];
    return !!p && p.estado === COLOCADA && !p.provisoria;
  };

  Inventory.prototype.devolver = function (slotId) {
    var p = this.pecas[slotId];
    if (!p) return false;
    p.estado = NA_BANDEJA;
    this.save();
    return true;
  };

  Inventory.prototype.setProgresso = function (valor) {
    // Progresso é cumulativo entre ciclos - nunca aceita regressão, mesma
    // regra do SceneManager.
    this.progresso = Math.max(this.progresso, valor);
    return this.progresso;
  };

  // Zera tudo, inclusive o formato antigo - senão o "zerar demo" ressuscita
  // o acampamento migrado no próximo carregamento.
  Inventory.prototype.setEstiloFogueira = function (estilo) {
    if (estilo !== 'tripe' && estilo !== 'lenha') return false;
    if (this.estiloFogueira === estilo) return false;
    this.estiloFogueira = estilo;
    this.save();
    return true;
  };

  Inventory.prototype.limpar = function () {
    this.progresso = 0;
    this.estiloFogueira = ESTILO_FOGUEIRA_PADRAO;
    this.pecas = {};
    this._migrarProgresso = null;
    try {
      window.localStorage.removeItem(CHAVE);
      window.localStorage.removeItem(CHAVE_ANTIGA);
    } catch (e) { /* sem localStorage */ }
    // Zerar é uma mudança de estado como qualquer outra: quem desenha a
    // bandeja precisa saber. Não passa pelo save() porque aqui o objetivo é
    // justamente não deixar nada gravado.
    if (this.onChange) this.onChange(this);
    return this;
  };

  PMV.World.Inventory = Inventory;
})(window.PMV = window.PMV || {});
