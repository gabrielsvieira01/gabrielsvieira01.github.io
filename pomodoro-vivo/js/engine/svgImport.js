(function (PMV) {
  'use strict';

  PMV.Engine = PMV.Engine || {};

  // Importador de ilustração vetorial.
  //
  // Recebe o SVG que veio do briefing (BRIEFING-ILUSTRACAO.md) e devolve um
  // componente que obedece ao mesmo contrato dos procedurais: origem na base,
  // geometria pra y negativo, e TODA cor passando pelo modelo de luz.
  //
  // A peça só entra na cena depois de três passos:
  //
  //   1. SANEAR  - remover o que quebra o modelo (gradiente, filtro, máscara,
  //      <use>, <image>, script) e o transform do raiz, que pertence ao
  //      placeAtPivot. O que sobra é geometria chapada.
  //   2. VALIDAR - conferir o checklist de aceite uma vez, na carga, e gritar
  //      no console. Arte que viola o contrato ainda renderiza, mas o aviso
  //      diz exatamente o quê - senão a peça some do modelo de luz em
  //      silêncio e a gente só descobre às 22h, olhando pra um objeto que
  //      brilha sozinho.
  //   3. REINSCREVER - cada fill/stroke vira built.paint(el, attr, hex).
  //      É por isso que a regra da cor chapada não é preciosismo: sem um hex
  //      único por forma não existe o que reinscrever.
  //
  // O <svg> externo é DESCARTADO - só os filhos são enxertados. O viewBox da
  // ilustração não vale nada aqui: quem decide onde a peça encosta e que
  // tamanho tem é o plano de chão.

  var SvgUtils = PMV.Engine.SvgUtils;
  var SvgImport = {};

  // Escala autoral do briefing: 1000 unidades = lado curto da tela. É o que
  // deixa o ilustrador pensar em metros (100 unidades ~ 1 metro) sem saber
  // nada de resolução.
  var DEFAULT_UNITS_PER_REF = 1000;

  // Elementos que tiram a peça do modelo de luz, ou que trazem dependência
  // externa. Removidos com aviso - não dá pra "consertar" um gradiente.
  var BANNED = {
    defs: 1, lineargradient: 1, radialgradient: 1, pattern: 1, filter: 1,
    mask: 1, clippath: 1, use: 1, image: 1, script: 1, style: 1,
    foreignobject: 1, symbol: 1, marker: 1, switch: 1, text: 1, tspan: 1,
    animate: 1, animatetransform: 1, animatemotion: 1, set: 1
  };

  // Formas cujo fill, se não declarado em lugar nenhum, é PRETO por padrão no
  // SVG. Preto que não passou por paint() fica preto às 13h e preto às 22h -
  // é o mesmo bug do rgba() fixo, só que mais discreto. <line> e <polyline>
  // ficam de fora: não têm área pra preencher.
  var DEFAULT_BLACK_FILL = {
    path: 1, rect: 1, circle: 1, ellipse: 1, polygon: 1
  };

  var MAX_DISTINCT_COLORS = 6;

  function lc(el) { return String(el.localName || el.nodeName).toLowerCase(); }

  // Aceita #abc e #aabbcc. Qualquer outra coisa (rgb(), rgba(), hsl(), nome
  // CSS) não é um hex único e não tem como ser reinscrita.
  function toHex(value) {
    if (value === null || value === undefined) return null;
    var s = String(value).trim().toLowerCase();
    if (s.charAt(0) !== '#') return null;
    if (/^#[0-9a-f]{3}$/.test(s)) {
      return '#' + s[1] + s[1] + s[2] + s[2] + s[3] + s[3];
    }
    return /^#[0-9a-f]{6}$/.test(s) ? s : null;
  }

  function isNone(value) {
    var s = String(value).trim().toLowerCase();
    return s === 'none' || s === 'transparent';
  }

  // O style inline compete com o atributo e vence. Em vez de resolver essa
  // precedência em todo lugar, normalizo na entrada: fill/stroke saem do
  // style e viram atributo, que é onde paint() escreve.
  function foldStyleIntoAttributes(el, issues) {
    var style = el.getAttribute('style');
    if (!style) return;
    var rest = [];
    style.split(';').forEach(function (decl) {
      var i = decl.indexOf(':');
      if (i < 0) return;
      var prop = decl.slice(0, i).trim().toLowerCase();
      var val = decl.slice(i + 1).trim();
      if (prop === 'fill' || prop === 'stroke') {
        el.setAttribute(prop, val);
      } else {
        rest.push(prop + ':' + val);
        issues.push('style inline com "' + prop + '" (fora do modelo de luz)');
      }
    });
    if (rest.length) el.setAttribute('style', rest.join(';'));
    else el.removeAttribute('style');
  }

  function stripHazardousAttributes(el) {
    var attrs = Array.prototype.slice.call(el.attributes);
    for (var i = 0; i < attrs.length; i++) {
      var name = attrs[i].name.toLowerCase();
      if (name.indexOf('on') === 0 || name === 'href' || name === 'xlink:href') {
        el.removeAttribute(attrs[i].name);
      }
    }
  }

  // ---- 1. Sanear ----

  function sanitize(root, issues) {
    // Transform no raiz é o slot do placeAtPivot. Se a ilustração trouxer um,
    // ele soma com a colocação e a peça sai do lugar onde deveria encostar.
    if (root.hasAttribute('transform')) {
      issues.push('transform no elemento raiz (removido - esse slot é do código)');
      root.removeAttribute('transform');
    }

    var all = root.querySelectorAll('*');
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      var tag = lc(el);
      if (BANNED[tag]) {
        issues.push('<' + tag + '> removido (quebra o modelo de luz ou traz dependência externa)');
        if (el.parentNode) el.parentNode.removeChild(el);
        continue;
      }
      stripHazardousAttributes(el);
      foldStyleIntoAttributes(el, issues);

      ['fill', 'stroke'].forEach(function (attr) {
        var v = el.getAttribute(attr);
        if (v && String(v).trim().toLowerCase().indexOf('url(') === 0) {
          issues.push(attr + '="url(...)" - referência a defs, sem hex pra reinscrever');
          el.setAttribute(attr, 'none');
        }
      });
    }
    return root;
  }

  // ---- 2. Validar (uma vez por asset, na carga) ----

  // Sobe até o raiz procurando quem declarou o atributo: no SVG fill/stroke
  // herdam, e registrar o paint no <g> que declarou é melhor que registrar em
  // cada filho - repinta um atributo só e os filhos herdam a cor já sombreada.
  function declaredOn(el, attr, root) {
    var node = el;
    while (node) {
      if (node.getAttribute && node.getAttribute(attr) !== null) return node;
      if (node === root) break;
      node = node.parentNode;
    }
    return null;
  }

  function validate(root, issues) {
    var colors = {};
    var all = [root].concat(Array.prototype.slice.call(root.querySelectorAll('*')));

    all.forEach(function (el) {
      var tag = lc(el);
      ['fill', 'stroke'].forEach(function (attr) {
        var raw = el.getAttribute(attr);
        if (raw === null || isNone(raw)) return;
        var hex = toHex(raw);
        if (!hex) {
          issues.push(attr + '="' + raw + '" não é hex sólido - fica fora do modelo de luz');
          return;
        }
        colors[hex] = true;
      });

      if (DEFAULT_BLACK_FILL[tag] && !declaredOn(el, 'fill', root)) {
        issues.push('<' + tag + '> sem fill declarado - assumido #000000');
        colors['#000000'] = true;
      }
      if (el.hasAttribute && el.hasAttribute('opacity')) {
        issues.push('<' + tag + '> usa opacity - o modelo de luz não enxerga transparência');
      }
    });

    var n = Object.keys(colors).length;
    if (n > MAX_DISTINCT_COLORS) {
      issues.push(n + ' cores distintas (o contrato pede no máximo ' + MAX_DISTINCT_COLORS + ')');
    }
    return colors;
  }

  // ---- 3. Reinscrever ----

  // O que EMITE luz não pode escurecer à noite. Duas formas de marcar, e as
  // duas são necessárias por causa de como a arte chega:
  //
  //   por ID     - um grupo inteiro aceso (`vidro` do lampião).
  //   por COR    - a chave que a arte real pediu. O grupo `lenha-brasa` tem
  //     madeira escura E a ponta em brasa no mesmo grupo; `luz-3` tem o
  //     bocal escuro E o bulbo. Não dá pra separar por grupo sem repicar o
  //     desenho. Mas o ilustrador reusou o mesmo hex pro mesmo material em
  //     toda a coleção - então a COR é o marcador exato de "isto é fogo".
  //     É a regra 6 do briefing (paleta curta, mesmo material = mesmo hex)
  //     pagando dividendo em cima de uma coisa que ela nem pretendia.
  function makeEmissiveTest(ids, colors, root) {
    var idSet = {}, colorSet = {};
    (ids || []).forEach(function (id) { idSet[String(id).toLowerCase()] = true; });
    (colors || []).forEach(function (c) { colorSet[String(c).toLowerCase()] = true; });

    return function (el, hex) {
      if (hex && colorSet[hex]) return true;
      var node = el;
      while (node && node.getAttribute) {
        if (node.getAttribute('data-pmv-emissive') !== null) return true;
        var id = node.getAttribute('id');
        if (id && idSet[String(id).toLowerCase()]) return true;
        if (node === root) break;
        node = node.parentNode;
      }
      return false;
    };
  }

  // O nome da parte a que um elemento pertence: o id do grupo mais próximo
  // subindo até a raiz.
  //
  // Isto roda ANTES de demoteIds, então o id ainda está no documento - mas
  // aceitar `data-pmv-part` também deixa a ordem das duas etapas deixar de
  // ser um detalhe do qual isto depende em silêncio.
  function parteDe(el, root) {
    var node = el;
    while (node && node.getAttribute) {
      var nome = node.getAttribute('id') || node.getAttribute('data-pmv-part');
      if (nome) return String(nome).toLowerCase();
      if (node === root) break;
      node = node.parentNode;
    }
    return '';
  }

  function registerPaints(built, root, isEmissive) {
    var all = [root].concat(Array.prototype.slice.call(root.querySelectorAll('*')));

    all.forEach(function (el) {
      var tag = lc(el);
      // A que face da peça esta forma pertence. É o que permite ao modelo de
      // luz saber que a empena de trás de uma barraca está de costas pro
      // fogo - informação que o ilustrador já desenhou e que, até agora, o
      // importador descartava.
      var parte = parteDe(el, root);

      ['fill', 'stroke'].forEach(function (attr) {
        var raw = el.getAttribute(attr);
        if (raw === null || isNone(raw)) return;
        var hex = toHex(raw);
        if (!hex) return;
        (isEmissive(el, hex) ? built.paintEmissive : built.paint)(el, attr, hex, parte);
      });

      // Preto implícito: torná-lo explícito é o que devolve a forma ao modelo.
      if (DEFAULT_BLACK_FILL[tag] && !declaredOn(el, 'fill', root)) {
        built.paint(el, 'fill', '#000000', parte);
      }
    });
  }

  // Dois exemplares da mesma peça em cena duplicariam cada id. Nada aqui
  // referencia id (url(...) é proibido), então o id vira um data-attribute:
  // guarda o nome da parte pra depuração sem sujar o documento.
  function demoteIds(root) {
    var all = [root].concat(Array.prototype.slice.call(root.querySelectorAll('*')));
    all.forEach(function (el) {
      var id = el.getAttribute && el.getAttribute('id');
      if (!id) return;
      el.removeAttribute('id');
      el.setAttribute('data-pmv-part', id);
    });
  }

  // ---- Fachada ----

  // Analisa, saneia e valida o markup UMA vez. O resultado é um template
  // guardado em memória; cada instância em cena é um clone dele.
  SvgImport.parse = function (markup, label) {
    var issues = [];
    var doc = new DOMParser().parseFromString(String(markup), 'image/svg+xml');
    var err = doc.querySelector('parsererror');
    if (err || !doc.documentElement || lc(doc.documentElement) !== 'svg') {
      return { root: null, issues: ['SVG inválido: não foi possível analisar o markup'], colors: {} };
    }
    var root = sanitize(doc.documentElement, issues);
    var colors = validate(root, issues);
    if (issues.length) {
      console.warn('[PMV] ilustração "' + (label || 'sem nome') + '" viola o contrato:\n  - ' +
        issues.join('\n  - '));
    }
    return { root: root, issues: issues, colors: Object.keys(colors) };
  };

  // Enxerta a ilustração num `built`, convertendo as unidades autorais
  // (1000 = lado curto da tela) em pixels da cena.
  //
  // A escala vai no PRÓPRIO built.inner, e não num grupo extra: assim um
  // grupo animado da ilustração fica exatamente à mesma profundidade de
  // aninhamento que num componente procedural. As regras de animação usam
  // `transform-box: view-box` com `transform-origin: 0 0` (ver css/main.css),
  // e camada a mais entre a animação e o inner é justamente o tipo de coisa
  // que faz o alvo pivotar no canto da tela em vez de na própria base.
  //
  // `sources` é ou o <svg> raiz (entram só os FILHOS - o elemento externo e o
  // viewBox dele são descartados) ou uma lista de grupos de variante (entram
  // inteiros: o grupo pode declarar fill que os filhos herdam).
  SvgImport.graft = function (built, sources, opts) {
    opts = opts || {};
    var refUnit = opts.refUnit || 800;
    var units = opts.unitsPerRef || DEFAULT_UNITS_PER_REF;
    var k = refUnit / units;

    built.inner.setAttribute('transform', 'scale(' + k.toFixed(5) + ')');

    var list = [];
    (Array.isArray(sources) ? sources : [sources]).forEach(function (src) {
      if (lc(src) === 'svg') {
        for (var node = src.firstChild; node; node = node.nextSibling) {
          if (node.nodeType === 1) list.push(node);
        }
      } else {
        list.push(src);
      }
    });

    list.forEach(function (node) {
      var copy = document.importNode(node, true);
      var isEmissive = makeEmissiveTest(opts.emissiveIds, opts.emissiveColors, copy);
      registerPaints(built, copy, isEmissive);
      animateFlames(copy, opts.flameGroups, opts.seed);
      demoteIds(copy);
      built.inner.appendChild(copy);
    });

    return built.inner;
  };

  // Dá vida às línguas de chama. A ilustração entrega cada língua num grupo
  // próprio justamente pra isto (regra 7 do briefing); aqui elas ganham a
  // mesma pulsação CSS do fogo procedural.
  //
  // Duração e atraso saem de um rng SEEDADO: sem isso duas fogueiras em cena
  // pulsariam em uníssono, o que denuncia o componente na hora. Atraso
  // NEGATIVO pra que a animação já comece no meio do ciclo.
  function animateFlames(root, prefix, seed) {
    if (!prefix) return;
    var rng = PMV.Engine.CanvasUtils.mulberry32((seed || 1) >>> 0);
    var groups = root.querySelectorAll('[id*="' + prefix + '"]');
    var all = lc(root) === 'g' && (root.getAttribute('id') || '').indexOf(prefix) >= 0
      ? [root].concat(Array.prototype.slice.call(groups))
      : Array.prototype.slice.call(groups);

    all.forEach(function (g) {
      g.classList.add('pmv-flame');
      g.style.setProperty('--pmv-flame-dur', (0.62 + rng() * 0.63).toFixed(2) + 's');
      g.style.setProperty('--pmv-flame-delay', '-' + (rng() * 2).toFixed(2) + 's');
      g.style.setProperty('--pmv-flame-lean', (rng() * 0.10 - 0.05).toFixed(3));
    });
  }

  // Transforma um SVG ilustrado num componente com o mesmo contrato dos
  // procedurais.
  //
  // spec:
  //   markup          - a string do SVG
  //   kind            - meta.kind, pra depuração
  //   emissiveIds     - ids de grupos que EMITEM luz inteiros
  //   emissiveColors  - hexes que emitem onde quer que apareçam (fogo, vidro
  //                     aceso, bulbo) - ver makeEmissiveTest
  //   variants        - { nome: id | [ids] }, pra peça entregue num arquivo
  //                     só mas usada em pedaços: a roda de pedras vira
  //                     `back` (cova + pedras de trás) e `front` (pedras da
  //                     frente), com a chama desenhada ENTRE as duas
  //   flameGroups     - trecho de id das línguas de chama, pra animar
  //   unitsPerRef     - default 1000 (o contrato do briefing)
  SvgImport.defineComponent = function (spec) {
    var template = null;

    function ensureTemplate() {
      if (!template) template = SvgImport.parse(spec.markup, spec.kind || 'asset');
      return template;
    }

    return {
      // Exposto pra teste no console: PMV.Components.Tronco.inspect().issues
      inspect: function () {
        var t = ensureTemplate();
        return { issues: t.issues, colors: t.colors };
      },

      create: function (svgRoot, opts) {
        opts = opts || {};
        var t = ensureTemplate();
        if (!t.root) return null;

        var sources = t.root;
        if (spec.variants && opts.variant) {
          var ids = spec.variants[opts.variant];
          if (!Array.isArray(ids)) ids = ids ? [ids] : [];
          var found = ids.map(function (id) {
            return t.root.querySelector('[id="' + id + '"]');
          }).filter(Boolean);
          if (found.length !== ids.length || !found.length) {
            console.warn('[PMV] variante "' + opts.variant + '" não encontrada em "' +
              (spec.kind || 'asset') + '" - usando a peça inteira');
          } else {
            sources = found;
          }
        }

        var built = PMV.Components.Common.build(svgRoot, opts);
        SvgImport.graft(built, sources, {
          refUnit: opts.refUnit,
          unitsPerRef: spec.unitsPerRef,
          emissiveIds: spec.emissiveIds,
          emissiveColors: spec.emissiveColors,
          flameGroups: spec.flameGroups,
          seed: opts.seed
        });
        built.meta.kind = spec.kind || 'asset';
        built.meta.imported = true;
        return built;
      }
    };
  };

  PMV.Engine.SvgImport = SvgImport;
})(window.PMV = window.PMV || {});
