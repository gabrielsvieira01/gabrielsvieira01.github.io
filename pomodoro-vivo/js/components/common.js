(function (PMV) {
  'use strict';

  // Base compartilhada dos componentes de organismo.
  //
  // Contrato com o mundo (ver svgUtils.placeAtPivot):
  //   create(svgRoot, opts) -> { group, inner, meta, applyLight(palette) }
  //   - a origem local (0,0) é o ponto de fixação na areia
  //   - a geometria cresce pra y NEGATIVO (pra cima)
  //   - o grupo EXTERNO não recebe transform nenhuma do componente: ele
  //     pertence ao placeAtPivot, que o posiciona/escala/rotaciona no mundo.
  //     Toda animação própria (sway, bob) vai no grupo INTERNO - senão o
  //     animateTransform disputa a transform de posicionamento e o
  //     organismo salta pro canto da cena.

  var SvgUtils = PMV.Engine.SvgUtils;
  var CanvasUtils = PMV.Engine.CanvasUtils;

  var Common = {};

  // O horário governa TUDO em quadro, e o objeto do acampamento reage à luz
  // EXATAMENTE como o terreno em que ele se apoia.
  //
  // Havia aqui uma segunda versão do modelo de luz, com um piso de
  // luminância (0.13) e uma defesa contra a névoa, escritas pra impedir que
  // o acampamento sumisse numa massa preta à noite. Elas resolviam isso e
  // criavam coisa pior: às 22h a barraca ficava 68% mais clara e mais
  // saturada que o chão embaixo dela, e o objeto lia como se tivesse luz
  // própria - exatamente o oposto de "compor a cena".
  //
  // Quem devolve luz ao acampamento à noite é a FOGUEIRA, e ela já entra
  // como termo próprio, aditivo (soma luz e mantém o matiz, em vez de
  // misturar em direção ao laranja e lavar a cor da lona). Isso basta: o que
  // o fogo alcança acende, e o que ele não alcança fica escuro como o resto
  // do lugar - que é o critério do tema desde o começo.
  //
  // fire: { amount, color } - a luz local naquele ponto do mundo.
  //
  // O peso 0.9 da luz local espelha o que o chão em volta recebe - a base de
  // uma árvore leva 0.9, uma pedra 0.95. Uma lona que acendesse MAIS que a
  // grama em que ela se apoia é justamente o efeito de "objeto com luz
  // própria" que essa unificação veio matar.
  Common.shade = function (hex, palette, depth, fire) {
    return PMV.Engine.Light.shade(hex, palette, depth, fire, 0.9);
  };

  // A chama é EMISSORA, não iluminada: ela não pode escurecer com o
  // ambiente, senão o fogo apaga à noite - exatamente ao contrário do que
  // acontece. Só desatura um pouco em pleno dia, quando o céu compete com
  // ele.
  Common.shadeEmissive = function (hex, palette) {
    if (!palette) return hex;
    return CanvasUtils.scaleHexColor(hex, 0.88 + (1 - palette.ambient) * 0.12);
  };

  // Centro do elemento nas UNIDADES DE ARTE da peça, calculado uma vez e
  // guardado no próprio registro de pintura.
  //
  // Uma vez, e não a cada repintura, porque isto roda por elemento pintado -
  // são ~216 na cena cheia - e getBBox força o navegador a resolver layout.
  // A geometria da peça não muda depois de construída; o que muda é onde ela
  // está, e disso quem cuida é a transform do grupo.
  function centroDe(p) {
    if (p.cx !== undefined) return p;
    var b = null;
    try { b = p.el.getBBox(); } catch (e) { b = null; }
    if (b && (b.width || b.height)) {
      p.cx = b.x + b.width / 2;
      p.cy = b.y + b.height / 2;
    } else {
      p.cx = 0; p.cy = 0;
    }
    return p;
  }

  // Cria o esqueleto padrão de um componente e devolve o objeto "built".
  // paints guarda (elemento, atributo, cor base) pra que applyLight possa
  // repintar quando o horário andar - o organismo é criado uma vez e vive
  // horas em tela.
  Common.build = function (svgRoot, opts) {
    var group = SvgUtils.createEl('g');
    var inner = SvgUtils.createEl('g');
    group.appendChild(inner);
    svgRoot.appendChild(group);

    var built = {
      group: group,
      inner: inner,
      meta: {},
      _paints: [],
      _depth: opts.depth,
      // Estado da luz local no lugar onde este objeto está. Quem sabe a
      // distância até a fogueira é o tema, não o componente - então ele
      // manda o valor pronto em applyLight.
      _fire: { amount: 0, color: '#ff9838' }
    };

    built.paint = function (el, attr, baseHex) {
      built._paints.push({ el: el, attr: attr, base: baseHex, emissive: false });
      el.setAttribute(attr, Common.shade(baseHex, opts.palette, built._depth, built._fire));
      return el;
    };

    // Para o que EMITE luz (chama, brasa, vidro do lampião aceso).
    built.paintEmissive = function (el, attr, baseHex) {
      built._paints.push({ el: el, attr: attr, base: baseHex, emissive: true });
      el.setAttribute(attr, Common.shadeEmissive(baseHex, opts.palette));
      return el;
    };

    // luz: ou { amount, color }, valendo pro objeto inteiro, ou uma FUNÇÃO
    // (lx, ly) -> { amount, color } que responde por PONTO.
    //
    // A função é o caminho certo, e a diferença é grande. Com um valor só, a
    // luz era medida no pé da peça - onde o fogo está - e aplicada igual da
    // base ao topo. Uma barraca de três metros recebia no ápice a luz que
    // existe rente ao chão, e como o termo é ADITIVO, somar a mesma
    // quantidade em todas as faces comprime a diferença entre elas: a peça
    // perde volume e vira uma massa quente chapada, clara demais e sem
    // desenho interno. Era isso que fazia o objeto parecer deslocado da cena
    // enquanto o cenário em volta mantinha a estrutura.
    //
    // Por ponto, a queda vertical da fogueira (que é rápida, porque o fogo
    // está no chão) volta a agir DENTRO da peça: a barra de baixo acende, a
    // cumeeira quase não, e o volume reaparece.
    built.applyLight = function (palette, luz) {
      var amostra = typeof luz === 'function' ? luz : null;
      if (luz && !amostra) built._fire = luz;

      for (var i = 0; i < built._paints.length; i++) {
        var p = built._paints[i];
        if (p.emissive) {
          p.el.setAttribute(p.attr, Common.shadeEmissive(p.base, palette));
          continue;
        }
        var local = amostra ? amostra(centroDe(p).cx, p.cy) : built._fire;
        p.el.setAttribute(p.attr, Common.shade(p.base, palette, built._depth, local));
      }
    };

    return built;
  };

  // Escolhe um item de uma lista pelo rng seedado.
  Common.pick = function (rng, list) {
    return list[Math.floor(rng() * list.length) % list.length];
  };

  // Caminho suave por uma lista de pontos (curva quadrática por pontos
  // médios) - mesma técnica do tracePointsSmooth do canvas, em string SVG.
  // Usado nos contornos orgânicos: nada no recife tem aresta reta.
  Common.smoothPath = function (pts, close) {
    if (pts.length < 3) return '';
    var d = 'M ' + pts[0].x.toFixed(2) + ' ' + pts[0].y.toFixed(2);
    for (var i = 1; i < pts.length - 1; i++) {
      var mx = (pts[i].x + pts[i + 1].x) / 2;
      var my = (pts[i].y + pts[i + 1].y) / 2;
      d += ' Q ' + pts[i].x.toFixed(2) + ' ' + pts[i].y.toFixed(2) + ' ' + mx.toFixed(2) + ' ' + my.toFixed(2);
    }
    var last = pts[pts.length - 1];
    d += ' L ' + last.x.toFixed(2) + ' ' + last.y.toFixed(2);
    return d + (close ? ' Z' : '');
  };

  // Ramo afilado: uma "fita" que nasce larga na base e afina em direção à
  // ponta. tipFrac é a fração da largura que SOBRA na ponta - com 0 ela
  // fecha em bico. Bico é o que fazia os ramos lerem como triângulos, e a
  // solução anterior (colar um círculo na ponta) era o que fazia lerem como
  // "triângulo com bolinha". Com tipFrac > 0 e stroke redondo da mesma cor
  // (ver roundOff), a ponta fica roliça num único elemento.
  Common.taperedRibbon = function (axis, baseWidth, tipFrac) {
    var tip = tipFrac === undefined ? 0 : tipFrac;
    var left = [], right = [];
    for (var i = 0; i < axis.length; i++) {
      var t = i / (axis.length - 1);
      var taper = (1 - t) * (1 - t * 0.35);
      var w = baseWidth * (tip + (1 - tip) * taper);
      // normal 2D do segmento local
      var prev = axis[Math.max(0, i - 1)];
      var next = axis[Math.min(axis.length - 1, i + 1)];
      var dx = next.x - prev.x, dy = next.y - prev.y;
      var len = Math.sqrt(dx * dx + dy * dy) || 1;
      var nx = -dy / len, ny = dx / len;
      left.push({ x: axis[i].x + nx * w, y: axis[i].y + ny * w });
      right.push({ x: axis[i].x - nx * w, y: axis[i].y - ny * w });
    }
    right.reverse();
    return Common.smoothPath(left.concat(right), true);
  };

  // Arredonda os cantos de um path preenchido traçando o contorno com a
  // MESMA cor, junta e ponta redondas. Uma linha de código que transforma
  // silhueta angulosa em silhueta orgânica - e sem elemento extra.
  Common.roundOff = function (el, width) {
    el.setAttribute('stroke-width', width.toFixed(2));
    el.setAttribute('stroke-linejoin', 'round');
    el.setAttribute('stroke-linecap', 'round');
    return el;
  };

  PMV.Components = PMV.Components || {};
  PMV.Components.Common = Common;
})(window.PMV = window.PMV || {});
