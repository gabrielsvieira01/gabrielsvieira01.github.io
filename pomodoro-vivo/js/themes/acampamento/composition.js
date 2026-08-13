(function (PMV) {
  'use strict';

  PMV.Themes = PMV.Themes || {};
  PMV.Themes.Acampamento = PMV.Themes.Acampamento || {};

  var CanvasUtils = PMV.Engine.CanvasUtils;

  // Plano autoral de slots. Cada entrada diz ONDE uma coisa do acampamento
  // fica, QUANDO ela aparece e com que porte. O PRNG seedado só varia dentro
  // do que o slot manda - o sorteio nunca substitui direção de arte.
  //
  // Enquadramento: a FOGUEIRA é o coração da cena e fica no downstage,
  // ligeiramente à esquerda do centro; a barraca fica upstage à direita,
  // numa camada de profundidade atrás. O olho pousa no fogo e depois anda
  // até a barraca. Distribuir tudo em fileira equidistante não tem ponto
  // focal - foi o erro do recife.
  //
  // `depth` (0 = horizonte, 1 = rente à câmera) é a única coordenada de
  // profundidade: o plano de chão deriva DELA tanto o Y onde o objeto
  // encosta quanto a escala com que ele aparece. Não existem mais faixas
  // discretas - mover um slot 0.05 pra frente o desce na tela E o aumenta,
  // junto, como aconteceria num chão de verdade.
  //
  // Referência: depth 0.62 é onde a escala do plano vale 1.0 (o tamanho
  // natural do componente). A fogueira mora exatamente ali.
  //
  // Slots cujo `component` ainda não existe em PMV.Components ficam
  // RESERVADOS: o tema não desenha nada e nada quebra. Estão aqui porque a
  // ordem de aparecimento é decisão de arte já tomada (ver a tabela de
  // progressão), e é mais barato manter o plano inteiro à vista do que
  // reconstituí-lo a cada rodada.
  // Depois que as peças passaram a ser GANHAS e posicionadas pelo usuário,
  // esta tabela deixou de ser a lei da cena e virou o CATÁLOGO. Ela responde
  // três coisas, e nenhuma delas é mais "onde a peça está":
  //
  //   threshold  - em que ponto do progresso a peça é ganha (a ordem em que
  //                o acampamento é destravado)
  //   xf/depth/rotation - a posição PADRÃO, usada por "posicionar por mim" e
  //                por quem nunca tocar na peça. Direção de arte continua
  //                sendo o default, só deixou de ser obrigatória.
  //   component/scale/variant - o vínculo com a arte
  //
  // Dois campos governam o que o usuário pode fazer com a peça:
  //
  //   fixo     - a peça não vai pra bandeja e não se arrasta. São os quatro
  //              slots da fogueira: ela é a fonte de luz, o ponto focal e a
  //              referência de profundidade 0.62 onde a escala vale 1.0.
  //              Deixar o usuário enfiá-la num canto tira o centro da cena.
  //   rotRange - quanto o usuário pode girar. Padrão [-8, 8]; ZERO em tudo
  //              que é mastro (varal, cordão, lampião, rede), porque poste
  //              torto lê como quebrado - a mesma razão de a rotação autoral
  //              deles já ser [0, 0].
  var ROT_RANGE_PADRAO = [-8, 8];
  var SEM_GIRO = [0, 0];

  // `scale` é o multiplicador AUTORAL do slot, e depois da rodada de
  // ilustração ele passou a ter um trabalho concreto: corrigir a escala em
  // que cada peça foi desenhada.
  //
  // O contrato pedia 1000 unidades = lado curto da tela, mas a coleção veio
  // com as peças grandes em metade ou um quarto do tamanho pedido (o varal e
  // o cordão a 107 unidades de largura em vez de 420) e a barraca 40% maior.
  // Cada peça carrega aqui o fator que a devolve ao tamanho da tabela do
  // briefing — que é a escala em que elas foram pensadas UMAS EM RELAÇÃO ÀS
  // OUTRAS, e é a relação entre elas que faz o acampamento ter porte de
  // acampamento. Medido com getBBox, não no olho.
  var CAMP_PLAN = [
    // ---- A fogueira ----
    // Três slots no MESMO x, com profundidades a um passo MÍNIMO de
    // distância: pedras de trás, chama, pedras da frente. É o que faz a
    // chama nascer DENTRO da roda em vez de colada por cima dela.
    //
    // O passo é de 0.002 só, e não 0.01, porque agora a profundidade também
    // move o objeto na vertical: com um passo maior as pedras da frente
    // desceriam vários pixels em relação às de trás e a roda deixaria de
    // fechar. spreadf 0 e rotation [0,0]: nada aqui pode escorregar, senão a
    // chama sai do fogão.
    {
      id: 'fogueira-pedras-tras',
      component: 'RodaDePedras', variant: 'back',
      fixo: true,
      xf: 0.44, spreadf: 0,
      count: 1, depth: [0.618, 0.618],
      scale: [1.03, 1.03], rotation: [0, 0],
      // Threshold NEGATIVO de propósito: a roda de pedras já está pronta em
      // 0% de progresso. O crescimento é `(p - threshold) / growSpan`, então
      // threshold 0 dá tamanho ZERO em p=0 - e a cova de fogo aparecia
      // brotando do chão no primeiro ciclo. A roda não é coisa que o foco
      // constrói: ela é a marca de que este lugar é um lugar de acampar, e
      // pertence à paisagem tanto quanto a serra.
      threshold: [-0.05, -0.05], growSpan: [0.05, 0.05]
    },
    {
      id: 'fogueira-chama',
      component: 'Chama',
      fixo: true,
      xf: 0.44, spreadf: 0,
      count: 1, depth: [0.620, 0.620],
      scale: [0.80, 0.80], rotation: [0, 0],
      // A ÚNICA peça que cresce de verdade. Ver .pmv-appear/.pmv-growable.
      grows: true,
      // A chama nasce pequena em 0.05 e leva o resto do progresso pra
      // chegar ao tamanho cheio: é o único objeto da cena que cresce do
      // começo ao fim, e é ele que marca o quanto já foi feito.
      threshold: [0.05, 0.05], growSpan: [0.95, 0.95]
    },
    {
      id: 'fogueira-pedras-frente',
      component: 'RodaDePedras', variant: 'front',
      fixo: true,
      xf: 0.44, spreadf: 0,
      count: 1, depth: [0.622, 0.622],
      scale: [1.03, 1.03], rotation: [0, 0],
      // Threshold NEGATIVO de propósito: a roda de pedras já está pronta em
      // 0% de progresso. O crescimento é `(p - threshold) / growSpan`, então
      // threshold 0 dá tamanho ZERO em p=0 - e a cova de fogo aparecia
      // brotando do chão no primeiro ciclo. A roda não é coisa que o foco
      // constrói: ela é a marca de que este lugar é um lugar de acampar, e
      // pertence à paisagem tanto quanto a serra.
      threshold: [-0.05, -0.05], growSpan: [0.05, 0.05]
    },

    // A outra cara possível da fogueira: achas armadas em tenda, tiradas da
    // peça 15 pelos grupos de lenha. Dois slots que abraçam a chama, com o
    // mesmo passo mínimo de profundidade da roda de pedras - é isso que faz
    // o fogo subir ENTRE as achas em vez de na frente ou atrás delas.
    {
      id: 'fogueira-lenha-tras',
      component: 'FogueiraLenha', variant: 'tras',
      fixo: true, estiloFogueira: 'lenha',
      xf: 0.44, spreadf: 0,
      count: 1, depth: [0.6175, 0.6175],
      // 1.10 e não 1.0: na peça 15 a lenha foi desenhada a ~78% da altura
      // das chamas DAQUELE desenho. Nossa chama vem da peça 2 e é mais alta,
      // então a lenha precisa crescer junto pra manter a proporção que o
      // ilustrador escolheu - senão vira graveto embaixo de uma fogueira.
      scale: [1.10, 1.10], rotation: [0, 0],
      threshold: [0.39, 0.39], growSpan: [0.04, 0.04]
    },
    {
      id: 'fogueira-lenha-frente',
      component: 'FogueiraLenha', variant: 'frente',
      fixo: true, estiloFogueira: 'lenha',
      xf: 0.44, spreadf: 0,
      count: 1, depth: [0.6235, 0.6235],
      // 1.10 e não 1.0: na peça 15 a lenha foi desenhada a ~78% da altura
      // das chamas DAQUELE desenho. Nossa chama vem da peça 2 e é mais alta,
      // então a lenha precisa crescer junto pra manter a proporção que o
      // ilustrador escolheu - senão vira graveto embaixo de uma fogueira.
      scale: [1.10, 1.10], rotation: [0, 0],
      threshold: [0.39, 0.39], growSpan: [0.04, 0.04]
    },

    // ---- Em volta do fogo ----
    //
    // Um acampamento não é um mostruário: cada coisa está onde está porque
    // alguém a pôs ali por um motivo. O que manda a posição é a FUNÇÃO -
    // banco à distância de sentar do fogo, tripé em cima dele, lenha atrás
    // do banco, poste de luz na porta da barraca. Espalhar por xf bonito dá
    // vitrine de loja.
    //
    // O tripé é o caso mais literal: ele não fica PERTO da fogueira, ele É
    // parte dela. Mesmo x, e um passo de profundidade ATRÁS das pedras, o
    // que põe a panela pendurada sobre a chama e a chama na frente das
    // pernas de trás - que é como um tripé de cozinha se parece de verdade.
    {
      id: 'tripe-cozinha',
      component: 'Tripe',
      // Fixo junto com o resto da fogueira: ele não fica PERTO dela, ele é
      // parte dela. Solto, viraria um tripé de cozinha no meio do nada.
      fixo: true,
      // Alternativa ao par `fogueira-lenha-*`: a fogueira tem uma cara OU
      // outra, nunca as duas. Quem escolhe é o usuário (ver `estiloFogueira`
      // no inventário); o tema esconde o grupo que não foi escolhido.
      estiloFogueira: 'tripe',
      xf: 0.443, spreadf: 0,
      count: 1, depth: [0.6165, 0.6165],
      scale: [1.01, 1.01], rotation: [-0.8, 0.8],
      threshold: [0.39, 0.39], growSpan: [0.04, 0.04]
    },

    // O banco: à distância de sentar do fogo, à esquerda.
    {
      id: 'tronco-banco',
      component: 'Tronco',
      xf: 0.30, spreadf: 0.01,
      count: 1, depth: [0.598, 0.598],
      scale: [1.03, 1.03], rotation: [-1.5, 1.5],
      // growSpan CURTO. Objeto construído APARECE, não incha: com span longo
      // dá pra ver a peça enchendo como balão, e coisa de madeira e lona não
      // faz isso. Quem faz a chegada ficar suave é a transição CSS de
      // 1600ms, não o progresso. A chama é a exceção proposital: ela cresce
      // a sessão toda, porque É o mostrador de quanto já foi feito.
      threshold: [0.11, 0.11], growSpan: [0.04, 0.04]
    },

    // ---- A barraca ----
    // Fica ATRÁS da fogueira no plano (depth menor), então o próprio plano
    // já a coloca mais alta na tela e menor - sem nenhum ajuste manual. Era
    // isso que as três faixas faziam à mão.
    {
      id: 'barraca-principal',
      component: 'Barraca',
      // Perto o bastante da fogueira pra cair dentro do alcance da luz dela:
      // à noite é o fogo que tem de acender a barraca, e não o piso de
      // luminância.
      xf: 0.70, spreadf: 0.012,
      count: 1, depth: [0.44, 0.44],
      scale: [0.72, 0.72],
      // Barraca torta parece quebrada, de um jeito que forma orgânica torta
      // não parece. Linha reta denuncia erro de ângulo na hora.
      rotation: [-1, 1],
      threshold: [0.18, 0.18], growSpan: [0.04, 0.04]
    },

    // A mochila está ENCOSTADA na barraca: ancorada no canto esquerdo dela
    // (a lona vai até -127 unidades de arte depois da escala do slot), um
    // passo à frente pra não sumir atrás. Sem a âncora isto seria um xf
    // escrito à mão que descola da barraca na primeira mudança de tela.
    {
      id: 'mochila',
      component: 'Mochila',
      anchor: { to: 'barraca-principal', dxUnit: -105 },
      xf: 0.60, spreadf: 0,
      count: 1, depth: [0.468, 0.468],
      scale: [0.81, 0.81], rotation: [-3, -1],
      threshold: [0.25, 0.25], growSpan: [0.04, 0.04]
    },

    // ---- Lampião ----
    // Segunda fonte de luz da cena: o grupo `vidro` é emissivo, então ele
    // não escurece à noite junto com o resto. Fica ancorado à ESQUERDA da
    // barraca, no caminho entre ela e o fogo - que é onde um poste de luz
    // serve pra alguma coisa. À direita ele caía a vinte pixels do poste do
    // cordão de luzinhas, e dois mastros lado a lado leem como erro de
    // desenho. Poste torto lê como quebrado: rotação zero.
    {
      id: 'lampiao',
      component: 'Lampiao',
      anchor: { to: 'barraca-principal', dxUnit: -215 },
      xf: 0.61, spreadf: 0,
      count: 1, depth: [0.478, 0.478],
      scale: [1.01, 1.01], rotation: [0, 0], rotRange: SEM_GIRO,
      threshold: [0.32, 0.32], growSpan: [0.04, 0.04]
    },

    // Lenha empilhada ATRÁS do banco: quem corta lenha põe a pilha fora da
    // roda de quem senta, não no meio dela.
    {
      id: 'pilha-lenha',
      component: 'Lenha',
      anchor: { to: 'tronco-banco', dxUnit: -150 },
      xf: 0.19, spreadf: 0,
      count: 1, depth: [0.558, 0.558],
      scale: [1.19, 1.19], rotation: [-1.5, 1.5],
      threshold: [0.46, 0.46], growSpan: [0.04, 0.04]
    },
    // O toco é o segundo assento, do outro lado do fogo: dois lugares em
    // volta da fogueira fecham a roda.
    {
      id: 'toco-cadeira',
      component: 'Toco',
      xf: 0.578, spreadf: 0.01,
      count: 1, depth: [0.645, 0.645],
      scale: [0.87, 0.87], rotation: [-2, 2],
      threshold: [0.54, 0.54], growSpan: [0.04, 0.04]
    },

    // ---- Enfeite ----
    // Varal e cordão são a MESMA estrutura (dois postes e uma catenária), e
    // é por isso que ficam separados: um em cima da clareira entre o fogo e
    // a barraca, o outro amarrado na barraca menor, mais à frente e menor.
    // Lado a lado, um denunciaria o outro.
    {
      id: 'varal-bandeirinhas',
      component: 'Varal',
      xf: 0.505, spreadf: 0.01,
      count: 1, depth: [0.40, 0.40],
      scale: [3.93, 3.93], rotation: [0, 0], rotRange: SEM_GIRO,
      threshold: [0.62, 0.62], growSpan: [0.04, 0.04]
    },
    {
      id: 'barraca-menor',
      component: 'BarracaMenor',
      xf: 0.885, spreadf: 0.012,
      count: 1, depth: [0.375, 0.375],
      scale: [1.44, 1.44], rotation: [-1, 1],
      threshold: [0.70, 0.70], growSpan: [0.04, 0.04]
    },
    // Os bulbos são emissivos: à noite o cordão acende sozinho, como o
    // vidro do lampião. Esticado da barraca menor em direção ao fogo.
    {
      id: 'cordao-luzinhas',
      component: 'Luzinhas',
      anchor: { to: 'barraca-menor', dxUnit: -160 },
      xf: 0.75, spreadf: 0,
      count: 1, depth: [0.495, 0.495],
      scale: [3.20, 3.20], rotation: [0, 0], rotRange: SEM_GIRO,
      threshold: [0.78, 0.78], growSpan: [0.04, 0.04]
    },
    // A rede fecha o canto direito, mas bem à FRENTE do resto: na mesma
    // profundidade das duas barracas ela disputava o mesmo palmo de tela com
    // o cordão e a barraca menor, e três coisas empilhadas no mesmo lugar
    // leem como bagunça. À frente, ela vira moldura - e a diferença de
    // profundidade faz o canto ter camadas em vez de amontoado.
    {
      id: 'rede',
      component: 'Rede',
      xf: 0.90, spreadf: 0.01,
      count: 1, depth: [0.62, 0.62],
      scale: [2.0, 2.0], rotation: [0, 0], rotRange: SEM_GIRO,
      threshold: [0.86, 0.86], growSpan: [0.04, 0.04]
    },
    // A canoa fica na margem do LAGO, virada e encostada - é o único objeto
    // da cena que pode estar torto sem parecer quebrado. Canoa longe de
    // água é adereço; canoa na margem conta uma história.
    {
      id: 'canoa',
      component: 'Canoa',
      xf: 0.165, spreadf: 0.012,
      count: 1, depth: [0.455, 0.455],
      scale: [1.95, 1.95], rotation: [-3, -1],
      threshold: [0.94, 0.94], growSpan: [0.04, 0.04]
    }

    // A peça 15 (fogueira grande) existe como componente mas NÃO tem slot:
    // ela é a mesma fogueira da peça 2 em tamanho maior, e a chama já cresce
    // a sessão inteira até o tamanho cheio. As duas em cena dariam dois
    // fogos no mesmo lugar. Ver o comentário em js/components/importados.js.
  ];

  // Expande cada slot autoral em instâncias concretas via PRNG seedado.
  //
  // Recebe uma SEED (não um rng compartilhado) e abre um stream local por
  // slot. Ler o rng da cena aqui era o que fazia cada resize, mesmo do mesmo
  // tamanho, reembaralhar a cena inteira: o background já tinha avançado
  // aquele rng por conta própria. Com seed fixa por slot, mesma seed +
  // mesma largura = sempre exatamente o mesmo acampamento.
  function expandPlan(seed, width) {
    var instances = [];
    CAMP_PLAN.forEach(function (slot, slotIndex) {
      // Stream próprio por slot: mexer num slot não desloca os outros.
      var rng = CanvasUtils.mulberry32((seed + slotIndex * 7919) >>> 0);
      var rot = slot.rotation || [-2, 2];
      var span = slot.growSpan || [0.14, 0.30];
      for (var i = 0; i < slot.count; i++) {
        var jitterF = slot.spreadf ? (rng() - 0.5) * 2 * slot.spreadf : 0;
        var xf = CanvasUtils.clamp(slot.xf + jitterF, 0, 1);
        var depth = CanvasUtils.randRange(rng, slot.depth[0], slot.depth[1]);
        var rotacao = CanvasUtils.randRange(rng, rot[0], rot[1]);
        instances.push({
          slotId: slot.id,
          component: slot.component,
          x: xf * width,
          xf: xf,
          depth: depth,
          scale: CanvasUtils.randRange(rng, slot.scale[0], slot.scale[1]),
          rotation: rotacao,
          // Cópia intocada da posição autoral. `xf`/`depth`/`rotation` são
          // sobrescritos quando o usuário arrasta a peça; esta fica, porque
          // é dela que saem "posicionar por mim" e a prévia da bandeja.
          padrao: { xf: xf, depth: depth, rot: rotacao },
          variant: slot.variant || null,
          // Relação com outro slot ("encostada na barraca"), resolvida pelo
          // tema, que é quem conhece refUnit e a escala do plano.
          anchor: slot.anchor || null,
          // Fixo: a fogueira. Não vai pra bandeja e não se arrasta.
          fixo: !!slot.fixo,
          // Qual "cara da fogueira" este slot pertence (tripé ou lenha), ou
          // null pra quem não participa dessa escolha.
          estiloFogueira: slot.estiloFogueira || null,
          // Quanto o usuário pode girar esta peça.
          rotRange: slot.rotRange || ROT_RANGE_PADRAO,
          // Só a chama cresce; o resto aparece pronto (ver .pmv-appear).
          grows: !!slot.grows,
          threshold: CanvasUtils.randRange(rng, slot.threshold[0], slot.threshold[1]),
          growSpan: CanvasUtils.randRange(rng, span[0], span[1]),
          // Seed do indivíduo: o componente desenha sempre a MESMA barraca a
          // cada reconstrução de geometria.
          seed: Math.floor(rng() * 2147483647) || 1
        });
      }
    });
    // Do fundo pro primeiro plano, pra desenhar de trás pra frente.
    instances.sort(function (a, b) { return a.depth - b.depth; });
    return instances;
  }

  // Nome de cada peça em português, pra bandeja e pra narração acessível.
  // Fica aqui, junto do catálogo, porque é a mesma decisão: o que a coisa É.
  var ROTULOS = {
    'fogueira-pedras-tras': 'Roda de pedras',
    'fogueira-chama': 'Fogueira',
    'fogueira-pedras-frente': 'Roda de pedras',
    'tripe-cozinha': 'Tripé de cozinha',
    'tronco-banco': 'Tronco caído',
    'barraca-principal': 'Barraca',
    'mochila': 'Mochila',
    'lampiao': 'Lampião',
    'pilha-lenha': 'Pilha de lenha',
    'toco-cadeira': 'Toco',
    'varal-bandeirinhas': 'Varal de bandeirinhas',
    'barraca-menor': 'Barraca menor',
    'cordao-luzinhas': 'Cordão de luzinhas',
    'rede': 'Rede',
    'canoa': 'Canoa'
  };

  PMV.Themes.Acampamento.Composition = {
    CAMP_PLAN: CAMP_PLAN,
    ROTULOS: ROTULOS,
    rotulo: function (slotId) { return ROTULOS[slotId] || slotId; },
    expandPlan: expandPlan
  };
})(window.PMV = window.PMV || {});
