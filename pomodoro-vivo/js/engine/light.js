(function (PMV) {
  'use strict';

  PMV.Engine = PMV.Engine || {};

  // O modelo de luz da cena, em UM lugar só.
  //
  // Antes existiam dois: `shadeTerrain`, no cenário, e `Common.shade`, nos
  // objetos. Nasceram iguais e foram divergindo em três pontos - piso de
  // luminância, força da deriva noturna e força da névoa -, e os três
  // empurravam para o mesmo lado: o objeto ficava mais claro e mais colorido
  // que o chão em que ele se apoia. Às 22h a barraca parecia ter luz própria
  // no meio de uma clareira escura.
  //
  // O problema não era o valor de nenhuma das constantes. Era haver duas
  // cópias: qualquer ajuste numa delas abria uma fresta na outra, e a fresta
  // só aparecia olhando a cena montada, meses depois. Com uma função só, o
  // objeto e o chão não têm COMO se comportar diferente.
  //
  // A ordem dos termos importa e é esta:
  //
  //   1. ambiente - multiplica a cor base pela luminância do horário. É o
  //      que faz tudo escurecer junto quando o sol se põe.
  //   2. deriva noturna (Purkinje) - no escuro o olho perde sensibilidade a
  //      cor, então quanto menor o ambiente, mais a cor puxa pro tom da
  //      névoa. Sem isto a terra continua sendo a coisa mais quente do
  //      quadro às 22h.
  //   3. névoa por profundidade - perspectiva aérea. Desbota o distante;
  //      não o faz desaparecer.
  //   4. luz local - fogueira e luminárias. ADITIVA, e por último: somar luz
  //      clareia mantendo o matiz, enquanto misturar em direção ao laranja
  //      lavaria a cor da lona.
  //
  // A luz DIRETA (a luz-chave do horário) não entra aqui: ela é direcional e
  // é aplicada nas cristas por strokeLitRim - senão a face de costas pra luz
  // acenderia igual à que está virada pra ela.

  var CanvasUtils = PMV.Engine.CanvasUtils;

  var FOG_STRENGTH = 0.50;   // névoa da hora MAIS enevoada; a paleta escala
  var FOG_MAX = 0.88;
  var TINT_STRENGTH = 0.42;  // quanto a cor puxa pro tom da névoa no escuro

  var Light = {};

  Light.FOG_STRENGTH = FOG_STRENGTH;

  // Recebe `t` do plano (0 = horizonte, 1 = rente à câmera) e a paleta do
  // horário.
  //
  // A paleta entra aqui porque a névoa tem DUAS metades, e elas não mudam
  // na mesma hora: a COR (no que o distante se transforma) e a DENSIDADE
  // (o quanto ele se transforma). Só a cor consultava o horário; a
  // densidade era esta constante sozinha. Então meio-dia recebia a mesma
  // dose de perspectiva aérea que um fim de tarde, e o quadro das 13h não
  // lia como distância - lia como vidro sujo: céu azul limpo em cima, e da
  // serra pra baixo um véu cinza que não saía de lugar nenhum.
  //
  // De novo o problema não era o valor da constante. Era esta função não
  // receber a hora - o mesmo formato do bug das duas cópias, ao contrário:
  // uma cópia só, mas cega pra uma variável de que ela depende.
  //
  // Sem paleta a densidade é 1, que é o comportamento antigo.
  Light.fogForDepth = function (t, palette) {
    var densidade = palette && typeof palette.fogDensity === 'number' ? palette.fogDensity : 1;
    return CanvasUtils.clamp((1 - t) * FOG_STRENGTH * densidade, 0, FOG_MAX);
  };

  // hex     - cor base da superfície
  // palette - paleta do horário
  // depth   - `t` do plano
  // local   - { amount, color } da luz local, ou nada
  // peso    - quanto desta superfície a luz local alcança (o cenário usa
  //           pesos diferentes por parte: a base de uma árvore recebe mais
  //           que a copa, porque o fogo está no chão)
  // Força da luz local dentro da ILUMINAÇÃO (ver a nota grande em shade).
  //
  // Calibrado por varredura contra o modelo aditivo antigo: 3.2 devolve o
  // mesmo BRILHO que a soma dava, mas com o matiz preservado. Abaixo disso a
  // cena escurece (multiplicar um albedo escuro levanta menos que somar);
  // acima, a saturação começa a estourar nas peças mais próximas do fogo.
  var LOCAL_FORCA = 3.2;

  // Quanto a luz local desfaz a deriva noturna.
  //
  // A deriva de Purkinje existe porque no escuro o olho perde sensibilidade a
  // cor. Mas uma superfície banhada pelo fogo NÃO está no escuro - ali a
  // visão volta a ser fotópica e a cor volta a existir. Aplicar a deriva em
  // cheio dentro da poça de luz era descrever o olho errado.
  var PURKINJE_RECUO = 1.9;

  function canal(v) { return CanvasUtils.clamp(Math.round(v), 0, 255); }
  function hexDe(r, g, b) {
    function h(n) { var s = canal(n).toString(16); return s.length === 1 ? '0' + s : s; }
    return '#' + h(r) + h(g) + h(b);
  }

  // A luz local entra na ILUMINAÇÃO, não como retoque depois dela.
  //
  // Era um termo aditivo aplicado no fim, sobre a cor já pronta, e isso tinha
  // duas consequências que só apareceram medindo:
  //
  //   1. Somar o mesmo (255,152,56)·a em toda superfície faz cores diferentes
  //      CONVERGIREM. Verde escuro e marrom viravam quase o mesmo alaranjado.
  //   2. Pior: quando a soma chegava, o ambiente já tinha esmagado a cor.
  //      Às 22h o ambiente vale 0.16, então uma folha #3f6b34 já era
  //      #161d27 - azul-acinzentado, sem verde nenhum - ANTES de o fogo
  //      tocar nela. Não havia mais cor pra iluminar; só sobrava o laranja.
  //
  // O modelo certo é o físico: a superfície tem uma cor própria (albedo) e a
  // ILUMINAÇÃO a revela. Iluminação total = ambiente (neutro) + luz local
  // (colorida), por canal, e a cor final é o albedo multiplicado por ela.
  // Assim o fogo aquece a folha em vez de substituí-la: o vermelho da chama
  // multiplica pouco o canal verde da folha, e a folha continua verde.
  //
  // Isto NÃO muda nada onde não há luz local: com ganho zero os três canais
  // valem `palette.ambient`, que é exatamente o que scaleHexColor fazia. O dia
  // inteiro é bit a bit o que era.
  Light.shade = function (hex, palette, depth, local, peso) {
    if (!palette) return hex;

    var ganho = (local && local.amount > 0.002)
      ? local.amount * (peso === undefined ? 1 : peso) : 0;

    var c = CanvasUtils.hexToRgb(hex);
    var ir = palette.ambient, ig = palette.ambient, ib = palette.ambient;
    if (ganho > 0) {
      var l = CanvasUtils.hexToRgb(local.color);
      // A cor da luz normalizada diz em que canais ela é forte. O fogo é
      // forte no vermelho e fraco no azul: aquece sem tingir.
      ir += ganho * (l.r / 255) * LOCAL_FORCA;
      ig += ganho * (l.g / 255) * LOCAL_FORCA;
      ib += ganho * (l.b / 255) * LOCAL_FORCA;
    }
    var lit = hexDe(c.r * ir, c.g * ig, c.b * ib);

    // Deriva noturna, recuada onde o fogo alcança - ver PURKINJE_RECUO.
    var deriva = (1 - palette.ambient) * TINT_STRENGTH *
                 (1 - CanvasUtils.clamp(ganho * PURKINJE_RECUO, 0, 0.85));
    lit = CanvasUtils.lerpHexColor(lit, palette.fogColor, deriva);

    return CanvasUtils.lerpHexColor(
      lit,
      palette.fogColor,
      Light.fogForDepth(depth === undefined ? 0.9 : depth, palette)
    );
  };

  PMV.Engine.Light = Light;
})(window.PMV = window.PMV || {});
