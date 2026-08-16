(function (PMV) {
  'use strict';

  PMV.Engine = PMV.Engine || {};

  // Importador de ilustração para o CANVAS.
  //
  // É o irmão do svgImport.js. Os dois recebem a mesma arte, com o mesmo
  // contrato, e a diferença é só o destino:
  //
  //   svgImport  - peças do acampamento, que viram nós SVG de verdade porque
  //                precisam animar, crescer e ser arrastadas uma a uma;
  //   svgPaths   - cenário, que é desenhado em canvas porque são centenas de
  //                cópias por quadro e cada nó SVG a mais custa layout.
  //
  // O truque que torna isso barato é o Path2D: o `d` de cada forma vira um
  // caminho compilado UMA VEZ, na carga, e depois cada árvore em cena é um
  // `ctx.fill(caminho)` com uma transform. Sai mais barato que o desenho
  // procedural que havia antes, que remontava a silhueta ponto a ponto a
  // cada quadro.
  //
  // A cor NÃO é assada: cada forma guarda o hex base e quem desenha passa
  // pelo modelo de luz na hora. É isso que mantém a árvore ilustrada
  // escurecendo junto com o resto da cena.

  var SvgPaths = {};

  // Peso da luz LOCAL (fogueira, luminárias) por grupo da ilustração.
  //
  // O nome do grupo diz a que altura a massa está, e a fogueira decai rápido
  // na vertical porque está no chão: o tronco leva quase toda a luz, a copa
  // leva um terço. É o mesmo modelo que o desenho procedural usava com
  // números soltos - agora ele é lido do nome da parte.
  // Estes pesos foram calibrados quando o brilho da fogueira era PINTADO por
  // cima do espalhado, além de cada peça receber o termo local no próprio
  // sombreamento. Eram duas doses, e os pesos compensavam isso sendo baixos.
  //
  // Com a pilha de faixas, o brilho passou pra baixo do espalhado e a segunda
  // dose sumiu - o que estava certo, era contagem dupla. Só que ninguém
  // recalibrou a que sobrou, e o cenário parou de reagir ao fogo: arbusto,
  // pedra e mato ficavam do mesmo tom a dois passos da fogueira e a vinte.
  // Os valores abaixo devolvem ao termo único o que os dois somavam.
  var PESO_LOCAL = {
    tronco: 1.0,
    'copa-sombra': 0.55,
    'copa-luz': 0.62,
    'copa-sombra-frente': 0.6,
    'pedra-sombra': 1.0,
    'pedra-luz': 0.85
  };

  // Grupos que representam a face virada PRA LUZ. Só eles recebem o termo
  // da luz-chave direcional - é o que faz a mata inteira concordar com a
  // direção do sol em vez de cada árvore ter um volume próprio inventado.
  var FACE_ILUMINADA = { 'copa-luz': 1, 'pedra-luz': 1, 'sol-luz': 1, 'lua-luz': 1 };

  function grupoDe(el, raiz) {
    var node = el;
    while (node && node !== raiz) {
      if (node.getAttribute) {
        var id = node.getAttribute('id');
        if (id) return id;
      }
      node = node.parentNode;
    }
    return '';
  }

  function fillDe(el, raiz) {
    var node = el;
    while (node && node.getAttribute) {
      var f = node.getAttribute('fill');
      if (f && f !== 'none') return f.toLowerCase();
      if (node === raiz) break;
      node = node.parentNode;
    }
    return null;
  }

  // Devolve { formas: [...], caixa: {x,y,largura,altura} } ou null.
  //
  // Precisa de um <svg> montado no documento porque usa getBBox pra descobrir
  // onde cada forma está DENTRO da peça - e é dessa posição que sai a
  // amostra de luz local depois. Fora do documento o getBBox devolve zero.
  SvgPaths.parse = function (markup, rotulo) {
    var doc = new DOMParser().parseFromString(String(markup), 'image/svg+xml');
    if (doc.querySelector('parsererror') || !doc.documentElement) {
      console.warn('[PMV] ilustração de cenário "' + rotulo + '": SVG inválido');
      return null;
    }
    var raiz = document.importNode(doc.documentElement, true);
    raiz.style.position = 'absolute';
    raiz.style.left = '-9999px';
    document.body.appendChild(raiz);

    var formas = [];
    var problemas = [];
    var nos = raiz.querySelectorAll('path, polygon');

    for (var i = 0; i < nos.length; i++) {
      var el = nos[i];
      var d = el.getAttribute('d');
      if (!d) {
        // <polygon> é convertível, mas a coleção veio toda em <path>; se
        // aparecer outra coisa é melhor saber do que renderizar errado.
        problemas.push('<' + el.localName + '> sem `d` - ignorado');
        continue;
      }
      var hex = fillDe(el, raiz);
      if (!hex || hex.charAt(0) !== '#') {
        problemas.push('forma sem fill sólido - ignorada');
        continue;
      }
      var b = null;
      try { b = el.getBBox(); } catch (e) { b = null; }
      var grupo = grupoDe(el, raiz);
      formas.push({
        caminho: new Path2D(d),
        base: hex,
        grupo: grupo,
        peso: PESO_LOCAL[grupo] === undefined ? 0.8 : PESO_LOCAL[grupo],
        iluminada: !!FACE_ILUMINADA[grupo],
        cx: b ? b.x + b.width / 2 : 0,
        cy: b ? b.y + b.height / 2 : 0
      });
    }

    var caixa = null;
    try {
      var bb = raiz.getBBox();
      caixa = { x: bb.x, y: bb.y, largura: bb.width, altura: bb.height };
    } catch (e) { caixa = { x: 0, y: 0, largura: 1, altura: 1 }; }

    document.body.removeChild(raiz);

    if (problemas.length) {
      console.warn('[PMV] ilustração de cenário "' + rotulo + '":\n  - ' + problemas.join('\n  - '));
    }
    if (!formas.length) return null;
    return { formas: formas, caixa: caixa };
  };

  // Compila um conjunto inteiro { nome: markup } de uma vez.
  SvgPaths.parseSet = function (mapa) {
    var out = {};
    Object.keys(mapa).forEach(function (nome) {
      var p = SvgPaths.parse(mapa[nome], nome);
      if (p) out[nome] = p;
    });
    return out;
  };

  PMV.Engine.SvgPaths = SvgPaths;
})(window.PMV = window.PMV || {});
