(function (PMV) {
  'use strict';

  // Os componentes do acampamento, todos vindos de ILUSTRAÇÃO.
  //
  // Não há geometria neste arquivo — só a declaração de o que cada peça é.
  // O importador (js/engine/svgImport.js) faz o resto: saneia o SVG, confere
  // o contrato, reinscreve cada cor por built.paint() e enxerta os filhos.
  // Do lado de fora, cada um destes é indistinguível de um componente
  // procedural: mesmo create(svgRoot, opts), origem na base, mesmo modelo de
  // luz, mesmo crescimento. Foi essa equivalência que permitiu trocar a arte
  // inteira sem tocar no plano de chão, na composição nem no tema.
  //
  // Isto substituiu os três componentes procedurais (roda de pedras, chama e
  // barraca), que foram apagados na mesma rodada. O que eles ensinaram está
  // no BRIEFING-ILUSTRACAO.md, que é o documento que a arte tem de obedecer -
  // guardar o código morto junto seria manter duas versões da mesma peça
  // competindo, que é a armadilha dos dois documentos de retomada.

  var SvgImport = PMV.Engine.SvgImport;
  var Pecas = PMV.Assets.Acampamento;

  // Cores que EMITEM luz, onde quer que apareçam.
  //
  // A coleção inteira reusa o mesmo hex pro mesmo material (regra 6 do
  // briefing), então a cor identifica o material melhor que o grupo — e aqui
  // isso é decisivo, porque as partes acesas vêm MISTURADAS com partes
  // escuras dentro do mesmo grupo: `lenha-brasa` tem a acha e a brasa,
  // `luz-3` tem o bocal e o bulbo. Separar por grupo exigiria repicar o
  // desenho; separar por cor sai de graça.
  var FOGO = ['#c1552f', '#e09a45', '#f0dda8'];   // três temperaturas da chama
  var VIDRO_ACESO = ['#e8d49b'];                  // lampião
  var BULBOS = ['#f2d08a', '#e0a64b', '#fbefc8']; // luzinhas do cordão

  function peca(kind, markup, extra) {
    var spec = { kind: kind, markup: markup };
    if (extra) Object.keys(extra).forEach(function (k) { spec[k] = extra[k]; });
    return SvgImport.defineComponent(spec);
  }

  var C = PMV.Components;

  // A roda vem num arquivo só e é usada em DOIS pedaços, com a chama
  // desenhada entre eles — é o que faz o fogo nascer DENTRO da roda em vez
  // de colado por cima dela. A cova de terra queimada vai com as pedras de
  // trás: ela é o fundo da cena da fogueira.
  C.RodaDePedras = peca('roda-de-pedras', Pecas.rodaDePedras, {
    variants: { back: ['cova-terra', 'pedras-tras'], front: ['pedras-frente'] }
  });

  C.Chama = peca('chama', Pecas.chama, {
    emissiveColors: FOGO,
    flameGroups: 'chama-lingua'
  });

  C.Tronco = peca('tronco', Pecas.tronco);
  C.Barraca = peca('barraca', Pecas.barraca);
  C.Mochila = peca('mochila', Pecas.mochila);

  C.Lampiao = peca('lampiao', Pecas.lampiao, { emissiveColors: VIDRO_ACESO });

  C.Tripe = peca('tripe', Pecas.tripe);
  C.Lenha = peca('lenha', Pecas.lenha);
  C.Toco = peca('toco', Pecas.toco);
  C.Varal = peca('varal', Pecas.varal);
  C.BarracaMenor = peca('barraca-menor', Pecas.barracaMenor);

  C.Luzinhas = peca('luzinhas', Pecas.luzinhas, { emissiveColors: BULBOS });

  C.Rede = peca('rede', Pecas.rede);
  C.Canoa = peca('canoa', Pecas.canoa);

  // Fogueira grande (peça 15). Continua sem slot como peça inteira: ela traz
  // as próprias chamas, e a chama da peça 2 já cresce a sessão toda no mesmo
  // lugar - as duas juntas dariam dois fogos empilhados.
  C.Fogueira = peca('fogueira', Pecas.fogueira, {
    emissiveColors: FOGO,
    flameGroups: 'chama-lingua'
  });

  // ...mas a LENHA dela é aproveitável, e é a parte que a peça 2 não tem.
  // Entra em dois pedaços que abraçam a chama existente, exatamente como a
  // roda de pedras: as achas de trás atrás do fogo, as da frente na frente.
  // É o mecanismo de variantes do importador servindo pra reaproveitar
  // metade de um desenho sem tocar no arquivo original.
  C.FogueiraLenha = peca('fogueira-lenha', Pecas.fogueira, {
    variants: {
      tras: ['fogueira-lenha-fundo'],
      frente: ['fogueira-lenha-frente']
    }
  });
})(window.PMV = window.PMV || {});
