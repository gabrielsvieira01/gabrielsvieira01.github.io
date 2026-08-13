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

  var FOG_STRENGTH = 0.50;   // quanto a profundidade desbota
  var FOG_MAX = 0.88;
  var TINT_STRENGTH = 0.42;  // quanto a cor puxa pro tom da névoa no escuro

  var Light = {};

  Light.FOG_STRENGTH = FOG_STRENGTH;

  // Recebe `t` do plano (0 = horizonte, 1 = rente à câmera).
  Light.fogForDepth = function (t) {
    return CanvasUtils.clamp((1 - t) * FOG_STRENGTH, 0, FOG_MAX);
  };

  // hex     - cor base da superfície
  // palette - paleta do horário
  // depth   - `t` do plano
  // local   - { amount, color } da luz local, ou nada
  // peso    - quanto desta superfície a luz local alcança (o cenário usa
  //           pesos diferentes por parte: a base de uma árvore recebe mais
  //           que a copa, porque o fogo está no chão)
  Light.shade = function (hex, palette, depth, local, peso) {
    if (!palette) return hex;

    var lit = CanvasUtils.lerpHexColor(
      CanvasUtils.scaleHexColor(hex, palette.ambient),
      palette.fogColor,
      (1 - palette.ambient) * TINT_STRENGTH
    );
    var out = CanvasUtils.lerpHexColor(
      lit,
      palette.fogColor,
      Light.fogForDepth(depth === undefined ? 0.9 : depth)
    );

    if (local && local.amount > 0.002) {
      out = CanvasUtils.addHexLight(out, local.color,
                                    local.amount * (peso === undefined ? 1 : peso));
    }
    return out;
  };

  PMV.Engine.Light = Light;
})(window.PMV = window.PMV || {});
