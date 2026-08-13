(function (PMV) {
  'use strict';

  PMV.Themes = PMV.Themes || {};
  PMV.Themes.Acampamento = PMV.Themes.Acampamento || {};

  var SvgUtils = PMV.Engine.SvgUtils;
  var CanvasUtils = PMV.Engine.CanvasUtils;

  // Onde uma peça pode ser largada. Ver AcampamentoTheme.prototype.limites.
  var LIMITE_XF = [0.04, 0.96];
  var LIMITE_DEPTH = [0.33, 0.72];

  function AcampamentoTheme(opts) {
    this.background = new PMV.Themes.Acampamento.Background();
    // Quem decide o que está em cena. Sem inventário o tema volta ao
    // comportamento antigo (tudo aparece pelo threshold), o que mantém a
    // cena montável em teste sem precisar de localStorage.
    this.inventory = (opts && opts.inventory) || null;
    this.svgRoot = null;
    this.rng = null;
    this.width = 0;
    this.height = 0;
    this.progress = 0;
    this.instances = [];
    this._placedGroups = [];
    this._defs = null;
    this._layer = null;
    // Seed fixa da sessão. Sorteada UMA vez do rng compartilhado, aqui; daí
    // em diante toda reconstrução usa streams locais derivados dela, nunca o
    // rng compartilhado (que o background avança por conta própria).
    this._compositionSeed = 1;
    this._fireEntry = null;   // a instância da chama, pra alimentar a luz local
    this._fireFlicker = 0;
    // Avisado sempre que a camada do acampamento é refeita do zero.
    this.onRebuild = null;
  }

  AcampamentoTheme.prototype.init = function (opts) {
    this.svgRoot = opts.svgRoot;
    this.rng = opts.rng;
    this.width = opts.width;
    this.height = opts.height;

    this._compositionSeed = Math.floor(this.rng() * 2147483647) || 1;

    this._defs = SvgUtils.createEl('defs');
    this.svgRoot.appendChild(this._defs);
    this._layer = SvgUtils.createEl('g', { 'data-pmv-layer': 'acampamento' });
    this.svgRoot.appendChild(this._layer);

    this.background.resize(this.width, this.height, this.rng);
    this._buildComposition();
  };

  AcampamentoTheme.prototype.resize = function (width, height) {
    this.width = width;
    this.height = height;
    this.background.resize(width, height, this.rng);
    this._rebuildLayer();
  };

  // Joga fora a camada do acampamento e monta de novo a partir do estado.
  // É o caminho grosso e sempre correto: usado no resize e sempre que o
  // inventário muda (peça colocada ou devolvida), porque as duas coisas
  // mudam quem existe no DOM e em que ordem. Arrastar NÃO passa por aqui -
  // reconstruir a cada movimento do ponteiro seria absurdo; ver `mover`.
  AcampamentoTheme.prototype._rebuildLayer = function () {
    while (this._layer.firstChild) this._layer.removeChild(this._layer.firstChild);
    this._placedGroups = [];
    this._fireEntry = null;
    this._buildComposition();

    // Progresso já alcançado continua valendo depois de reconstruir.
    this.setProgress(this.progress);

    // A camada foi refeita do zero: tudo o que estava pendurado nos grupos
    // antigos (tabindex, rótulo acessível, seleção) morreu com eles. Quem
    // cuida disso precisa saber.
    if (this.onRebuild) this.onRebuild();
  };

  // Tira a peça da bandeja e põe em cena EM COLOCAÇÃO: ela aparece, aceita
  // arrasto, giro e espelho, e nada disso é definitivo ainda. `pos` ausente
  // = posição autoral, que é o que "posicionar por mim" usa.
  //
  // Uma de cada vez. Duas peças soltas ao mesmo tempo dariam duas barras de
  // controle na tela e a pergunta "confirmar qual?".
  AcampamentoTheme.prototype.colocarPeca = function (slotId, pos) {
    if (!this.inventory) return false;
    var emCurso = this.inventory.provisoria();
    if (emCurso && emCurso !== slotId) return false;
    if (!this.inventory.colocar(slotId, pos || null, true)) return false;
    this._rebuildLayer();
    return true;
  };

  // Congela a peça onde está. A partir daqui ela é parte do lugar.
  AcampamentoTheme.prototype.confirmarPeca = function (slotId) {
    if (!this.inventory || !this.inventory.confirmar(slotId)) return false;
    this._rebuildLayer();
    return true;
  };

  AcampamentoTheme.prototype.pecaEmColocacao = function () {
    return this.inventory ? this.inventory.provisoria() : null;
  };

  // Troca a cara da fogueira: 'tripe' (panela pendurada) ou 'lenha' (achas
  // armadas em tenda). A chama e a roda de pedras não mudam - o que troca é
  // o que está em volta delas.
  AcampamentoTheme.prototype.setEstiloFogueira = function (estilo) {
    if (!this.inventory || !this.inventory.setEstiloFogueira(estilo)) return false;
    this._rebuildLayer();
    return true;
  };

  AcampamentoTheme.prototype.estiloFogueira = function () {
    return this.inventory ? this.inventory.estiloFogueira : 'tripe';
  };

  // Tira de cena e devolve pra bandeja.
  AcampamentoTheme.prototype.devolverPeca = function (slotId) {
    if (!this.inventory || !this.inventory.devolver(slotId)) return false;
    this._rebuildLayer();
    return true;
  };

  // ---- Mover peça já em cena ----
  //
  // Caminho RÁPIDO, chamado a cada movimento do ponteiro: não reconstrói
  // nada, só recalcula o que depende da profundidade e reescreve a transform.
  // O que faz o arrasto parecer certo é isto acontecer ao vivo - a peça
  // encolhe ao ir pro fundo e desce ao vir pra frente sozinha, porque é a
  // mesma conta que o cenário inteiro usa.
  //
  // Deliberadamente NÃO faz duas coisas caras: reordenar a camada e
  // republicar os oclusores. As duas custam DOM e getBBox por peça, e o
  // resultado delas é invisível enquanto o objeto está na mão. Ver
  // `soltarPeca`.
  AcampamentoTheme.prototype.moverPeca = function (slotId, xf, depth, opts) {
    var entry = this.entradaDe(slotId);
    // Peça confirmada não se move. A checagem vive aqui, no caminho único
    // por onde TODO movimento passa - arrasto, seta, giro e espelho -, e não
    // em cada chamador.
    if (!entry || entry.inst.fixo || !entry.inst.provisoria) return null;

    var bg = this.background;
    var inst = entry.inst;
    opts = opts || {};

    inst.xf = CanvasUtils.clamp(xf, LIMITE_XF[0], LIMITE_XF[1]);
    inst.depth = CanvasUtils.clamp(depth, LIMITE_DEPTH[0], LIMITE_DEPTH[1]);
    inst.x = inst.xf * this.width;
    inst.movida = true;
    if (typeof opts.rot === 'number') inst.rotation = opts.rot;
    if (opts.espelhada !== undefined) inst.espelhada = !!opts.espelhada;

    inst.y = bg.groundSurfaceYf(inst.x, inst.depth);
    inst.planeT = bg.planeTFor(inst.depth);

    var finalScale = inst.scale * bg.planeScaleFor(inst.depth);
    SvgUtils.placeAtPivot(entry.group, inst.x, inst.y, finalScale,
                          inst.rotation, inst.grows, inst.espelhada);

    // A névoa da peça sai de built._depth, capturado lá no Common.build. Sem
    // reatribuir aqui, a peça arrastada do fundo pro primeiro plano continua
    // com a névoa do fundo - e o erro é silencioso, porque a peça está no
    // lugar certo, do tamanho certo, só com a cor errada.
    entry.built._depth = inst.planeT;
    if (entry.built.applyLight) {
      entry.built.applyLight(bg.currentPalette(), this._amostradorDeLuz(inst));
    }

    // Se a peça arrastada FOR uma luminária, a poça de luz dela tem que
    // acompanhar o arrasto - senão o lampião anda e a luz fica pra trás.
    // Só a fonte é republicada aqui; repintar as outras quinze peças a cada
    // movimento do ponteiro é caro e o efeito só se nota quando o objeto
    // pousa, então isso fica pro soltarPeca.
    this._updateLamps();
    return inst;
  };

  // Fim do arrasto: agora sim paga o caro. Reordena a camada pela nova
  // profundidade, republica as pegadas pro cenário saber o que desenhar por
  // cima, e grava a escolha.
  AcampamentoTheme.prototype.soltarPeca = function (slotId) {
    var entry = this.entradaDe(slotId);
    if (!entry) return false;
    var inst = entry.inst;

    this._resortLayer();
    this._publishOccluders();
    this._updateLamps();
    // Pousou: agora vale repintar tudo. Uma luminária que mudou de lugar
    // muda a luz de quem está em volta, e essa conta não pode esperar o
    // próximo avanço do relógio pra ser refeita.
    this.relightNow();
    if (this.inventory) {
      // Continua provisória: soltar o dedo grava ONDE está, não que acabou.
      this.inventory.colocar(slotId, {
        xf: inst.xf, depth: inst.depth,
        rot: inst.rotation, espelhada: !!inst.espelhada
      }, true);
    }
    return true;
  };

  // Traz a peça pra frente de tudo enquanto está na mão - coisa segurada
  // não é ocluída por coisa parada.
  AcampamentoTheme.prototype.trazerPraFrente = function (slotId) {
    var entry = this.entradaDe(slotId);
    if (entry) this._layer.appendChild(entry.group);
  };

  // Gira dentro do que o slot permite. `rotRange` é [0, 0] em tudo que é
  // mastro: poste torto lê como quebrado, e a liberdade de girar não vale o
  // preço de um varal caído.
  AcampamentoTheme.prototype.girarPeca = function (slotId, delta) {
    var entry = this.entradaDe(slotId);
    // A checagem de "provisória" precisa estar aqui também, e não só no
    // moverPeca: sem ela isto girava nada, gravava a posição de novo e
    // devolvia o ângulo novo como se tivesse funcionado - o pior tipo de
    // recusa, a que mente pra quem chamou.
    if (!entry || entry.inst.fixo || !entry.inst.provisoria) return null;
    var faixa = entry.inst.rotRange || [-8, 8];
    var novo = CanvasUtils.clamp((entry.inst.rotation || 0) + delta, faixa[0], faixa[1]);
    this.moverPeca(slotId, entry.inst.xf, entry.inst.depth, { rot: novo });
    this.soltarPeca(slotId);
    return novo;
  };

  AcampamentoTheme.prototype.espelharPeca = function (slotId) {
    var entry = this.entradaDe(slotId);
    if (!entry || entry.inst.fixo || !entry.inst.provisoria) return null;
    var novo = !entry.inst.espelhada;
    this.moverPeca(slotId, entry.inst.xf, entry.inst.depth, { espelhada: novo });
    this.soltarPeca(slotId);
    return novo;
  };

  // Quanto esta peça pode girar - a interface usa pra esconder o controle
  // quando não há giro nenhum a dar.
  AcampamentoTheme.prototype.giroPermitido = function (slotId) {
    var entry = this.entradaDe(slotId);
    if (entry) return entry.inst.rotRange || [-8, 8];
    for (var i = 0; i < this.instances.length; i++) {
      if (this.instances[i].slotId === slotId) return this.instances[i].rotRange || [-8, 8];
    }
    return [0, 0];
  };

  // Devolve a função que o componente usa pra perguntar "quanta luz local
  // existe NESTE ponto de mim?".
  //
  // Ela traduz a coordenada de arte do elemento (que o componente conhece)
  // em ponto do mundo (que o cenário conhece) - e é essa tradução que faz a
  // queda vertical da fogueira agir dentro da peça em vez de por cima dela.
  //
  // O espelhamento entra no X porque uma peça virada tem a face esquerda
  // onde antes estava a direita, e é a face virada PRO FOGO que precisa
  // acender. A rotação não entra: ela é de poucos graus e o erro que
  // introduziria é menor que o passo de quantização da repintura.
  AcampamentoTheme.prototype._amostradorDeLuz = function (inst) {
    var bg = this.background;
    var art = (Math.min(this.width, this.height) / 1000) *
              inst.scale * bg.planeScaleFor(inst.depth);
    var flip = inst.espelhada ? -1 : 1;
    var ox = inst.x, oy = inst.y;
    return function (lx, ly) {
      return bg.localLightAt(ox + lx * art * flip, oy + ly * art);
    };
  };

  AcampamentoTheme.prototype.rotuloDe = function (slotId) {
    var C = PMV.Themes.Acampamento.Composition;
    return C && C.rotulo ? C.rotulo(slotId) : slotId;
  };

  AcampamentoTheme.prototype.entradaDe = function (slotId) {
    for (var i = 0; i < this._placedGroups.length; i++) {
      if (this._placedGroups[i].inst.slotId === slotId) return this._placedGroups[i];
    }
    return null;
  };

  // Reempilha a camada inteira por profundidade. Com 15 peças, reanexar
  // todas é mais barato de entender que procurar o vizinho certo, e
  // appendChild de um nó que já está no documento é uma MUDANÇA de posição,
  // não uma cópia.
  AcampamentoTheme.prototype._resortLayer = function () {
    var self = this;
    this._placedGroups.slice()
      .sort(function (a, b) { return a.inst.depth - b.inst.depth; })
      .forEach(function (entry) { self._layer.appendChild(entry.group); });
  };

  // Onde a peça PODE ficar. Não é limite técnico, é direção de arte: acima
  // da faixa a peça entra na linha de mata e vira enfeite de árvore; abaixo,
  // some sob a moita de primeiro plano. Nas bordas em x, sai de quadro.
  AcampamentoTheme.prototype.limites = function () {
    return { xf: LIMITE_XF, depth: LIMITE_DEPTH };
  };

  // Miniatura da peça, pra bandeja.
  //
  // Instancia o PRÓPRIO componente num SVG solto, sem paleta - `Common.shade`
  // devolve a cor base quando não há paleta, então a miniatura sai nas cores
  // cruas da arte. Desenhar um ícone à parte seria mais barato e estaria
  // errado no dia seguinte: a miniatura tem que ser a peça, senão ela mente
  // sobre o que o usuário está pegando.
  AcampamentoTheme.prototype.miniatura = function (slotId, tamanho) {
    var inst = null;
    for (var i = 0; i < this.instances.length; i++) {
      if (this.instances[i].slotId === slotId) { inst = this.instances[i]; break; }
    }
    if (!inst) return null;
    var Component = PMV.Components[inst.component];
    if (!Component || typeof Component.create !== 'function') return null;

    var svg = SvgUtils.createEl('svg', {
      width: tamanho, height: tamanho, 'aria-hidden': 'true', focusable: 'false'
    });
    // getBBox só responde em elemento renderizado - fora da tela, mas não
    // display:none.
    svg.style.position = 'absolute';
    svg.style.left = '-9999px';
    document.body.appendChild(svg);

    var built = Component.create(svg, {
      seed: inst.seed, refUnit: 1000, scale: 1, depth: 1,
      variant: inst.variant || null, palette: null, fire: null
    });
    var box = built && built.inner ? built.inner.getBBox() : null;
    document.body.removeChild(svg);
    svg.style.position = '';
    svg.style.left = '';
    if (!box || !box.width || !box.height) return null;

    var folga = Math.max(box.width, box.height) * 0.06;
    var lado = Math.max(box.width, box.height) + folga * 2;
    // Quadrado centrado na peça: sem isso, um varal de 420 unidades e um
    // toco de 48 sairiam do mesmo tamanho na bandeja, e o porte relativo -
    // que é metade da informação - se perderia.
    svg.setAttribute('viewBox',
      (box.x + box.width / 2 - lado / 2).toFixed(2) + ' ' +
      (box.y + box.height / 2 - lado / 2).toFixed(2) + ' ' +
      lado.toFixed(2) + ' ' + lado.toFixed(2));
    return svg;
  };

  // Posição autoral de um slot, pra quem precisa saber onde a peça CAIRIA
  // (prévia da bandeja, "posicionar por mim", tecla de atalho).
  AcampamentoTheme.prototype.posicaoPadrao = function (slotId) {
    for (var i = 0; i < this.instances.length; i++) {
      var inst = this.instances[i];
      if (inst.slotId !== slotId) continue;
      var p = inst.padrao;
      return { xf: p.xf, depth: p.depth, rot: p.rot, espelhada: false };
    }
    return null;
  };

  AcampamentoTheme.prototype._buildComposition = function () {
    var Composition = PMV.Themes.Acampamento.Composition;
    var bg = this.background;
    var self = this;

    this.instances = Composition.expandPlan(this._compositionSeed, this.width);

    // O inventário fala ANTES da geometria, porque ele pode trocar o xf e o
    // depth da peça - e é deles que saem o Y, a escala e a névoa. Aplicar
    // depois deixaria a peça no lugar novo com os números do lugar velho.
    this._applyInventory();
    this._resolveAnchors();
    this._resolveGround();

    // Reordenar DEPOIS do inventário, e não só dentro do expandPlan.
    // A ordem de desenho é a ordem dos filhos da camada, e o inventário
    // acabou de poder trocar a profundidade de qualquer peça - a ordenação
    // feita no expandPlan já nasceu velha. Sem isto, uma barraca arrastada
    // pro primeiro plano continua sendo desenhada atrás do tronco que ficou
    // lá atrás, e o tamanho dela (que o plano já corrigiu) contradiz o
    // empilhamento.
    this.instances.sort(function (a, b) { return a.depth - b.depth; });

    this.instances.forEach(function (inst) {
      if (inst.emCena) self._placeInstance(inst);
    });
    this._publishOccluders();
    this._updateLamps();
    this._updateFireSource();
  };

  // Publica as fontes de luz SECUNDÁRIAS (lampião, cordão de luzinhas).
  //
  // Manda todas as peças colocadas e deixa o cenário filtrar: quem é
  // luminária e com que alcance está descrito em LAMP_DEFS, junto das outras
  // constantes de luz, e não espalhado entre tema e composição.
  //
  // `escalaArte` é o fator que converte as unidades de arte da peça em
  // pixels de tela. Vai junto porque a altura da fonte (o vidro do lampião
  // está a 123 unidades do chão) tem que encolher quando a peça vai pro
  // fundo - senão a luz de um lampião distante nasceria alta demais.
  AcampamentoTheme.prototype._updateLamps = function () {
    var unit = Math.min(this.width, this.height) / 1000;
    var bg = this.background;
    var lamps = this._placedGroups.map(function (entry) {
      var inst = entry.inst;
      return {
        slotId: inst.slotId,
        x: inst.x,
        y: inst.y,
        escalaArte: unit * inst.scale * bg.planeScaleFor(inst.depth),
        intensity: CanvasUtils.clamp(entry.growth, 0, 1)
      };
    });
    bg.setLamps(lamps);
  };

  // Quem entra em cena, e onde.
  //
  // Sem inventário, tudo entra (comportamento antigo). Com inventário, entra
  // a fogueira - que é fixa e não pertence a ninguém - mais o que o usuário
  // já tiver colocado. Peça ganha e ainda na bandeja não existe no DOM: não
  // adianta criar invisível, porque o oclusor e a ordem de desenho contariam
  // com ela.
  AcampamentoTheme.prototype._applyInventory = function () {
    var inv = this.inventory;
    var estilo = inv ? inv.estiloFogueira : 'tripe';

    // Slot que pertence a uma "cara da fogueira" só entra se for a escolhida.
    // Os dois conjuntos ocupam o mesmo palmo de chão em volta da chama.
    function estiloOk(inst) {
      return !inst.estiloFogueira || inst.estiloFogueira === estilo;
    }

    if (!inv) {
      this.instances.forEach(function (inst) { inst.emCena = estiloOk(inst); });
      return;
    }

    inv.sync(this.instances, this.progress);

    this.instances.forEach(function (inst) {
      if (inst.fixo) { inst.emCena = estiloOk(inst); return; }
      inst.emCena = inv.estado(inst.slotId) === 'colocada';
      if (!inst.emCena) return;

      // Provisória: ainda está sendo colocada, então é a única peça que
      // aceita ponteiro, seta e giro. Confirmada, congela pra sempre.
      inst.provisoria = !inv.ehDefinitiva(inst.slotId);

      var pos = inv.colocacao(inst.slotId);
      if (!pos) return;   // colocada, mas onde o catálogo manda
      inst.xf = pos.xf;
      inst.x = pos.xf * this.width;
      inst.depth = pos.depth;
      inst.rotation = pos.rot;
      inst.espelhada = pos.espelhada;
      // Peça que o usuário moveu não obedece mais à âncora: ele mandou pôr
      // ali. Sem isto a mochila voltaria pra barraca no próximo resize.
      inst.movida = true;
    }, this);
  };

  // Resolve o Y de cada objeto ANTES de instanciar: cada um encosta no plano
  // de chão de verdade, e não numa linha reta derivada do depth. É o que
  // impede objeto flutuando ou afundado.
  //
  // `planeT` é a profundidade já projetada no plano (0 = horizonte, 1 =
  // rente à câmera). É ela que alimenta a névoa do objeto - e é a MESMA
  // grandeza de onde sai a escala, que é o que amarra tamanho e posição.
  AcampamentoTheme.prototype._resolveGround = function () {
    var bg = this.background;
    this.instances.forEach(function (inst) {
      inst.y = bg.groundSurfaceYf(inst.x, inst.depth);
      inst.planeT = bg.planeTFor(inst.depth);
    });
  };

  // Objeto encostado em objeto.
  //
  // "A mochila está encostada na barraca" não é uma coordenada, é uma
  // RELAÇÃO - e escrita como coordenada ela quebra na primeira vez que a
  // barraca se mexe ou que a tela muda de proporção. O slot ancorado declara
  // o deslocamento em UNIDADES DE ARTE (as mesmas 1000 = lado curto do
  // briefing) a partir do slot âncora, e aqui esse deslocamento é convertido
  // pra pixels pela escala com que a ÂNCORA aparece em tela. Assim a mochila
  // continua encostada na barraca em qualquer resolução.
  //
  // Um nível de ancoragem só: âncora nunca é ancorada. Duas passagens
  // bastam, e cadeia de âncoras seria corda pra se enforcar.
  AcampamentoTheme.prototype._resolveAnchors = function () {
    var byId = {};
    this.instances.forEach(function (inst) { byId[inst.slotId] = inst; });
    var refUnit = Math.min(this.width, this.height);
    var bg = this.background;

    this.instances.forEach(function (inst) {
      var a = inst.anchor;
      // Âncora é o PADRÃO, não uma corrente: assim que o usuário arrasta a
      // peça, a relação autoral cede pra escolha dele.
      if (!a || inst.movida) return;
      var host = byId[a.to];
      if (!host) return;
      var unit = (refUnit / 1000) * bg.planeScaleFor(host.depth);
      inst.x = host.x + (a.dxUnit || 0) * unit;
      inst.xf = inst.x / (this.width || 1);
    }, this);
  };

  // Diz ao cenário onde o acampamento ocupa espaço, pra que ele saiba o que
  // desenhar POR CIMA das peças.
  //
  // A camada SVG do acampamento fica inteira acima do canvas de fundo, então
  // uma árvore rente à câmera era desenhada ATRÁS de uma barraca que está
  // muito mais longe - a peça flutuava na frente da mata. Com a pegada e a
  // profundidade de cada objeto, o cenário reparte o espalhado em dois: o
  // que está atrás continua no canvas de fundo, o que está na frente vai pro
  // canvas de primeiro plano, que é desenhado POR CIMA do SVG.
  AcampamentoTheme.prototype._publishOccluders = function () {
    // getBBox devolve a caixa em UNIDADES DE ARTE - ela ignora a transform do
    // próprio elemento medido. Pra chegar em pixels faltam os dois fatores
    // que vêm depois: a conversão de unidade autoral (built.inner) e a escala
    // de colocação (built.group, via placeAtPivot).
    var unit = Math.min(this.width, this.height) / 1000;
    var list = this._placedGroups.map(function (entry) {
      var box;
      try { box = entry.built.inner.getBBox(); } catch (e) { box = null; }
      if (!box || !box.width) return { x: entry.inst.x, halfWidth: 0, t: entry.inst.planeT };
      var px = unit * entry.inst.scale * this.background.planeScaleFor(entry.inst.depth);
      return {
        x: entry.inst.x + (box.x + box.width / 2) * px,
        halfWidth: (box.width * px) / 2,
        t: entry.inst.planeT
      };
    }, this);
    this.background.setOccluders(list);
  };

  AcampamentoTheme.prototype._placeInstance = function (inst) {
    var Component = PMV.Components[inst.component];
    if (!Component || typeof Component.create !== 'function') {
      // Slot reservado - a arte ainda não existe, nada é desenhado.
      return;
    }
    // Perspectiva: a escala vem do PLANO, não de uma fórmula própria. Antes
    // era `0.58 + depth * 0.52` aqui, calculado à parte do Y - duas contas
    // independentes decidindo tamanho e posição, sem nada obrigando as duas a
    // concordarem. Agora as duas saem do mesmo `t`, e é isso que faz o chão
    // ler como chão. `inst.scale` volta a ser o que o nome diz: um
    // multiplicador autoral por slot.
    var finalScale = inst.scale * this.background.planeScaleFor(inst.depth);
    var fire = this.background.localLightAt(inst.x, inst.y);

    var built = Component.create(this._layer, {
      seed: inst.seed,
      scale: finalScale,
      refUnit: Math.min(this.width, this.height),
      sceneHeight: this.height,
      depth: inst.planeT,
      variant: inst.variant || null,
      palette: this.background.currentPalette(),
      fire: fire
    });
    if (!built || !built.group) return;
    built._fire = fire;
    // `inst.espelhada` NÃO pode faltar aqui. Ela vem do inventário e é
    // reescrita a cada reconstrução da camada - que acontece no resize e
    // toda vez que uma peça é colocada ou devolvida. Sem ela o espelho
    // "voltava sozinho depois de um tempo": o dado estava certo no
    // localStorage, só não chegava na transform.
    SvgUtils.placeAtPivot(built.group, inst.x, inst.y, finalScale,
                          inst.rotation, inst.grows, inst.espelhada);

    built.group.setAttribute('data-pmv-slot', inst.slotId);
    // Só a peça que ainda está sendo colocada é móvel. Peça confirmada faz
    // parte do lugar: não recebe ponteiro, não entra na ordem de tabulação,
    // não tem alça de agarre. É a regra do jogo virada em DOM - nada aqui
    // depende de um modo global ligado ou desligado.
    if (!inst.fixo && inst.provisoria) {
      built.group.setAttribute('data-pmv-movel', '1');
      addGrabArea(built);
    }

    // A peça nasce com a luz medida no pé dela (é o que Component.create
    // consegue saber). Agora que ela está no documento, os elementos têm
    // caixa e dá pra medir a luz PONTO A PONTO - o que muda bastante numa
    // peça alta perto do fogo.
    if (built.applyLight) {
      built.applyLight(this.background.currentPalette(), this._amostradorDeLuz(inst));
    }

    var entry = { inst: inst, group: built.group, built: built, growth: 0 };
    this._placedGroups.push(entry);
    if (inst.slotId === 'fogueira-chama') this._fireEntry = entry;
  };

  // Área de agarre invisível, do tamanho da peça.
  //
  // Sem ela, arrastar depende de acertar tinta: o poste do lampião tem 3
  // unidades de largura e a corda da rede é um traço. `fill="none"` com
  // `pointer-events="all"` é hitável sem ser desenhável - e como não tem cor,
  // o importador nunca a registra no modelo de luz. Vai como PRIMEIRO filho,
  // atrás da arte, e não muda o getBBox (ela é exatamente o bbox).
  function addGrabArea(built) {
    var box;
    try { box = built.inner.getBBox(); } catch (e) { return; }
    if (!box || !box.width || !box.height) return;
    var area = SvgUtils.createEl('rect', {
      x: box.x, y: box.y, width: box.width, height: box.height,
      fill: 'none', 'pointer-events': 'all', 'data-pmv-agarre': '1'
    });
    built.inner.insertBefore(area, built.inner.firstChild);
  }

  AcampamentoTheme.prototype.setProgress = function (progress) {
    this.progress = Math.max(this.progress, progress);
    var p = this.progress;

    var comInventario = !!this.inventory;

    this._placedGroups.forEach(function (entry) {
      var inst = entry.inst;
      if (comInventario && !inst.fixo) {
        // Peça COLOCADA está pronta, ponto. O limiar já fez o trabalho dele
        // quando entregou a peça na bandeja; ligar a presença dela ao
        // progresso de novo seria cobrar duas vezes pelo mesmo ciclo. Quem
        // faz a chegada ser suave é a transição CSS de opacidade.
        entry.growth = 1;
        SvgUtils.setGrowth(entry.group, 1);
        return;
      }
      // Crescimento CONTÍNUO: growSpan é quanto de progresso o objeto leva
      // pra ir de nada a pronto. Hoje isto governa só a fogueira - e é a
      // CHAMA que importa, porque ela cresce a sessão inteira e é o
      // mostrador de quanto já foi feito.
      var span = inst.growSpan || 0.20;
      var t = CanvasUtils.clamp((p - inst.threshold) / span, 0, 1);
      entry.growth = Math.pow(t, 0.65);
      SvgUtils.setGrowth(entry.group, entry.growth);
    });

    // O progresso pode ter destravado peças novas. Elas vão pra bandeja - a
    // cena não muda até o usuário posicionar (ou pedir "posicionar por mim").
    if (comInventario) this.inventory.sync(this.instances, p);

    // A intensidade das luminárias acompanha o crescimento delas.
    this._updateLamps();
    this._updateFireSource();
  };

  // Alimenta a fonte de luz local do background com a fogueira de verdade
  // que está em cena: posição real e intensidade proporcional ao quanto a
  // chama já cresceu. Sem isto a luz seria um número escrito à mão, e
  // deixaria de bater com o fogo assim que a composição mudasse.
  AcampamentoTheme.prototype._updateFireSource = function () {
    var entry = this._fireEntry;
    if (!entry) {
      this.background.setFire(0, 0, 0);
      return;
    }
    var intensity = CanvasUtils.clamp(entry.growth, 0, 1) * this._fireFlicker;
    this.background.setFire(entry.inst.x, entry.inst.y, intensity);
  };

  AcampamentoTheme.prototype.update = function (dt) {
    this.background.update(dt);
    this._updateFlicker();
    this._relightIfNeeded();
  };

  // A luz de uma fogueira não é constante. Duas senoides incomensuráveis
  // (razão irracional entre as frequências) nunca repetem o mesmo padrão,
  // então o olho não pega o laço - e é bem mais barato que ruído.
  AcampamentoTheme.prototype._updateFlicker = function () {
    this._flickerT = (this._flickerT || 0) + 0.033;
    var t = this._flickerT;
    var f = 0.90 + Math.sin(t * 2.7) * 0.06 + Math.sin(t * 4.31 + 1.3) * 0.045;
    this._fireFlicker = CanvasUtils.clamp(f, 0.78, 1.0);
    this._updateFireSource();
  };

  // Os objetos são criados uma vez e ficam horas em tela, então precisam
  // acompanhar a luz - senão uma barraca criada às 17h continua clara às
  // 23h. Repintar é barato (uns poucos setAttribute) mas não faz sentido
  // por quadro: só quando a luz andou o bastante pra ser perceptível.
  //
  // O carimbo inclui a fogueira, porque agora ela também é luz: sem isso a
  // barraca não acenderia quando o fogo crescesse. E inclui a CONTAGEM de
  // luminárias, senão acender o primeiro lampião não repintaria nada em
  // volta dele até o relógio andar. Quantizado grosso de propósito - a
  // cintilação NÃO deve disparar repintura a cada quadro.
  AcampamentoTheme.prototype._relightIfNeeded = function () {
    var palette = this.background.currentPalette();
    var fire = this.background.fire;
    var stamp = Math.round(palette.ambient * 80) + '|' + palette.fogColor +
      '|' + Math.round(fire.intensity * 8) +
      '|' + this.background.lampCount();
    if (stamp === this._lightStamp) return;
    this._lightStamp = stamp;

    var self = this;
    this._placedGroups.forEach(function (entry) {
      if (!entry.built || !entry.built.applyLight) return;
      entry.built.applyLight(palette, self._amostradorDeLuz(entry.inst));
    });
  };

  // Prévia de horário: repinta na hora, sem esperar o próximo tick.
  AcampamentoTheme.prototype.relightNow = function () {
    this._lightStamp = null;
    this._relightIfNeeded();
  };

  // Quantas coisas do acampamento estão MONTADAS em cena - usado pela
  // narração acessível. Com bandeja isto deixou de ser "quantas cruzaram o
  // limiar": uma peça ganha e não posicionada não está em cena, e dizer que
  // está mentiria justamente para quem não pode conferir olhando.
  AcampamentoTheme.prototype.grownCount = function () {
    var self = this;
    return this._placedGroups.filter(function (entry) {
      return !entry.inst.fixo && entry.inst.threshold <= self.progress;
    }).length;
  };

  // Quantas peças estão esperando na bandeja.
  AcampamentoTheme.prototype.pendingCount = function () {
    return this.inventory ? this.inventory.bandeja().length : 0;
  };

  AcampamentoTheme.prototype.drawCanvas = function (ctx, camera, width, height) {
    this.background.draw(ctx, camera, width, height);
  };

  AcampamentoTheme.prototype.drawForeground = function (ctx, camera) {
    this.background.drawForeground(ctx, camera);
  };

  AcampamentoTheme.prototype.currentPalette = function () {
    return this.background.currentPalette();
  };

  // Prévia de horário do dia (vitrine/testes) - null volta ao relógio real.
  AcampamentoTheme.prototype.setTimeOverrideHour = function (hour) {
    this.background.setTimeOverrideHour(hour);
    this.relightNow();
  };

  PMV.Themes.Acampamento.ThemeModule = AcampamentoTheme;
})(window.PMV = window.PMV || {});
