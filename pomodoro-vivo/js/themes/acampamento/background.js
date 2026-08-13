(function (PMV) {
  'use strict';

  PMV.Themes = PMV.Themes || {};
  PMV.Themes.Acampamento = PMV.Themes.Acampamento || {};

  var CanvasUtils = PMV.Engine.CanvasUtils;

  // A PAISAGEM. Serra, mata e chão existem desde 0% de progresso - eles são
  // o lugar, não a recompensa. O que o foco constrói é o acampamento, que
  // vive na camada SVG por cima disto. Sem essa separação, 0% seria um
  // vazio esperando ser preenchido (foi o que aconteceu no recife).

  function Background() {
    this._layout = null;          // parâmetros/seeds sorteados 1x por sessão
    this._horizonSegments = null; // curva suave do horizonte da clareira
    this._horizonTracePts = null; // pontos amostrados da mesma curva
    this._ridges = null;          // {far, near} -> polilinha da serra
    this._scatter = null;         // TUDO que se apoia no chão, ordenado por profundidade
    this._soilSpeckles = null;
    this._soilPatches = null;
    this._stars = null;
    this._shafts = null;
    this._dust = null;
    this._embers = null;
    this._foregroundPolys = null;
    this._time = 0;
    this._width = 0;
    this._height = 0;
    this._dustRng = null;
    this._emberRng = null;
    this._timeOverrideHour = null;
    this._currentPalette = null;
    this._bottomY = 0;

    // O contrato do terreno (ver createPlane). Por instância, não no
    // prototype: ele fecha sobre ESTA cena.
    this.plane = createPlane(this);

    // Fonte de luz LOCAL. O modelo de iluminação global (ambiente + luz-chave)
    // é o mesmo do recife; isto é o segundo termo, e é o que faz o app ficar
    // bonito justamente às 22h, quando o recife morria. Quem alimenta é o
    // tema, a partir da fogueira de verdade em cena.
    this.fire = { x: 0, y: 0, intensity: 0, active: false };
  }

  // ---- Paletas por horário ----
  // Mesma estrutura do recife (a mudança de tema não toca no modelo de luz):
  //
  //   sky/body/bodyOpacityMul - céu, sol/lua e a cor da luz que entra
  //   ambient   - multiplicador de luminância do TERRENO. É o que faz o chão
  //               e as árvores escurecerem junto com o céu. Sem isto a cena
  //               lia como céu de pôr-do-sol com montanhas coladas embaixo.
  //   key/keyStrength - cor e força da luz DIRETA, somada nas cristas e nas
  //               faces viradas pra ela.
  //   fog       - névoa atmosférica. De dia é azul-pálida (perspectiva aérea
  //               de verdade: a serra distante desbota pro azul do céu), à
  //               noite é azul-escura.
  var TIME_KEYFRAMES = [
    { hour: 0,  sky: [[0, '#080f28'], [0.34, '#0d1836'], [0.62, '#132244'], [0.84, '#1b2c50'], [1, '#243459']],
      body: '#c9d8ff', bodyOpacityMul: 0.34, fog: '#16203c', ambient: 0.12, key: '#8fb4ff', keyStrength: 0.13 },
    { hour: 5,  sky: [[0, '#1d2f5c'], [0.30, '#3a5279'], [0.58, '#6d7194'], [0.82, '#b98d8a'], [1, '#e0a87e']],
      body: '#ffd2ab', bodyOpacityMul: 0.55, fog: '#6a6c85', ambient: 0.33, key: '#ffc39c', keyStrength: 0.26 },
    { hour: 8,  sky: [[0, '#3f86c8'], [0.30, '#63a4da'], [0.58, '#96c4e6'], [0.82, '#c2dcef'], [1, '#e2edf2']],
      body: '#fff6dd', bodyOpacityMul: 0.90, fog: '#b6d0e2', ambient: 0.82, key: '#fff3d6', keyStrength: 0.42 },
    { hour: 13, sky: [[0, '#2f78c4'], [0.30, '#559dd6'], [0.58, '#8fc2e6'], [0.82, '#bfdcee'], [1, '#e4eff5']],
      body: '#ffffff', bodyOpacityMul: 1.0,  fog: '#c1dbec', ambient: 1.00, key: '#ffffff', keyStrength: 0.48 },
    { hour: 17, sky: [[0, '#3d7ab4'], [0.30, '#6e9bc2'], [0.58, '#a8adba'], [0.82, '#d8b493'], [1, '#f0cf9c']],
      body: '#ffe3b0', bodyOpacityMul: 0.92, fog: '#c6b39c', ambient: 0.84, key: '#ffd79a', keyStrength: 0.46 },
    // Pôr do sol: o quente fica no TERÇO DE BAIXO do céu, junto do horizonte,
    // e o topo já puxa pro azul-noite. Laranja subindo até o topo do quadro
    // lê como filtro, não como fim de tarde.
    { hour: 19, sky: [[0, '#1e2551'], [0.30, '#3c3566'], [0.56, '#6e4269'], [0.80, '#c2645a'], [1, '#f0985a']],
      body: '#ffab6a', bodyOpacityMul: 0.68, fog: '#8a6672', ambient: 0.42, key: '#ff9a5c', keyStrength: 0.40 },
    { hour: 21, sky: [[0, '#0d1433'], [0.32, '#141d42'], [0.60, '#20264e'], [0.84, '#32305a'], [1, '#4a3d5e']],
      body: '#c2b6ff', bodyOpacityMul: 0.42, fog: '#2a2f52', ambient: 0.18, key: '#9d92ff', keyStrength: 0.17 },
    { hour: 24, sky: [[0, '#080f28'], [0.34, '#0d1836'], [0.62, '#132244'], [0.84, '#1b2c50'], [1, '#243459']],
      body: '#c9d8ff', bodyOpacityMul: 0.34, fog: '#16203c', ambient: 0.12, key: '#8fb4ff', keyStrength: 0.13 }
  ];

  function getTimePalette(hourFraction) {
    hourFraction = ((hourFraction % 24) + 24) % 24;
    var a = TIME_KEYFRAMES[0], b = TIME_KEYFRAMES[TIME_KEYFRAMES.length - 1];
    for (var i = 0; i < TIME_KEYFRAMES.length - 1; i++) {
      if (hourFraction >= TIME_KEYFRAMES[i].hour && hourFraction <= TIME_KEYFRAMES[i + 1].hour) {
        a = TIME_KEYFRAMES[i]; b = TIME_KEYFRAMES[i + 1];
        break;
      }
    }
    var span = (b.hour - a.hour) || 1;
    var t = CanvasUtils.clamp((hourFraction - a.hour) / span, 0, 1);
    return {
      skyStops: a.sky.map(function (stop, idx) {
        return [stop[0], CanvasUtils.lerpHexColor(stop[1], b.sky[idx][1], t)];
      }),
      bodyColor: CanvasUtils.lerpHexColor(a.body, b.body, t),
      bodyOpacityMul: CanvasUtils.lerp(a.bodyOpacityMul, b.bodyOpacityMul, t),
      fogColor: CanvasUtils.lerpHexColor(a.fog, b.fog, t),
      ambient: CanvasUtils.lerp(a.ambient, b.ambient, t),
      keyColor: CanvasUtils.lerpHexColor(a.key, b.key, t),
      keyStrength: CanvasUtils.lerp(a.keyStrength, b.keyStrength, t)
    };
  }

  // ---- Modelo de luz ----
  //
  // Mora inteiro em js/engine/light.js, e o CENÁRIO e os OBJETOS chamam a
  // mesma função. Antes eram duas cópias, e elas divergiram em três pontos
  // que empurravam todos pro mesmo lado - o objeto lia como mais claro que o
  // chão em que se apoia. Ver o comentário no engine.
  var Light = PMV.Engine.Light;
  var FOG_STRENGTH = Light.FOG_STRENGTH;

  function fogAmountForDepth(t) {
    return Light.fogForDepth(t);
  }

  function shadeTerrain(baseHex, depth, palette) {
    return Light.shade(baseHex, palette, depth);
  }

  // Traça uma crista com a luz direta do horário, segmento a segmento: a
  // opacidade de cada trecho vem de o quanto AQUELE trecho está virado pra
  // luz. É o que dá volume à silhueta e substitui o gradiente vertical
  // ancorado num único ponto da curva.
  function strokeLitRim(ctx, pts, palette, opts) {
    if (!pts || pts.length < 2) return;
    opts = opts || {};
    var lightDirX = opts.lightDirX || 0;
    var maxAlpha = (opts.maxAlpha === undefined ? 0.5 : opts.maxAlpha) * palette.keyStrength * 2;
    var color = opts.color || palette.keyColor;
    var exponent = opts.exponent === undefined ? 2.2 : opts.exponent;

    ctx.save();
    ctx.lineWidth = opts.lineWidth || 2;
    // Ponta reta, não redonda: com lineCap 'round' cada segmento põe um
    // semicírculo da sua própria opacidade por cima do vizinho, e a crista
    // vira um colar de contas em vez de uma linha de luz.
    ctx.lineCap = 'butt';
    for (var i = 1; i < pts.length; i++) {
      var p0 = pts[i - 1], p1 = pts[i];
      var facing = CanvasUtils.facingLight(p1.x - p0.x, p1.y - p0.y, lightDirX);
      var alpha = maxAlpha * Math.pow(facing, exponent);
      if (alpha < 0.004) continue;
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(p1.x, p1.y);
      ctx.strokeStyle = CanvasUtils.hexToRgba(color, alpha);
      ctx.stroke();
    }
    ctx.restore();
  }

  function pickSeed(rng) {
    return Math.floor(rng() * 2147483647) || 1;
  }

  function densityCount(density, width, refUnit, min, max) {
    return CanvasUtils.clamp(Math.round(density * (width / refUnit)), min, max);
  }

  // ============================================================
  //  O PLANO DE CHÃO
  // ============================================================
  //
  // A versão anterior tinha TRÊS faixas discretas de terreno, e cada objeto
  // grudava numa delas. O problema não era só a cara de bolo de camadas: a
  // posição vertical e a ESCALA eram decididas por caminhos separados (o Y
  // vinha de qual faixa, a escala de uma fórmula solta), então nada obrigava
  // as duas a concordarem.
  //
  // Um plano de verdade tem UMA invariante: o tamanho de um objeto é
  // proporcional a quão abaixo da linha do horizonte ele está. Aqui `y` e
  // `escala` saem os dois do mesmo `t`, e é só por isso que a cena lê como
  // chão em vez de degraus. Uma barraca mais ao fundo fica automaticamente
  // menor e mais alta na tela, sem nenhuma calibragem à mão.
  //
  //   t = pow(depth, DEPTH_EXP)          0 = horizonte, 1 = rente à câmera
  //   y = H(x) + (rodapé - H(x)) * t
  //   escala ∝ SCALE_FLOOR + (1 - SCALE_FLOOR) * t
  //
  // SCALE_FLOOR é uma trapaça deliberada: numa perspectiva exata a escala
  // seria proporcional pura a (y - H), e um objeto no horizonte teria tamanho
  // ZERO. O piso mantém a árvore distante visível como coisa, não como poeira.
  var DEPTH_EXP = 1.35;    // > 1 adensa perto do horizonte (encurtamento)
  var SCALE_FLOOR = 0.16;
  // Profundidade de referência: é aqui que a escala do plano vale 1.0, ou
  // seja, onde o componente aparece no tamanho natural que ele desenhou a
  // partir de refUnit. Está fixada na profundidade da FOGUEIRA - ela é o
  // coração da cena, e ancorar a unidade nela evita ter que recalibrar todo
  // componente já desenhado.
  var DEPTH_REF = 0.62;

  // Horizonte da clareira: onde o chão encontra a mata. É a única curva
  // autoral do terreno agora - toda a ondulação do relevo mora nela.
  var CLEARING_DEF = {
    horizonYf: 0.605,
    amplitudeUnitRange: [0.018, 0.034],
    wavelengthUnitRange: [0.28, 0.44],
    minAnchors: 6, maxAnchors: 13,
    xJitterF: 0.035,
    // O rodapé do plano fica um pouco ABAIXO da tela: assim depth = 1 não
    // significa "colado na borda inferior", e sobra soleira de terra.
    bottomYf: 1.06
  };

  // ---- Envelopes autorais ----
  // Tamanhos são fração de refUnit = min(largura, altura), nunca da largura
  // crua: girar o aparelho não estica a cena. Densidades são "por unidade de
  // largura", recalculadas a cada resize a partir de seeds fixas por sessão.

  // Chão de GRAMADO da clareira. Era terra batida; virou grama porque uma
  // clareira de mata com acampamento é campo, não pátio - e porque terra
  // nua e a lona da barraca ocupam a mesma faixa de matiz, então a barraca
  // não recortava do fundo.
  //
  // Continua dessaturado de propósito: o acampamento é a recompensa e
  // precisa ser a coisa de cor mais forte em quadro. Verde saturado disputa
  // atenção com a barraca e esvazia o app.
  //
  // Com o plano contínuo, a variação de valor ao longo do chão não é
  // escrita à mão: são DUAS cores (a longe e a rente) e o resto é a névoa de
  // perspectiva aérea agindo sobre elas. A versão de faixas tinha quatro
  // paradas fixas e a mais CLARA calhava de ficar no topo, junto com a
  // névoa mais forte - somadas, davam uma faixa pálida atravessando o meio
  // do quadro que lia como lâmina d'água. A ordem aqui é a inversa (clara
  // longe, escura perto) justamente pra isso não voltar - e agora existe uma
  // lâmina d'água de verdade em quadro, que precisa ser a única.
  var GROUND_FAR = '#6e7c45';
  var GROUND_NEAR = '#3b4726';
  // Tons auxiliares da textura, derivados das duas de cima.
  var GROUND_LIGHT = '#87954f';
  var GROUND_DARK = '#2e3a1e';
  var PEBBLE_VARIANTS = [
    { top: '#b4a88d', bottom: '#6f6650' },
    { top: '#a3a49e', bottom: '#5d5e59' },
    { top: '#8a7f6d', bottom: '#4b443a' }
  ];
  // Tufos de mato: agora nascem SOBRE grama, não sobre terra. Precisam de
  // valor um pouco acima do chão pra registrar - tufo verde da mesma
  // luminância do gramado vira ruído invisível e só custa quadro.
  var GRASS_TONES = ['#7b8a4b', '#66763a', '#8b9857', '#556429'];

  // ---- Serra ----
  // Montanha NÃO é a mesma curva do chão com mais amplitude: Catmull-Rom só
  // produz colina arredondada, e uma fileira de colinas azuis lê como duna,
  // não como serra. Deslocamento do ponto médio (midpoint displacement) com
  // rugosidade < 1 dá o perfil autossemelhante e ANGULOSO que o olho
  // reconhece como cordilheira - picos agudos, vales em V, e detalhe fino
  // encaixado dentro do detalhe grosso.
  //
  // Cor de base BEM escura e desfoque curto. A primeira versão usava azuis
  // médios (#54708f) com blur largo, e a névoa de perspectiva aérea comia o
  // resto: ao meio-dia a serra virava um borrão cinza indistinguível do céu.
  // Perspectiva aérea faz o distante DESBOTAR, não DESAPARECER - se a peça
  // não tem valor sobrando pra perder, ela some.
  var RIDGE_DEFS = {
    far:  { depth: 0.10, baseYf: 0.492, amplitudeUnit: 0.150, roughness: 0.56, subdiv: 6, blurUnit: 0.0045, color: '#33506e', rim: 0.16 },
    near: { depth: 0.17, baseYf: 0.566, amplitudeUnit: 0.105, roughness: 0.52, subdiv: 6, blurUnit: 0.0028, color: '#26405a', rim: 0.24 }
  };
  var RIDGE_ORDER = ['far', 'near'];

  // ---- Mata ----
  // UMA população só, com profundidade contínua. As três camadas viraram uma
  // distribuição: `pow(rng(), TREE_DEPTH_BIAS)` empurra a maioria das árvores
  // pro fundo (a linha de mata que fecha a clareira) e deixa umas poucas na
  // frente, grandes, emoldurando as bordas.
  var TREE_DEF = {
    densityRange: [30, 44], minCount: 22, maxCount: 76,
    depthBias: 2.6,
    // Altura ANTES da escala do plano - o plano é quem encolhe a árvore
    // distante, e é isso que amarra o tamanho dela à posição no chão.
    heightUnitRange: [0.38, 0.62],
    broadleafChance: 0.22,
    // Onde a árvore pode nascer, por faixa de profundidade. A clareira só
    // existe porque o meio do quadro é negado às árvores de meia distância;
    // a linha de mata do fundo, essa sim, atravessa a tela inteira.
    farMax: 0.20,                        // < isto: linha de mata, largura toda
    midMax: 0.52,                        // < isto: evita o centro
    // O respiro central acompanha a PEGADA DO ACAMPAMENTO, não o meio
    // geométrico da tela. Com o vão antigo ([0.28, 0.76]) a barraca menor, o
    // cordão e a rede - que moram entre 0.75 e 0.95 - nasciam atrás de uma
    // parede de árvores de meia distância e sumiam. Agora a mata abre até
    // 0.95 e só volta a fechar na borda mesmo.
    midClearCenter: [0.22, 0.95],
    nearBands: [[-0.06, 0.13], [0.94, 1.06]]  // >= midMax: só as bordas
  };

  var CONIFER_COLORS = [
    { top: '#4a6b46', base: '#263d2c' },
    { top: '#3f6350', base: '#1e3630' },
    { top: '#557047', base: '#2b4029' },
    { top: '#446040', base: '#213526' }
  ];
  var BROADLEAF_COLORS = [
    { top: '#6b7c3f', base: '#3b4a26' },
    { top: '#5d7847', base: '#33472b' },
    { top: '#77804a', base: '#454a2b' }
  ];
  var TRUNK_COLOR = '#3b2f24';

  // Mato e pedra: densidades por unidade de largura. O `t` de cada item é
  // sorteado UNIFORME, o que dá distribuição uniforme na TELA (porque y é
  // linear em t) - e não amontoada no horizonte.
  // Com chão de gramado o tufo deixou de ser "mato ocasional" e virou a
  // TEXTURA do chão: é ele que impede o gramado de ler como feltro liso. Por
  // isso a densidade subiu ~2,5x. São traços de 1px, o item mais barato do
  // espalhado - o custo por quadro subiu menos de 1ms.
  var GRASS_DEF = {
    densityRange: [105, 140], minCount: 70, maxCount: 340,
    sizeUnitRange: [0.020, 0.046]   // tamanho antes da escala do plano
  };
  var PEBBLE_DEF = {
    densityRange: [8, 13], minCount: 6, maxCount: 30,
    sizeUnitRange: [0.010, 0.032]
  };
  var PEBBLE_BLOB_POINTS_RANGE = [7, 9];
  var PEBBLE_BLOB_JITTER_RANGE = [0.70, 1.24];

  var SOIL_TEXTURE_DEF = {
    // Sulcos: contornos do chão em profundidades fixas. Como yAtT interpola
    // da curva do horizonte até uma reta no rodapé, eles naturalmente
    // ACHATAM conforme se aproximam - que é o desenho de uma clareira batida.
    rutTs: [0.12, 0.28, 0.47, 0.70],
    speckleDensityRange: [34, 52], speckleSizeUnitRange: [0.0022, 0.0062],
    patchDensityRange: [4, 7], patchSizeUnitRange: [0.06, 0.13]
  };

  // Feixes de sol atravessando a mata. Só existem quando há sol de verdade
  // (a opacidade acompanha bodyOpacityMul), e são poucos e largos - raio
  // fino e repetido lê como listra de filtro.
  var SHAFT_DEF = {
    densityRange: [2.2, 3.8],
    minCount: 2, maxCount: 6,
    widthUnitRange: [0.020, 0.062],
    lengthFracRange: [0.42, 0.80],
    opacityRange: [0.030, 0.075],
    blurUnitRange: [0.012, 0.026],
    baseTiltDegRange: [-16, 16],
    tiltJitterDeg: 2.2,
    swaySpeedRange: [0.05, 0.14]
  };

  var STAR_DEF = { count: 110, sizeRange: [0.5, 1.5], skyFrac: 0.72, twinkleRange: [0.25, 0.9] };

  // Poeira/pólen em suspensão - nunca chama atenção, só reforça que existe
  // ar entre a câmera e a mata.
  var DUST_TIER_DEFS = {
    back:  { depth: 0.18, countDivisor: 42000, sizeRange: [0.3, 0.8], speedRange: [1.0, 3.0], driftRange: [-3, 3],  opacityRange: [0.04, 0.10], blurPx: 0 },
    front: { depth: 0.90, countDivisor: 68000, sizeRange: [1.1, 2.3], speedRange: [2.0, 5.0], driftRange: [-5, 5],  opacityRange: [0.07, 0.16], blurPx: 1.0 }
  };
  var DUST_TIER_ORDER = ['back', 'front'];

  // ---- O lago ----
  //
  // Entra pela borda ESQUERDA e morre antes do centro. Lago atravessando a
  // tela inteira vira faixa e devolve exatamente a "lâmina d'água" que o
  // chão de faixas produzia por acidente - a diferença entre água e engano
  // de gradiente é ter MARGEM: a linha onde ela acaba é o que a torna um
  // corpo d'água em vez de uma parada de cor.
  //
  // Vive entre duas profundidades do MESMO plano de chão, então a margem
  // longe e a margem perto obedecem à mesma perspectiva de tudo o mais. A
  // largura varia como um seno ao longo do eixo: cheia no meio, zero nas
  // pontas. É o que dá o contorno de enseada e faz as pontas fecharem
  // sozinhas, sem parede vertical.
  var LAKE_DEF = {
    x0f: -0.22, x1f: 0.42,
    tFar: 0.085, tNear: 0.30,
    bellyExp: 0.62,              // < 1 engorda o meio e ainda fecha nas pontas
    // Ondulação de baixa frequência SOMADA ao seno. Só com o seno a margem
    // vira uma diagonal reta atravessando o quadro - lê como cunha de cor,
    // não como beira de lago. Duas ondas incomensuráveis com o seno tiram a
    // retidão sem virar serrilhado.
    shoreWaves: [[7.1, 1.4, 0.16], [3.3, 0.2, 0.09]],
    wobbleUnit: 0.010,
    steps: 46,
    // Cor PRÓPRIA da água, fria e dessaturada. A cor final é quase toda
    // reflexo do céu (ver lakeColors): é isso que faz o lago virar laranja
    // no pôr do sol e quase preto às 22h sem nenhuma paleta própria por
    // horário. Água com cor fixa lê como piscina de azulejo.
    water: '#37596b',
    // O reflexo NÃO vem da última parada do céu. Aquela é a faixa junto ao
    // horizonte, quase branca ao meio-dia - com ela o lago saía cor de gelo,
    // mais claro que o próprio céu acima dele. O que a água devolve é o
    // corpo do céu, alguns graus acima da linha do horizonte.
    skyStopIndex: 2,
    farMix: 0.44,                // longe reflete MAIS céu (ângulo raso)
    nearMix: 0.86,
    rippleTs: [0.13, 0.19, 0.245],
    shore: '#5a5a3a'
  };

  // ---- Fogueira (fonte de luz local) ----
  var FIRE_LIGHT_COLOR = '#ff9838';
  // Pré-decomposta: a mistura de cores roda por item do espalhado por
  // quadro, e reparsear o mesmo hex 278 vezes por quadro é desperdício puro.
  var FIRE_RGB = { r: 255, g: 152, b: 56 };
  // Alcance da luz (fração de refUnit). Precisa cobrir o acampamento
  // INTEIRO, não só a roda de pedras: se a barraca cai fora do alcance, ela
  // só pode ser vista pelo piso de luminância - e aí volta a ler como
  // objeto iluminado por um sol que não existe às 22h.
  var FIRE_REACH_UNIT = 0.62;
  // O halo VISÍVEL é mais curto que o alcance da luz. A luz decai suave e
  // longe; a poça que a gente enxerga no chão é bem mais concentrada.
  var FIRE_GLOW_FRAC = 0.78;
  var FIRE_MAX_ADD = 0.62;      // teto do termo aditivo nos objetos
  var EMBER_MAX = 26;

  // ---- Luminárias ----
  // Fontes secundárias. Os números são todos MENORES que os da fogueira, e
  // isso é direção de arte, não modéstia técnica: a cena tem um centro só, e
  // é o fogo. Uma luminária com alcance parecido criaria um segundo ponto
  // focal e o quadro perderia a hierarquia.
  //
  //   reachUnit - alcance em fração do lado curto (fogueira: 0.62)
  //   max       - teto do termo aditivo (fogueira: 0.62)
  //   aspect    - reachY/reachX. A fogueira usa 0.59 porque está NO CHÃO e a
  //               luz lambe de baixo; uma luminária pendurada espalha mais
  //               redondo, e o cordão, sendo uma LINHA de bulbos, espalha
  //               largo e baixo.
  //   yArt      - altura da fonte em unidades de arte da peça (negativo = pra
  //               cima). O lampião acende no vidro, a 123 unidades do chão,
  //               não na base do poste.
  var LAMP_DEFS = {
    'lampiao':         { color: '#ffd49a', reachUnit: 0.24, max: 0.20, aspect: 0.80, yArt: -123 },
    // O cordão está pendurado ALTO e a luz dele precisa chegar no chão: com
    // aspect 0.55 a queda vertical comia quase tudo antes de descer os 60px
    // até a grama, e o que sobrava (0.04) ficava abaixo do limiar de
    // percepção. Continua sendo a fonte mais fraca das três, de longe.
    'cordao-luzinhas': { color: '#ffdcae', reachUnit: 0.32, max: 0.16, aspect: 0.75, yArt: -32 }
  };

  var FOREGROUND_DEF = {
    depth: 1.15,
    countRange: [2, 4],
    widthUnitRange: [0.30, 0.70],
    heightUnitRange: [0.07, 0.15],
    pointsRange: [7, 11],
    xRange: [-0.10, 1.10],
    blurUnit: 0.026,
    darkness: 0.48,
    floor: 0.09
  };

  // ---- Geração de layout (1x por sessão) ----

  Background.prototype._generateLayout = function (rng) {
    var ridges = {};
    RIDGE_ORDER.forEach(function (key) { ridges[key] = pickSeed(rng); });

    return {
      horizon: {
        amplitudeUnit: CanvasUtils.randRange(rng, CLEARING_DEF.amplitudeUnitRange[0], CLEARING_DEF.amplitudeUnitRange[1]),
        wavelengthUnit: CanvasUtils.randRange(rng, CLEARING_DEF.wavelengthUnitRange[0], CLEARING_DEF.wavelengthUnitRange[1]),
        seed: pickSeed(rng)
      },
      ridges: ridges,
      trees: { density: CanvasUtils.randRange(rng, TREE_DEF.densityRange[0], TREE_DEF.densityRange[1]), seed: pickSeed(rng) },
      grass: { density: CanvasUtils.randRange(rng, GRASS_DEF.densityRange[0], GRASS_DEF.densityRange[1]), seed: pickSeed(rng) },
      pebbles: { density: CanvasUtils.randRange(rng, PEBBLE_DEF.densityRange[0], PEBBLE_DEF.densityRange[1]), seed: pickSeed(rng) },
      soil: {
        density: CanvasUtils.randRange(rng, SOIL_TEXTURE_DEF.speckleDensityRange[0], SOIL_TEXTURE_DEF.speckleDensityRange[1]),
        seed: pickSeed(rng),
        patchSeed: pickSeed(rng)
      },
      shafts: {
        density: CanvasUtils.randRange(rng, SHAFT_DEF.densityRange[0], SHAFT_DEF.densityRange[1]),
        seed: pickSeed(rng),
        baseTiltDeg: CanvasUtils.randRange(rng, SHAFT_DEF.baseTiltDegRange[0], SHAFT_DEF.baseTiltDegRange[1])
      },
      stars: pickSeed(rng),
      bodyXf: CanvasUtils.randRange(rng, 0.16, 0.84),
      bodyYf: CanvasUtils.randRange(rng, 0.10, 0.26),
      dust: pickSeed(rng),
      foreground: pickSeed(rng)
    };
  };

  // ---- Reconstrução geométrica (determinística a partir das seeds) ----
  // Roda a cada resize, nunca por frame. NUNCA lê o rng compartilhado: cada
  // peça abre um mulberry32 local sobre a própria seed fixa, senão dois
  // resizes do mesmo tamanho reembaralham a cena inteira.

  function buildHorizonAnchorPoints(lane, width, height, refUnit) {
    var localRng = CanvasUtils.mulberry32(lane.seed);
    var wavelengthPx = Math.max(20, lane.wavelengthUnit * refUnit);
    var count = CanvasUtils.clamp(Math.round(width / wavelengthPx) + 1, CLEARING_DEF.minAnchors, CLEARING_DEF.maxAnchors);
    var xStart = -0.15, xSpan = 1.30;
    var pts = [];
    for (var i = 0; i < count; i++) {
      var baseXf = xStart + (xSpan * i) / Math.max(1, count - 1);
      var jitterXf = CanvasUtils.randRange(localRng, -CLEARING_DEF.xJitterF, CLEARING_DEF.xJitterF);
      var yOffsetUnits = CanvasUtils.randRange(localRng, -lane.amplitudeUnit, lane.amplitudeUnit);
      pts.push({ x: (baseXf + jitterXf) * width, y: CLEARING_DEF.horizonYf * height + yOffsetUnits * refUnit });
    }
    pts.sort(function (a, b) { return a.x - b.x; });
    return pts;
  }

  // Perfil de serra por deslocamento do ponto médio. A amplitude cai por um
  // fator `roughness` a cada subdivisão: com 0.5 o detalhe fino é metade do
  // grosso, que é a estatística de relevo real. Acima de ~0.7 vira ruído
  // branco (serrote); abaixo de ~0.4 vira triângulo liso.
  function buildRidgePoints(seed, def, width, height, refUnit) {
    var rng = CanvasUtils.mulberry32(seed);
    var n = 1 << def.subdiv;
    var h = new Array(n + 1);
    var amp = def.amplitudeUnit * refUnit;

    // As pontas NÃO são zeradas: com h[0]=h[n]=0 a serra mergulha até a
    // linha de base exatamente nas duas bordas do quadro, e lê como um
    // morro isolado centralizado em vez de uma cordilheira que continua
    // para fora da tela.
    h[0] = CanvasUtils.randRange(rng, 0.25, 0.75) * amp;
    h[n] = CanvasUtils.randRange(rng, 0.25, 0.75) * amp;

    var step = n;
    while (step > 1) {
      var half = step >> 1;
      for (var i = half; i < n; i += step) {
        h[i] = (h[i - half] + h[i + half]) / 2 + CanvasUtils.randRange(rng, -amp, amp);
      }
      amp *= def.roughness;
      step = half;
    }

    // Um pouco de folga fora do quadro dos dois lados, pela mesma razão.
    var xStart = -width * 0.06, xEnd = width * 1.06;
    var baseY = def.baseYf * height;
    var pts = [];
    for (var j = 0; j <= n; j++) {
      pts.push({ x: CanvasUtils.lerp(xStart, xEnd, j / n), y: baseY - Math.max(0, h[j]) });
    }
    return pts;
  }

  // ---- Árvores ----
  //
  // Conífera NÃO é um triângulo. São tiers empilhados: cada galho sai do
  // tronco, desce e afina até a ponta, e o tier de cima é mais curto que o
  // de baixo. A silhueta resultante é serrilhada, e é o serrilhado que o
  // olho lê como pinheiro. Um triângulo liso lê como cone de trânsito.
  //
  // Os dois lados são sorteados SEPARADAMENTE (larguras e quedas próprias),
  // porque simetria perfeita denuncia o gerador na hora.
  function buildConifer(rng, height, halfWidth) {
    // Muitos galhos CURTOS, não poucos galhos longos. Com 6-9 tiers a
    // reentrância entre eles fica tão funda que a silhueta lê como uma pilha
    // de losangos (ou de pontas de flecha) empilhados; com 10-14 vira o
    // serrilhado fino que o olho aceita como folhagem.
    var tiers = Math.round(CanvasUtils.randRange(rng, 10, 14));
    var trunkTopY = -height * 0.12;
    var canopy = height * 0.86;
    var lean = CanvasUtils.randRange(rng, -0.045, 0.045); // inclinação leve do eixo

    function axisXAt(y) { return -y * lean; }

    function side(sign) {
      var out = [];
      for (var i = 0; i < tiers; i++) {
        var t = i / (tiers - 1);
        var attachY = trunkTopY - canopy * t;
        // Envelope quase linear: o contorno GERAL de uma conífera é um
        // triângulo estreito, e quem tira a cara de triângulo é o serrilhado
        // por cima dele - não uma curva exótica no envelope.
        var w = halfWidth * Math.pow(1 - t, 0.95) * CanvasUtils.randRange(rng, 0.90, 1.07);
        w = Math.max(w, halfWidth * 0.045);
        // A ponta do galho CAI um pouco abaixo do ponto onde sai do tronco.
        var tipY = attachY + height * CanvasUtils.randRange(rng, 0.012, 0.026) * (1 - t * 0.5);
        out.push({ x: axisXAt(attachY) + sign * w, y: tipY });
        // Reentrância RASA: volta só até ~70% da largura do galho. Voltar
        // até perto do tronco (era 26-40%) é o que cavava o dente fundo.
        var notchY = attachY - (canopy / (tiers - 1)) * CanvasUtils.randRange(rng, 0.42, 0.60);
        out.push({ x: axisXAt(notchY) + sign * w * CanvasUtils.randRange(rng, 0.62, 0.82), y: notchY });
      }
      return out;
    }

    var trunkHalf = Math.max(1, halfWidth * 0.085);
    var right = side(1);
    var left = side(-1);
    left.reverse();

    var pts = [{ x: trunkHalf, y: 0 }, { x: axisXAt(trunkTopY) + trunkHalf, y: trunkTopY }];
    pts = pts.concat(right);
    pts.push({ x: axisXAt(-height), y: -height });   // ápice
    pts = pts.concat(left);
    pts.push({ x: axisXAt(trunkTopY) - trunkHalf, y: trunkTopY });
    pts.push({ x: -trunkHalf, y: 0 });
    return { points: pts, trunkHalf: trunkHalf, trunkTopY: trunkTopY };
  }

  // Folhosa: NÃO é um blob só - são 3 a 5 massas agrupadas, cada uma com
  // centro e raio próprios. Um blob único lê como pirulito.
  //
  // Duas correções sobre a primeira versão, que lia como NUVEM: as massas
  // eram círculos de raio parecido distribuídos em anel, e o anel fechado de
  // bolhas iguais é exatamente o desenho de nuvem de história em quadrinhos.
  // Agora cada lobo é uma elipse achatada de raio bem variado, o
  // agrupamento é mais alto que largo, e um lobo dominante segura o centro -
  // copa de árvore tem massa principal e satélites, não bolhas em coro.
  function buildBroadleaf(rng, height, halfWidth) {
    var crownY = -height * CanvasUtils.randRange(rng, 0.64, 0.74);
    var lobes = [{
      cx: CanvasUtils.randRange(rng, -0.12, 0.12) * halfWidth,
      cy: crownY,
      rx: halfWidth * CanvasUtils.randRange(rng, 0.78, 0.94),
      ry: halfWidth * CanvasUtils.randRange(rng, 0.62, 0.80)
    }];
    var satellites = Math.round(CanvasUtils.randRange(rng, 3, 5));
    for (var i = 0; i < satellites; i++) {
      // Distribuídos na METADE DE CIMA da copa, com uma volta incompleta: um
      // lobo pendurado embaixo do centro não existe em árvore nenhuma.
      var a = Math.PI + (i / satellites) * Math.PI + CanvasUtils.randRange(rng, -0.30, 0.30);
      var spread = halfWidth * CanvasUtils.randRange(rng, 0.42, 0.76);
      var r = halfWidth * CanvasUtils.randRange(rng, 0.30, 0.58);
      lobes.push({
        cx: Math.cos(a) * spread,
        cy: crownY + Math.sin(a) * spread * 0.72,
        rx: r,
        ry: r * CanvasUtils.randRange(rng, 0.72, 0.94)
      });
    }
    return {
      lobes: lobes,
      trunkHalf: Math.max(1, halfWidth * 0.12),
      trunkTopY: crownY + halfWidth * 0.30
    };
  }

  function generatePebbleBlob(rng) {
    var n = Math.round(CanvasUtils.randRange(rng, PEBBLE_BLOB_POINTS_RANGE[0], PEBBLE_BLOB_POINTS_RANGE[1]));
    var radii = [];
    for (var i = 0; i < n; i++) radii.push(CanvasUtils.randRange(rng, PEBBLE_BLOB_JITTER_RANGE[0], PEBBLE_BLOB_JITTER_RANGE[1]));
    return radii;
  }

  // ---- Os habitantes do chão ----
  // Árvore, pedra e tufo de mato agora vão todos pra MESMA lista, cada um
  // com o seu `t`, e a lista é ordenada por profundidade. Com um plano só, o
  // z-order deixa de ser uma ordem de desenho escrita à mão e vira o
  // algoritmo do pintor: uma árvore em t=0.3 desenha antes de uma pedra em
  // t=0.5 porque está mais longe, e ponto.

  // Perfil do lago: para cada x, até que profundidade a água chega.
  // Devolve null fora do corpo d'água - é essa função que o espalhado
  // consulta pra não plantar árvore dentro da água.
  function buildLake(seed, width, refUnit) {
    var rng = CanvasUtils.mulberry32(seed);
    var x0 = LAKE_DEF.x0f * width, x1 = LAKE_DEF.x1f * width;
    var span = x1 - x0;
    var cols = [];
    for (var i = 0; i <= LAKE_DEF.steps; i++) {
      var u = i / LAKE_DEF.steps;
      var belly = Math.pow(Math.sin(Math.PI * u), LAKE_DEF.bellyExp);
      // As ondas da margem entram MULTIPLICADAS pela barriga, não somadas:
      // assim elas somem junto com a água nas pontas e o lago continua
      // fechando sozinho, sem parede vertical na borda.
      var waves = 1;
      for (var w = 0; w < LAKE_DEF.shoreWaves.length; w++) {
        var sw = LAKE_DEF.shoreWaves[w];
        waves += Math.sin(u * sw[0] + sw[1]) * sw[2];
      }
      var wob = (rng() - 0.5) * 2 * LAKE_DEF.wobbleUnit;
      var tNear = LAKE_DEF.tFar + (LAKE_DEF.tNear - LAKE_DEF.tFar) * belly * waves + wob * belly;
      cols.push({ x: x0 + span * u, tNear: Math.max(LAKE_DEF.tFar, tNear) });
    }
    return {
      x0: x0, x1: x1, cols: cols,
      // Profundidade da margem perto em qualquer x, por interpolação linear
      // entre as colunas. Fora do lago devolve tFar (espessura zero).
      nearTAt: function (x) {
        if (x <= x0 || x >= x1) return LAKE_DEF.tFar;
        var f = (x - x0) / span * LAKE_DEF.steps;
        var i0 = Math.floor(f), i1 = Math.min(cols.length - 1, i0 + 1);
        var k = f - i0;
        return cols[i0].tNear * (1 - k) + cols[i1].tNear * k;
      },
      contains: function (x, t) {
        return t >= LAKE_DEF.tFar && t <= this.nearTAt(x);
      }
    };
  }

  Background.prototype._buildScatter = function (width, refUnit) {
    var layout = this._layout;
    var plane = this.plane;
    var items = [];

    // --- árvores ---
    var rng = CanvasUtils.mulberry32(layout.trees.seed);
    var treeCount = densityCount(layout.trees.density, width, refUnit, TREE_DEF.minCount, TREE_DEF.maxCount);
    for (var i = 0; i < treeCount; i++) {
      var d = Math.pow(rng(), TREE_DEF.depthBias);
      var xf;
      if (d >= TREE_DEF.midMax) {
        var band = TREE_DEF.nearBands[Math.floor(rng() * TREE_DEF.nearBands.length) % TREE_DEF.nearBands.length];
        xf = CanvasUtils.randRange(rng, band[0], band[1]);
      } else {
        xf = CanvasUtils.randRange(rng, -0.05, 1.05);
        // Respiro central só na meia distância. Reposiciona pro lado mais
        // próximo em vez de sortear de novo, pra não desviar a sequência.
        if (d >= TREE_DEF.farMax) {
          var cc = TREE_DEF.midClearCenter;
          if (xf > cc[0] && xf < cc[1]) {
            var mid = (cc[0] + cc[1]) / 2;
            xf = xf < mid ? cc[0] - (mid - xf) * 0.35 : cc[1] + (xf - mid) * 0.35;
          }
        }
      }
      var t = plane.tFor(d);
      var scale = plane.rawScaleAt(t);
      var h = CanvasUtils.randRange(rng, TREE_DEF.heightUnitRange[0], TREE_DEF.heightUnitRange[1]) * refUnit * scale;
      var halfW = h * CanvasUtils.randRange(rng, 0.20, 0.30);
      // Folhosa SÓ na meia distância. Sorteia sempre, mesmo quando não usa,
      // pra não desviar a sequência do rng.
      //
      // Nas duas pontas ela falha, por motivos opostos: perto, a copa larga
      // vira moita gigante e fecha a clareira por cima; longe, os lobos
      // satélites ficam pequenos demais pra registrar e o que sobra é uma
      // bola num palito - o desenho de pirulito. Conífera aguenta as duas
      // pontas porque a silhueta dela é a mesma em qualquer tamanho.
      var broadleafRoll = rng();
      var broadleaf = d >= TREE_DEF.farMax && d < TREE_DEF.midMax &&
                      broadleafRoll < TREE_DEF.broadleafChance;
      var treeShape = broadleaf ? buildBroadleaf(rng, h, halfW * 1.35) : buildConifer(rng, h, halfW);
      // Árvore não nasce dentro d'água. O sorteio acontece do mesmo jeito
      // (o rng já foi consumido acima) - só a peça não entra na lista, então
      // a margem do lago some da mata sem desviar a sequência aleatória.
      if (this._lake && this._lake.contains(xf * width, t)) continue;
      items.push({
        kind: 'tree', t: t, x: xf * width, hw: halfW * (broadleaf ? 1.35 : 1.0),
        shape: treeShape,
        leafy: broadleaf,
        height: h,
        colorIndex: Math.floor(rng() * 4),
        // Escurecimento próprio: uma mata em que toda árvore tem o mesmo
        // valor lê como papel de parede.
        tone: CanvasUtils.randRange(rng, 0.84, 1.14)
      });
    }

    // --- pedras soltas ---
    rng = CanvasUtils.mulberry32(layout.pebbles.seed);
    var pebbleCount = densityCount(layout.pebbles.density, width, refUnit, PEBBLE_DEF.minCount, PEBBLE_DEF.maxCount);
    for (i = 0; i < pebbleCount; i++) {
      // `t` uniforme dá distribuição uniforme na TELA, porque y é linear em
      // t. Sortear `depth` uniforme amontoaria tudo perto do horizonte.
      var pt = CanvasUtils.randRange(rng, 0.04, 1.0);
      var px = rng() * width;
      var pr = CanvasUtils.randRange(rng, PEBBLE_DEF.sizeUnitRange[0], PEBBLE_DEF.sizeUnitRange[1]) * refUnit * plane.rawScaleAt(pt);
      var pebble = {
        kind: 'pebble', t: pt, x: px, hw: pr, r: pr,
        aspect: CanvasUtils.randRange(rng, 0.72, 0.96),
        rotationRad: rng() * Math.PI * 2,
        colorVariant: Math.floor(rng() * PEBBLE_VARIANTS.length),
        radii: generatePebbleBlob(rng)
      };
      if (!(this._lake && this._lake.contains(px, pt))) items.push(pebble);
    }

    // --- mato baixo ---
    rng = CanvasUtils.mulberry32(layout.grass.seed);
    var grassCount = densityCount(layout.grass.density, width, refUnit, GRASS_DEF.minCount, GRASS_DEF.maxCount);
    for (i = 0; i < grassCount; i++) {
      var gt = CanvasUtils.randRange(rng, 0.02, 1.0);
      var size = CanvasUtils.randRange(rng, GRASS_DEF.sizeUnitRange[0], GRASS_DEF.sizeUnitRange[1]) * refUnit * plane.rawScaleAt(gt);
      var blades = [];
      var bladeCount = Math.round(CanvasUtils.randRange(rng, 3, 6));
      for (var b = 0; b < bladeCount; b++) {
        blades.push({
          dx: CanvasUtils.randRange(rng, -size * 0.5, size * 0.5),
          lean: CanvasUtils.randRange(rng, -0.75, 0.75),
          len: size * CanvasUtils.randRange(rng, 0.55, 1.15)
        });
      }
      var gx = CanvasUtils.randRange(rng, -0.03, 1.03) * width;
      var tuft = {
        kind: 'grass', t: gt, x: gx, hw: size * 0.5,
        blades: blades, size: size,
        toneIndex: Math.floor(rng() * GRASS_TONES.length) % GRASS_TONES.length
      };
      if (!(this._lake && this._lake.contains(gx, gt))) items.push(tuft);
    }

    // Do fundo pra frente. É esta linha que substitui os seis blocos de
    // desenho interleaved da versão de três faixas.
    items.sort(function (a, b) { return a.t - b.t; });
    return items;
  };

  function buildSoilSpeckles(layout, width, refUnit, plane) {
    var rng = CanvasUtils.mulberry32(layout.soil.seed);
    var count = densityCount(layout.soil.density, width, refUnit, 8, 260);
    var out = [];
    for (var i = 0; i < count; i++) {
      var t = CanvasUtils.randRange(rng, 0.02, 1.0);
      out.push({
        t: t, x: rng() * width,
        r: CanvasUtils.randRange(rng, SOIL_TEXTURE_DEF.speckleSizeUnitRange[0], SOIL_TEXTURE_DEF.speckleSizeUnitRange[1]) * refUnit * plane.rawScaleAt(t),
        tone: CanvasUtils.randRange(rng, 0.8, 1.22),
        opacity: CanvasUtils.randRange(rng, 0.10, 0.30)
      });
    }
    return out;
  }

  function buildSoilPatches(layout, width, refUnit, plane) {
    var rng = CanvasUtils.mulberry32(layout.soil.patchSeed);
    var count = Math.round(CanvasUtils.randRange(rng, SOIL_TEXTURE_DEF.patchDensityRange[0], SOIL_TEXTURE_DEF.patchDensityRange[1]));
    var patches = [];
    for (var i = 0; i < count; i++) {
      var t = CanvasUtils.randRange(rng, 0.05, 1.0);
      patches.push({
        t: t, x: rng() * width,
        r: CanvasUtils.randRange(rng, SOIL_TEXTURE_DEF.patchSizeUnitRange[0], SOIL_TEXTURE_DEF.patchSizeUnitRange[1]) * refUnit * plane.rawScaleAt(t),
        lighter: rng() < 0.5,
        opacity: CanvasUtils.randRange(rng, 0.05, 0.12)
      });
    }
    return patches;
  }

  function buildShafts(shaftLayout, width, refUnit) {
    var rng = CanvasUtils.mulberry32(shaftLayout.seed);
    var count = densityCount(shaftLayout.density, width, refUnit, SHAFT_DEF.minCount, SHAFT_DEF.maxCount);
    var shafts = [];
    for (var i = 0; i < count; i++) {
      shafts.push({
        xf: CanvasUtils.randRange(rng, 0.05, 0.95),
        widthUnit: CanvasUtils.randRange(rng, SHAFT_DEF.widthUnitRange[0], SHAFT_DEF.widthUnitRange[1]),
        lengthFrac: CanvasUtils.randRange(rng, SHAFT_DEF.lengthFracRange[0], SHAFT_DEF.lengthFracRange[1]),
        opacity: CanvasUtils.randRange(rng, SHAFT_DEF.opacityRange[0], SHAFT_DEF.opacityRange[1]),
        blurUnit: CanvasUtils.randRange(rng, SHAFT_DEF.blurUnitRange[0], SHAFT_DEF.blurUnitRange[1]),
        tiltDeg: shaftLayout.baseTiltDeg + CanvasUtils.randRange(rng, -SHAFT_DEF.tiltJitterDeg, SHAFT_DEF.tiltJitterDeg),
        swaySpeed: CanvasUtils.randRange(rng, SHAFT_DEF.swaySpeedRange[0], SHAFT_DEF.swaySpeedRange[1]),
        phase: rng() * Math.PI * 2
      });
    }
    return shafts;
  }

  function buildStars(seed, width, height) {
    var rng = CanvasUtils.mulberry32(seed);
    var stars = [];
    for (var i = 0; i < STAR_DEF.count; i++) {
      stars.push({
        x: rng() * width,
        // Concentradas no alto: perto do horizonte a atmosfera as apaga, e
        // a serra come essa faixa de qualquer jeito.
        y: Math.pow(rng(), 1.5) * height * STAR_DEF.skyFrac,
        r: CanvasUtils.randRange(rng, STAR_DEF.sizeRange[0], STAR_DEF.sizeRange[1]),
        base: CanvasUtils.randRange(rng, STAR_DEF.twinkleRange[0], STAR_DEF.twinkleRange[1]),
        phase: rng() * Math.PI * 2,
        speed: CanvasUtils.randRange(rng, 0.4, 1.5)
      });
    }
    return stars;
  }

  function buildForegroundPolys(seed, width, height, refUnit) {
    var rng = CanvasUtils.mulberry32(seed);
    var count = Math.round(CanvasUtils.randRange(rng, FOREGROUND_DEF.countRange[0], FOREGROUND_DEF.countRange[1]));
    var polys = [];
    for (var i = 0; i < count; i++) {
      var baseX = CanvasUtils.randRange(rng, FOREGROUND_DEF.xRange[0], FOREGROUND_DEF.xRange[1]) * width;
      var wPx = CanvasUtils.randRange(rng, FOREGROUND_DEF.widthUnitRange[0], FOREGROUND_DEF.widthUnitRange[1]) * refUnit;
      var hPx = CanvasUtils.randRange(rng, FOREGROUND_DEF.heightUnitRange[0], FOREGROUND_DEF.heightUnitRange[1]) * refUnit;
      var pointCount = Math.round(CanvasUtils.randRange(rng, FOREGROUND_DEF.pointsRange[0], FOREGROUND_DEF.pointsRange[1]));
      var baseY = height + hPx * 0.5;   // âncora fora do quadro, por baixo
      var jagPhase = rng() * Math.PI * 2;
      var jagFreq = CanvasUtils.randRange(rng, 2.4, 4.2);

      var profilePts = [{ x: baseX - wPx / 2, y: baseY }];
      for (var j = 0; j <= pointCount; j++) {
        var u = j / pointCount;
        var envelope = Math.pow(Math.sin(u * Math.PI), 0.55);
        // Mais recorte que no recife: isto é moita, não laje.
        var jag = 1 + Math.sin(u * Math.PI * jagFreq + jagPhase) * 0.16
                    + Math.sin(u * Math.PI * jagFreq * 2.7 + jagPhase * 1.4) * 0.07;
        profilePts.push({ x: baseX - wPx / 2 + u * wPx, y: baseY - envelope * jag * hPx });
      }
      profilePts.push({ x: baseX + wPx / 2, y: baseY });

      var segs = CanvasUtils.buildSmoothSegments(profilePts);
      polys.push(CanvasUtils.traceSmoothPath(segs, profilePts[0].x, profilePts[profilePts.length - 1].x, 34));
    }
    return polys;
  }

  Background.prototype._rebuildGeometry = function (width, height) {
    var layout = this._layout;
    var self = this;
    var refUnit = Math.min(width, height);

    var pts = buildHorizonAnchorPoints(layout.horizon, width, height, refUnit);
    this._horizonSegments = CanvasUtils.buildSmoothSegments(pts);
    this._horizonTracePts = CanvasUtils.traceSmoothPath(this._horizonSegments, -40, width + 40, 64);
    this._bottomY = CLEARING_DEF.bottomYf * height;

    this._ridges = {};
    RIDGE_ORDER.forEach(function (key) {
      self._ridges[key] = buildRidgePoints(layout.ridges[key], RIDGE_DEFS[key], width, height, refUnit);
    });

    // O lago vem ANTES do espalhado: é ele que diz onde não pode nascer
    // árvore, pedra nem mato.
    this._lake = buildLake(layout.horizon.seed ^ 0x1a2e, width, refUnit);

    this._scatter = this._buildScatter(width, refUnit);
    this._partitionScatter();
    this._soilSpeckles = buildSoilSpeckles(layout, width, refUnit, this.plane);
    this._soilPatches = buildSoilPatches(layout, width, refUnit, this.plane);

    this._shafts = buildShafts(layout.shafts, width, refUnit);
    this._stars = buildStars(layout.stars, width, height);
    this._foregroundPolys = buildForegroundPolys(layout.foreground, width, height, refUnit);
  };

  Background.prototype._seedParticles = function (width, height) {
    var self = this;
    var rng = CanvasUtils.mulberry32(this._layout.dust);
    this._dustRng = rng;
    this._dust = {};
    DUST_TIER_ORDER.forEach(function (key) {
      var def = DUST_TIER_DEFS[key];
      var count = Math.max(3, Math.round((width * height) / def.countDivisor));
      var list = [];
      for (var i = 0; i < count; i++) {
        list.push({
          x: rng() * width,
          y: rng() * height,
          r: CanvasUtils.randRange(rng, def.sizeRange[0], def.sizeRange[1]),
          speed: CanvasUtils.randRange(rng, def.speedRange[0], def.speedRange[1]),
          drift: CanvasUtils.randRange(rng, def.driftRange[0], def.driftRange[1]),
          phase: rng() * Math.PI * 2,
          opacity: CanvasUtils.randRange(rng, def.opacityRange[0], def.opacityRange[1])
        });
      }
      self._dust[key] = list;
    });

    // Brasas: mesma mecânica das partículas, mas nascem NA fogueira e sobem
    // esfriando. Reaproveita o sistema que era plâncton.
    this._emberRng = CanvasUtils.mulberry32(this._layout.dust ^ 0x5bd1);
    this._embers = [];
  };

  Background.prototype.resize = function (width, height, rng) {
    this._width = width;
    this._height = height;
    if (!this._layout) this._layout = this._generateLayout(rng);
    // Direção horizontal da luz da sessão - a MESMA inclinação dos feixes de
    // sol, pra que o realce nas cristas concorde com a direção da luz.
    this._lightDirX = Math.tan(this._layout.shafts.baseTiltDeg * Math.PI / 180);
    this._bottomY = CLEARING_DEF.bottomYf * height;
    this._rebuildGeometry(width, height);
    this._seedParticles(width, height);
  };

  // ============================================================
  //  API do plano — o contrato do terreno
  // ============================================================
  //
  // Tudo que precisa saber "onde isto encosta no chão" e "que tamanho tem
  // ali" passa por aqui. É de propósito uma superfície pequena: quando o
  // terreno virar arte ilustrada, é ESTA a peça que continua respondendo
  // (a ilustração desenha por cima da curva declarada), e nada a jusante
  // precisa mudar.
  //
  // É uma fábrica, e não um objeto no prototype, porque o plano precisa
  // enxergar a curva e o rodapé DESTA cena: no prototype, todas as
  // instâncias dividiriam o mesmo objeto e a última construída venceria.
  function createPlane(bg) {
    return {
      tFor: function (depth) {
        if (depth === undefined || depth === null) return 1;
        return Math.pow(CanvasUtils.clamp(depth, 0, 1), DEPTH_EXP);
      },
      horizonYAt: function (x) {
        if (!bg._horizonSegments) return bg._height * CLEARING_DEF.horizonYf;
        return CanvasUtils.sampleSmoothPathY(bg._horizonSegments, x);
      },
      // Interpola da curva ondulada do horizonte até uma reta no rodapé. O
      // efeito colateral é útil: os contornos ACHATAM conforme se aproximam,
      // que é exatamente o desenho de uma clareira de terra batida.
      yAtT: function (x, t) {
        var h = this.horizonYAt(x);
        return h + (bg._bottomY - h) * t;
      },
      rawScaleAt: function (t) {
        return SCALE_FLOOR + (1 - SCALE_FLOOR) * t;
      },
      // Normalizada: vale 1.0 em DEPTH_REF, que é o tamanho natural com que
      // os componentes se desenham a partir de refUnit. Continua sendo
      // função afim de t, então a invariante do plano (escala ∝ distância
      // abaixo do horizonte) se mantém - a normalização só escolhe a unidade.
      scaleAt: function (depth) {
        return this.rawScaleAt(this.tFor(depth)) / this.rawScaleAt(this.tFor(DEPTH_REF));
      },
      groundYAt: function (x, depth) {
        return this.yAtT(x, this.tFor(depth));
      }
    };
  }

  // ---- Consultas do terreno (usadas pela composição) ----

  Background.prototype.groundSurfaceYf = function (x, depth) {
    if (!this._horizonSegments) return this._height * 0.85;
    return this.plane.groundYAt(x, depth);
  };

  // A INVERSA do plano: da posição na tela de volta pra profundidade.
  //
  // É a consulta que faltava pra alguém poder POSICIONAR coisa na cena. O
  // plano sempre soube responder "esta profundidade encosta em que altura";
  // agora responde "esta altura é que profundidade", que é a pergunta que um
  // arrasto faz. Fecha exata, porque a ida é uma potência de um interpolador
  // monótono - medido, o erro de ida e volta é ruído de ponto flutuante
  // (2e-16), não aproximação.
  //
  // Daqui saem sozinhos o Y de contato, a escala, a névoa e a ordem de
  // desenho: uma conta só decide tudo o que a peça larga no chão precisa.
  Background.prototype.depthAtY = function (x, y) {
    var h = this.plane.horizonYAt(x);
    var span = this._bottomY - h;
    if (span <= 0) return 0;
    var t = CanvasUtils.clamp((y - h) / span, 0, 1);
    return Math.pow(t, 1 / DEPTH_EXP);
  };

  // Tem água neste ponto do chão? Usado pra recusar largar peça no lago.
  Background.prototype.isWater = function (x, depth) {
    return !!(this._lake && this._lake.contains(x, this.plane.tFor(depth)));
  };

  // O `t` do plano, que é o que alimenta a névoa e o parallax do objeto.
  Background.prototype.planeTFor = function (depth) {
    return this.plane.tFor(depth);
  };

  Background.prototype.planeScaleFor = function (depth) {
    return this.plane.scaleAt(depth);
  };

  // ---- Fogueira ----

  Background.prototype.setFire = function (x, y, intensity) {
    this.fire.x = x;
    this.fire.y = y;
    this.fire.intensity = CanvasUtils.clamp(intensity, 0, 1);
    this.fire.active = this.fire.intensity > 0.001;
  };

  // Quanto a noite deixa a fogueira aparecer. Em pleno dia o fogo não
  // ilumina nada de forma perceptível - e fingir que ilumina é o tipo de
  // coisa que faz a cena parecer um videogame de 1998.
  function nightFactor(palette) {
    return CanvasUtils.clamp((1 - palette.ambient) * 1.18, 0, 1);
  }

  // Queda de uma fonte pontual num ponto do mundo.
  //
  // `reachY` menor que `reachX` faz a luz decair MAIS RÁPIDO na vertical.
  // Na fogueira essa assimetria é a assinatura visual do tema: o fogo está
  // no chão, a luz vem de baixo e lambe a base das coisas. Nas luminárias
  // ela é menor, porque a fonte está pendurada no alto.
  function pointLight(src, x, y, night) {
    if (!src.intensity) return 0;
    var dx = (x - src.x) / src.reachX;
    var dy = (y - src.y) / src.reachY;
    var d = Math.sqrt(dx * dx + dy * dy);
    var falloff = CanvasUtils.clamp(1 - d, 0, 1);
    return falloff * falloff * src.intensity * night * src.max;
  }

  // Contribuição da fogueira num ponto do mundo, em [0, FIRE_MAX_ADD].
  Background.prototype.fireLightAt = function (x, y) {
    var f = this.fire;
    if (!f.active) return 0;
    var night = nightFactor(this.currentPalette());
    if (night <= 0.01) return 0;
    var reach = Math.min(this._width, this._height) * FIRE_REACH_UNIT;
    if (reach <= 0) return 0;
    return pointLight({
      x: f.x, y: f.y, intensity: f.intensity,
      reachX: reach, reachY: reach / 1.7, max: FIRE_MAX_ADD
    }, x, y, night);
  };

  Background.prototype.fireLightColor = function () { return FIRE_LIGHT_COLOR; };

  // ---- Luminárias (lampião, cordão de luzinhas) ----
  //
  // Segundas fontes de luz. Elas já EMITIAM (o vidro e os bulbos não
  // escurecem à noite), mas não ILUMINAVAM nada em volta - o que deixava um
  // lampião aceso pousado sobre grama preta, que é o desenho de um adesivo.
  //
  // São deliberadamente fracas e curtas: a fogueira alcança 0.62 do lado
  // curto da tela e soma até 0.62 de luz; a maior daqui alcança 0.30 e soma
  // 0.20. A cena tem UM centro, e ele é o fogo - luminária que disputa vira
  // um segundo ponto focal e o quadro perde a hierarquia.
  //
  // O tema publica a lista a cada mudança de composição (ver _updateLamps).
  Background.prototype.setLamps = function (lamps) {
    var refUnit = Math.min(this._width, this._height) || 800;
    var out = [];
    (lamps || []).forEach(function (l) {
      var def = LAMP_DEFS[l.slotId];
      if (!def) return;
      var reach = refUnit * def.reachUnit;
      out.push({
        x: l.x,
        // A fonte fica onde a luz NASCE: no vidro do lampião, nos bulbos do
        // cordão - não no pé da peça. `escalaArte` converte as unidades de
        // arte da peça em pixels, e é ela que faz a altura da fonte encolher
        // junto quando a peça vai pro fundo.
        y: l.y + def.yArt * l.escalaArte,
        // A poça de luz, essa sim, é no CHÃO, embaixo da peça.
        groundY: l.y,
        intensity: l.intensity === undefined ? 1 : l.intensity,
        reachX: reach,
        reachY: reach * def.aspect,
        max: def.max,
        color: def.color,
        rgb: CanvasUtils.hexToRgb(def.color),
        glowUnit: def.reachUnit
      });
    });
    this._lamps = out;
  };

  Background.prototype.lampCount = function () {
    return this._lamps ? this._lamps.length : 0;
  };

  // Luz local TOTAL num ponto: fogueira mais luminárias.
  //
  // Devolve intensidade e COR. Com mais de uma fonte a cor não pode mais ser
  // uma constante: é a média das cores das fontes ponderada pelo quanto cada
  // uma contribui naquele ponto. Perto do fogo dá laranja; embaixo do
  // lampião, âmbar pálido; no meio, a mistura - que é o que a luz faz.
  // É chamada uma vez POR ITEM DO ESPALHADO POR QUADRO - hoje 278 vezes -,
  // além de uma vez por objeto a cada repintura. Por isso a saída antecipada
  // importa: fora do alcance das luminárias (que é a maior parte do quadro)
  // ela devolve a cor do fogo sem tocar em texto nenhum. Misturar cor exige
  // ler e escrever hex, e fazer isso 278 vezes por quadro custou 2,5 ms
  // quando estava no caminho de todos.
  Background.prototype.localLightAt = function (x, y) {
    var amount = this.fireLightAt(x, y);
    var lamps = this._lamps;
    if (!lamps || !lamps.length) {
      return { amount: amount, color: FIRE_LIGHT_COLOR };
    }
    var night = nightFactor(this.currentPalette());

    var r = 0, g = 0, b = 0, total = 0;
    for (var i = 0; i < lamps.length; i++) {
      var a = pointLight(lamps[i], x, y, night);
      if (a <= 0.002) continue;
      var c = lamps[i].rgb;
      r += c.r * a; g += c.g * a; b += c.b * a;
      total += a;
    }
    // Nenhuma luminária alcança aqui: a resposta é a do fogo, sem mistura.
    if (total <= 0.002) return { amount: amount, color: FIRE_LIGHT_COLOR };

    if (amount > 0) {
      r += FIRE_RGB.r * amount; g += FIRE_RGB.g * amount; b += FIRE_RGB.b * amount;
      total += amount;
    }
    return {
      amount: Math.min(total, FIRE_MAX_ADD),
      color: rgbToHexLocal(r / total, g / total, b / total)
    };
  };

  function rgbToHexLocal(r, g, b) {
    function h(v) {
      var n = Math.round(CanvasUtils.clamp(v, 0, 255));
      return (n < 16 ? '0' : '') + n.toString(16);
    }
    return '#' + h(r) + h(g) + h(b);
  }

  // ---- Horário ----

  Background.prototype.setTimeOverrideHour = function (hour) {
    this._timeOverrideHour = (hour === null || hour === undefined) ? null : hour;
    this._currentPalette = null;
  };

  Background.prototype.currentPalette = function () {
    if (!this._currentPalette) this._currentPalette = getTimePalette(this._resolveHourFraction());
    return this._currentPalette;
  };

  Background.prototype._resolveHourFraction = function () {
    if (this._timeOverrideHour !== null && this._timeOverrideHour !== undefined) {
      return this._timeOverrideHour;
    }
    var now = new Date();
    return now.getHours() + now.getMinutes() / 60;
  };

  // ---- Animação ----

  Background.prototype.update = function (dt) {
    this._time += dt;
    var h = this._height, w = this._width;
    var rng = this._dustRng;
    var self = this;

    DUST_TIER_ORDER.forEach(function (key) {
      var list = self._dust && self._dust[key];
      if (!list) return;
      list.forEach(function (p) {
        p.y -= p.speed * dt;
        p.x += Math.sin(self._time * 0.5 + p.phase) * p.drift * dt;
        if (p.y < -10) {
          p.y = h + 10;
          if (rng) p.x = rng() * w;
        }
      });
    });

    this._updateEmbers(dt);
  };

  Background.prototype._updateEmbers = function (dt) {
    var list = this._embers;
    if (!list) return;
    var f = this.fire;
    var rng = this._emberRng;
    var refUnit = Math.min(this._width, this._height) || 800;

    for (var i = list.length - 1; i >= 0; i--) {
      var e = list[i];
      e.life -= dt;
      if (e.life <= 0) { list.splice(i, 1); continue; }
      e.y -= e.speed * dt;
      e.x += Math.sin(this._time * 1.6 + e.phase) * e.drift * dt;
    }

    if (!f.active || !rng) return;
    // Nascem em proporção à intensidade do fogo, num ritmo estável em
    // segundos (não por frame): a taxa não pode depender do fps.
    var want = Math.round(EMBER_MAX * f.intensity);
    this._emberBudget = (this._emberBudget || 0) + dt * want * 1.4;
    while (this._emberBudget >= 1 && list.length < EMBER_MAX) {
      this._emberBudget -= 1;
      list.push({
        x: f.x + CanvasUtils.randRange(rng, -1, 1) * refUnit * 0.020,
        y: f.y - refUnit * CanvasUtils.randRange(rng, 0.005, 0.030),
        r: CanvasUtils.randRange(rng, 0.7, 1.9),
        speed: CanvasUtils.randRange(rng, refUnit * 0.045, refUnit * 0.11),
        drift: CanvasUtils.randRange(rng, -refUnit * 0.035, refUnit * 0.035),
        phase: rng() * Math.PI * 2,
        life: CanvasUtils.randRange(rng, 1.2, 2.8),
        maxLife: 2.8
      });
    }
    if (this._emberBudget > 4) this._emberBudget = 4;
  };

  // ---- Desenho ----

  // Parallax por profundidade, sem alocar objeto por item. A câmera expõe
  // parallaxFor(depth), mas chamá-la uma vez por tufo de mato criaria
  // centenas de objetos por quadro; aqui só se replica o fator.
  function parallaxFactor(t) { return 0.15 + t * 0.85; }

  Background.prototype.draw = function (ctx, camera, width, height) {
    this._width = width;
    this._height = height;
    this._bottomY = CLEARING_DEF.bottomYf * height;

    var palette = getTimePalette(this._resolveHourFraction());
    this._currentPalette = palette;

    ctx.fillStyle = CanvasUtils.makeVerticalGradient(ctx, 0, 0, 0, height, palette.skyStops);
    ctx.fillRect(0, 0, width, height);

    this._drawStars(ctx, width, height, palette);
    this._drawCelestialBody(ctx, width, height, palette);

    this._drawRidge(ctx, width, height, camera, 'far', palette);
    this._drawRidge(ctx, width, height, camera, 'near', palette);
    this._drawShafts(ctx, width, height, camera, palette);

    // O chão inteiro, de uma vez: do horizonte até o rodapé.
    this._drawClearing(ctx, width, height, camera, palette);
    this._drawSoilTexture(ctx, camera, palette);
    // O lago vem DEPOIS da textura do chão, e por isso a cobre no trecho em
    // que o chão é água - em vez de ter que recortar sulco e grão um a um.
    this._drawLake(ctx, camera, palette);
    // E tudo que se apoia nele, do fundo pra frente. Só a parte que fica
    // ATRÁS do acampamento: o resto é desenhado no canvas de primeiro plano.
    this._drawScatter(ctx, camera, palette, false);

    // A luz da fogueira entra DEPOIS de todo o terreno: ela ilumina o chão
    // que já existe, em vez de virar mais uma camada de cenário.
    this._drawFireGlow(ctx, width, height, palette);
    this._drawLampGlow(ctx, palette);
    this._drawEmbers(ctx, palette);
    this._drawDustTier(ctx, 'front', palette);

    this._drawHorizonHaze(ctx, width, height, palette);
    this._drawVignette(ctx, width, height, palette);
  };

  // O canvas de primeiro plano fica POR CIMA do SVG do acampamento. Além da
  // moita oclusora que sempre esteve aqui, ele agora carrega a parte do
  // espalhado que está na frente das peças - é o que impede uma barraca
  // distante de aparecer colada por cima de uma árvore rente à câmera.
  Background.prototype.drawForeground = function (ctx, camera) {
    var palette = this.currentPalette();
    this._drawScatter(ctx, camera, palette, true);
    this._drawForeground(ctx, camera, palette);
  };

  Background.prototype._drawStars = function (ctx, width, height, palette) {
    if (!this._stars) return;
    // Estrela só aparece quando o céu de fato escurece. Um limiar duro
    // ligaria/desligaria o campo estelar de um quadro pro outro.
    var visibility = CanvasUtils.clamp((0.42 - palette.ambient) / 0.42, 0, 1);
    if (visibility <= 0.01) return;
    var t = this._time;
    ctx.save();
    for (var i = 0; i < this._stars.length; i++) {
      var s = this._stars[i];
      var twinkle = 0.75 + Math.sin(t * s.speed + s.phase) * 0.25;
      ctx.fillStyle = CanvasUtils.hexToRgba('#dfe8ff', s.base * visibility * twinkle * 0.9);
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  };

  // Um único corpo celeste faz sol E lua: a cor e a opacidade vêm da paleta
  // do horário, e o raio encolhe conforme a noite entra. Dois elementos
  // separados exigiriam decidir a hora do nascer/pôr, e a transição ficaria
  // marcada; assim ele simplesmente esfria e diminui.
  Background.prototype._drawCelestialBody = function (ctx, width, height, palette) {
    var layout = this._layout;
    if (!layout) return;
    var refUnit = Math.min(width, height);
    var cx = layout.bodyXf * width;
    var cy = layout.bodyYf * height;
    var r = refUnit * (0.030 + 0.026 * palette.ambient);

    ctx.save();
    // Halo largo cobrindo a tela toda - um fillRect estreito com gradiente
    // deixa a borda dura visível (foi o bug da coluna de luz do recife).
    var halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(width, height) * 0.55);
    halo.addColorStop(0, CanvasUtils.hexToRgba(palette.bodyColor, 0.20 * palette.bodyOpacityMul));
    halo.addColorStop(0.28, CanvasUtils.hexToRgba(palette.bodyColor, 0.07 * palette.bodyOpacityMul));
    halo.addColorStop(1, CanvasUtils.hexToRgba(palette.bodyColor, 0));
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, width, height);

    var disc = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 1.9);
    disc.addColorStop(0, CanvasUtils.hexToRgba(palette.bodyColor, 0.95));
    disc.addColorStop(0.52, CanvasUtils.hexToRgba(palette.bodyColor, 0.55));
    disc.addColorStop(1, CanvasUtils.hexToRgba(palette.bodyColor, 0));
    ctx.fillStyle = disc;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 1.9, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };

  Background.prototype._drawRidge = function (ctx, width, height, camera, key, palette) {
    var pts = this._ridges && this._ridges[key];
    if (!pts) return;
    var def = RIDGE_DEFS[key];
    var refUnit = Math.min(width, height);

    ctx.save();
    var parallax = camera ? camera.parallaxFor(def.depth) : { x: 0, y: 0 };
    ctx.translate(parallax.x * 0.5, parallax.y * 0.12);
    // Blur com teto fixo: em telas grandes refUnit*fator sozinho passa de
    // 20px e dissolve a silhueta numa mancha sem forma.
    if ('filter' in ctx) ctx.filter = 'blur(' + CanvasUtils.clamp(refUnit * def.blurUnit, 0.8, 3.5) + 'px)';

    var top = shadeTerrain(def.color, def.depth, palette);
    var bottom = shadeTerrain(CanvasUtils.scaleHexColor(def.color, 0.72), def.depth, palette);
    var grad = CanvasUtils.makeVerticalGradient(ctx, 0, def.baseYf * height - refUnit * def.amplitudeUnit, 0, height * 0.95, [[0, top], [1, bottom]]);

    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    // Preenche até o fundo do quadro: assim a base nunca fica exposta - o
    // que for desenhado por cima (chão, mata) sempre cobre a parte de baixo.
    ctx.lineTo(width + 60, height + 60);
    ctx.lineTo(-60, height + 60);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // Realce na crista: é ele que separa o pico do céu quando a névoa já
    // tirou quase todo o contraste de valor da silhueta.
    strokeLitRim(ctx, pts, palette, {
      lightDirX: this._lightDirX,
      lineWidth: key === 'near' ? 2.2 : 1.8,
      maxAlpha: def.rim * (1 - fogAmountForDepth(def.depth)),
      exponent: 1.4
    });

    if ('filter' in ctx) ctx.filter = 'none';
    ctx.restore();
  };

  Background.prototype._drawShafts = function (ctx, width, height, camera, palette) {
    if (!this._shafts) return;
    // Feixe de sol só existe com sol. À noite isto some por completo, e o
    // que resta iluminando a cena é a fogueira - que é o ponto do tema.
    var strength = Math.pow(CanvasUtils.clamp(palette.ambient, 0, 1), 1.5) * palette.bodyOpacityMul;
    if (strength < 0.02) return;
    var refUnit = Math.min(width, height);
    var self = this;

    ctx.save();
    var parallax = camera ? camera.parallaxFor(0.10) : { x: 0, y: 0 };
    ctx.translate(parallax.x * 0.25, 0);

    this._shafts.forEach(function (shaft) {
      var sway = Math.sin(self._time * shaft.swaySpeed + shaft.phase) * refUnit * 0.014;
      var topX = shaft.xf * width + sway;
      var len = height * shaft.lengthFrac;
      var bottomX = topX + Math.tan(shaft.tiltDeg * Math.PI / 180) * len;
      var w = Math.max(2, shaft.widthUnit * refUnit);
      var opacity = shaft.opacity * strength;

      if ('filter' in ctx) ctx.filter = 'blur(' + CanvasUtils.clamp(shaft.blurUnit * refUnit, 3, 16) + 'px)';
      var grad = ctx.createLinearGradient(topX, 0, bottomX, len);
      grad.addColorStop(0, CanvasUtils.hexToRgba(palette.bodyColor, opacity));
      grad.addColorStop(0.45, CanvasUtils.hexToRgba(palette.bodyColor, opacity * 0.45));
      grad.addColorStop(1, CanvasUtils.hexToRgba(palette.bodyColor, 0));
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(topX - w / 2, 0);
      ctx.lineTo(topX + w / 2, 0);
      ctx.lineTo(bottomX + w * 0.9, len);
      ctx.lineTo(bottomX - w * 0.9, len);
      ctx.closePath();
      ctx.fill();
    });

    if ('filter' in ctx) ctx.filter = 'none';
    ctx.restore();
  };

  // O chão da clareira: UMA superfície, do horizonte até o rodapé.
  //
  // O gradiente é a perspectiva aérea contínua: cada parada é a mesma cor de
  // terra sombreada num `t` diferente, então a névoa some suavemente do
  // fundo pra frente em vez de dar três saltos. É o que substitui os três
  // shadeFactor da versão de faixas - e sem emenda visível entre elas.
  Background.prototype._drawClearing = function (ctx, width, height, camera, palette) {
    var pts = this._horizonTracePts;
    if (!pts) return;

    ctx.save();
    // O chão cobre todas as profundidades, então recebe o parallax de uma
    // profundidade média; o parallax fino, por item, fica no espalhado.
    var parallax = camera ? camera.parallaxFor(0.45) : { x: 0, y: 0 };
    ctx.translate(parallax.x, parallax.y * 0.3);

    // A parada do gradiente É a profundidade: a posição vertical no chão e o
    // `t` do sombreamento são a mesma grandeza, então a névoa desaparece
    // continuamente do fundo pra frente. Seis paradas bastam - o olho não
    // pega a quebra, e é bem mais barato que sombrear por pixel.
    var minHorizon = pts.reduce(function (m, p) { return Math.min(m, p.y); }, Infinity);
    var stops = [];
    for (var s = 0; s <= 5; s++) {
      var t = s / 5;
      stops.push([t, shadeTerrain(CanvasUtils.lerpHexColor(GROUND_FAR, GROUND_NEAR, t), t, palette)]);
    }
    ctx.fillStyle = CanvasUtils.makeVerticalGradient(ctx, 0, minHorizon, 0, this._bottomY, stops);

    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.lineTo(width + 40, height + 60);
    ctx.lineTo(-40, height + 60);
    ctx.closePath();
    ctx.fill();

    // Sombra de contato logo abaixo do horizonte - separa o chão da mata.
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    var aoGrad = ctx.createLinearGradient(0, minHorizon - 4, 0, minHorizon + 14);
    aoGrad.addColorStop(0, 'rgba(0,0,0,0)');
    aoGrad.addColorStop(0.4, 'rgba(0,0,0,0.10)');
    aoGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.strokeStyle = aoGrad;
    ctx.lineWidth = 14;
    ctx.lineCap = 'round';
    ctx.stroke();

    strokeLitRim(ctx, pts, palette, {
      lightDirX: this._lightDirX,
      lineWidth: 2.0,
      maxAlpha: 0.10 * (1 - fogAmountForDepth(0.1))
    });

    ctx.restore();
  };

  Background.prototype._drawSoilTexture = function (ctx, camera, palette) {
    var plane = this.plane;
    var width = this._width;
    var camX = camera ? camera.x : 0, camY = camera ? camera.y : 0;

    ctx.save();

    // Manchas amplas do solo.
    var patches = this._soilPatches || [];
    for (var i = 0; i < patches.length; i++) {
      var p = patches[i];
      var tone = shadeTerrain(p.lighter ? GROUND_LIGHT : GROUND_DARK, p.t, palette);
      var f = parallaxFactor(p.t);
      var px = p.x + camX * f, py = plane.yAtT(p.x, p.t) + camY * f * 0.3;
      var grad = ctx.createRadialGradient(px, py, 0, px, py, p.r);
      grad.addColorStop(0, CanvasUtils.hexToRgba(tone, p.opacity));
      grad.addColorStop(1, CanvasUtils.hexToRgba(tone, 0));
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(px, py, p.r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Sulcos: contornos do chão. Achatam conforme se aproximam, porque
    // yAtT interpola da curva do horizonte pra uma reta no rodapé.
    var ruts = SOIL_TEXTURE_DEF.rutTs;
    for (var r = 0; r < ruts.length; r++) {
      var rt = ruts[r];
      var color = shadeTerrain(r % 2 === 0 ? GROUND_DARK : GROUND_LIGHT, rt, palette);
      var rf = parallaxFactor(rt);
      ctx.beginPath();
      for (var x = -40; x <= width + 40; x += 24) {
        var y = plane.yAtT(x, rt) + camY * rf * 0.3;
        if (x === -40) ctx.moveTo(x + camX * rf, y); else ctx.lineTo(x + camX * rf, y);
      }
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.12 + rt * 0.14;
      ctx.lineWidth = 1.2 + rt * 1.4;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Grão fino.
    var speckles = this._soilSpeckles || [];
    for (var s = 0; s < speckles.length; s++) {
      var sp = speckles[s];
      var sf = parallaxFactor(sp.t);
      ctx.beginPath();
      ctx.fillStyle = shadeTerrain(CanvasUtils.scaleHexColor(GROUND_FAR, sp.tone), sp.t, palette);
      ctx.globalAlpha = sp.opacity;
      ctx.arc(sp.x + camX * sf, plane.yAtT(sp.x, sp.t) + camY * sf * 0.3, sp.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    ctx.restore();
  };

  // A cor da água é quase toda REFLEXO. O lago não tem paleta por horário
  // própria: ele mistura a cor do céu junto ao horizonte com um azul frio
  // próprio, e é só isso que o faz ficar laranja às 19h e quase preto às
  // 22h junto com todo o resto. Água com cor fixa lê como piscina.
  //
  // Longe reflete MAIS céu que perto: rasante, a superfície devolve o céu;
  // olhando quase de cima, devolve o fundo. É essa diferença que dá
  // profundidade a uma forma que é literalmente plana.
  function lakeColors(palette) {
    var sky = palette.skyStops[LAKE_DEF.skyStopIndex][1];
    return {
      far: shadeTerrain(CanvasUtils.lerpHexColor(sky, LAKE_DEF.water, LAKE_DEF.farMix), LAKE_DEF.tFar, palette),
      near: shadeTerrain(CanvasUtils.lerpHexColor(sky, LAKE_DEF.water, LAKE_DEF.nearMix), LAKE_DEF.tNear, palette)
    };
  }

  Background.prototype._drawLake = function (ctx, camera, palette) {
    var lake = this._lake;
    if (!lake) return;
    var plane = this.plane;
    var cols = lake.cols;
    var camX = camera ? camera.x : 0, camY = camera ? camera.y : 0;
    // Mesmo parallax do chão: a água É o chão, num trecho em que ele é
    // líquido. Parallax próprio faria o lago deslizar por cima da margem.
    var f = parallaxFactor(0.2);
    var colors = lakeColors(palette);
    var i;

    ctx.save();

    // Contorno: margem longe da esquerda pra direita, margem perto voltando.
    ctx.beginPath();
    for (i = 0; i < cols.length; i++) {
      var xf1 = cols[i].x + camX * f;
      var yf1 = plane.yAtT(cols[i].x, LAKE_DEF.tFar) + camY * f * 0.3;
      if (i === 0) ctx.moveTo(xf1, yf1); else ctx.lineTo(xf1, yf1);
    }
    for (i = cols.length - 1; i >= 0; i--) {
      ctx.lineTo(cols[i].x + camX * f,
                 plane.yAtT(cols[i].x, cols[i].tNear) + camY * f * 0.3);
    }
    ctx.closePath();

    var yTop = plane.yAtT(lake.x1 * 0.5, LAKE_DEF.tFar);
    var yBot = plane.yAtT(lake.x1 * 0.5, LAKE_DEF.tNear);
    ctx.fillStyle = CanvasUtils.makeVerticalGradient(ctx, 0, yTop, 0, yBot + 1,
      [[0, colors.far], [1, colors.near]]);
    ctx.fill();

    // Ondulação: riscos horizontais curtos, sempre PARALELOS ao horizonte.
    // Recortados pelo próprio corpo d'água, senão vazam pra grama e a
    // ilusão morre na hora.
    ctx.clip();
    ctx.lineCap = 'round';
    for (var r = 0; r < LAKE_DEF.rippleTs.length; r++) {
      var rt = LAKE_DEF.rippleTs[r];
      ctx.strokeStyle = CanvasUtils.lerpHexColor(colors.far, palette.fogColor, 0.35);
      ctx.globalAlpha = 0.20 - r * 0.04;
      ctx.lineWidth = 1 + r * 0.6;
      ctx.beginPath();
      for (var x = lake.x0; x <= lake.x1; x += 26) {
        // Traço curto com falha: linha contínua vira listra de piscina.
        var seg = ((x * 7.3 + r * 41) % 100) / 100;
        if (seg > 0.62) continue;
        var y = plane.yAtT(x, rt) + camY * f * 0.3;
        ctx.moveTo(x + camX * f, y);
        ctx.lineTo(x + camX * f + 15 + seg * 22, y);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    // Margem molhada na borda de perto: a linha onde a água encontra a
    // grama. Sem ela o lago é um decalque colado no gramado.
    ctx.save();
    ctx.beginPath();
    for (i = 0; i < cols.length; i++) {
      var mx = cols[i].x + camX * f;
      var my = plane.yAtT(cols[i].x, cols[i].tNear) + camY * f * 0.3;
      if (i === 0) ctx.moveTo(mx, my); else ctx.lineTo(mx, my);
    }
    ctx.strokeStyle = shadeTerrain(LAKE_DEF.shore, LAKE_DEF.tNear, palette);
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = Math.max(1.5, Math.min(this._width, this._height) * 0.004);
    ctx.stroke();
    ctx.restore();
  };

  // ---- Oclusão entre o cenário e o acampamento ----
  //
  // O espalhado e o acampamento vivem em superfícies diferentes: mato,
  // pedra e árvore são canvas; as peças do acampamento são SVG, numa camada
  // que fica INTEIRA por cima do canvas de fundo. Enquanto o cenário era só
  // paisagem isso não aparecia; com quinze objetos no chão, aparecia o
  // tempo todo - uma árvore rente à câmera era desenhada atrás de uma
  // barraca muito mais distante, e a peça flutuava na frente da mata.
  //
  // A saída é repartir o espalhado em dois. Cada item pergunta: existe
  // alguma peça do acampamento cuja pegada eu cruzo e que esteja MAIS LONGE
  // que eu? Se existe, eu vou pro canvas de primeiro plano, que é desenhado
  // por cima do SVG. Senão fico no de fundo.
  //
  // É por item e por profundidade real, não por uma linha de corte única:
  // com corte único, ou a árvore da borda esquerda passa a cobrir a canoa
  // que está na frente dela, ou continua sumindo atrás da barraca.
  Background.prototype.setOccluders = function (list) {
    this._occluders = list || [];
    this._partitionScatter();
  };

  Background.prototype._partitionScatter = function () {
    var list = this._scatter;
    if (!list) return;
    var occ = this._occluders || [];
    for (var i = 0; i < list.length; i++) {
      var it = list[i];
      var front = false;
      for (var j = 0; j < occ.length; j++) {
        var o = occ[j];
        if (o.halfWidth <= 0 || it.t <= o.t) continue;
        // Soma as duas meias-larguras: encostar de raspão já é cruzar.
        if (Math.abs(it.x - o.x) <= o.halfWidth + (it.hw || 0)) { front = true; break; }
      }
      it.front = front;
    }
  };

  // Um laço só, do fundo pra frente. Árvore, pedra e mato dividem a mesma
  // lista ordenada por `t`, então a oclusão entre eles sai de graça.
  Background.prototype._drawScatter = function (ctx, camera, palette, wantFront) {
    var list = this._scatter;
    if (!list) return;
    var plane = this.plane;
    var camX = camera ? camera.x : 0, camY = camera ? camera.y : 0;
    var time = this._time;
    var lightDirX = this._lightDirX;
    var self = this;

    ctx.save();
    ctx.lineCap = 'round';

    for (var i = 0; i < list.length; i++) {
      var it = list[i];
      if (!!it.front !== !!wantFront) continue;
      var f = parallaxFactor(it.t);
      var x = it.x + camX * f;
      var y = plane.yAtT(it.x, it.t) + camY * f * 0.3;
      var luz = self.localLightAt(x, y);

      if (it.kind === 'tree') drawTree(ctx, it, x, y, palette, luz, lightDirX);
      else if (it.kind === 'pebble') drawPebble(ctx, it, x, y, palette, luz);
      else drawGrassTuft(ctx, it, x, y, palette, luz, time);
    }

    ctx.globalAlpha = 1;
    ctx.restore();
  };

  function drawTree(ctx, tree, x, y, palette, luz, lightDirX) {
    var pal = tree.leafy
      ? BROADLEAF_COLORS[tree.colorIndex % BROADLEAF_COLORS.length]
      : CONIFER_COLORS[tree.colorIndex % CONIFER_COLORS.length];
    var topColor = shadeTerrain(CanvasUtils.scaleHexColor(pal.top, tree.tone), tree.t, palette);
    var baseColor = shadeTerrain(CanvasUtils.scaleHexColor(pal.base, tree.tone), tree.t, palette);
    var trunkColor = shadeTerrain(TRUNK_COLOR, tree.t, palette);
    if (luz.amount > 0.001) {
      // A luz local lambe a base primeiro - por isso o termo é maior no
      // baixo da árvore que no alto.
      topColor = CanvasUtils.addHexLight(topColor, luz.color, luz.amount * 0.35);
      baseColor = CanvasUtils.addHexLight(baseColor, luz.color, luz.amount * 0.85);
      trunkColor = CanvasUtils.addHexLight(trunkColor, luz.color, luz.amount * 0.9);
    }

    var shape = tree.shape;
    ctx.save();
    ctx.translate(x, y);

    // Tronco só quando há tronco pra ver. Abaixo de ~26px de altura ele vira
    // um risco de 1px sob a copa, e um risco de 1px sob uma massa
    // arredondada é exatamente o desenho de um pirulito. Numa mata distante
    // real não se enxerga tronco nenhum - só a massa da folhagem.
    if (tree.height > 26) {
      ctx.fillStyle = trunkColor;
      ctx.fillRect(-shape.trunkHalf, shape.trunkTopY, shape.trunkHalf * 2, -shape.trunkTopY + 1);
    }

    var grad = ctx.createLinearGradient(0, -tree.height, 0, 0);
    grad.addColorStop(0, topColor);
    grad.addColorStop(1, baseColor);
    ctx.fillStyle = grad;

    if (tree.leafy) {
      for (var i = 0; i < shape.lobes.length; i++) {
        var lobe = shape.lobes[i];
        ctx.beginPath();
        ctx.ellipse(lobe.cx, lobe.cy, lobe.rx, lobe.ry, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      ctx.beginPath();
      ctx.moveTo(shape.points[0].x, shape.points[0].y);
      for (var j = 1; j < shape.points.length; j++) ctx.lineTo(shape.points[j].x, shape.points[j].y);
      ctx.closePath();
      ctx.fill();
      // Luz direta na silhueta só nas árvores próximas: no fundo ela some na
      // névoa e só custaria tempo de quadro.
      if (tree.t > 0.34) {
        strokeLitRim(ctx, shape.points, palette, {
          lightDirX: lightDirX,
          lineWidth: 1.0 + tree.t,
          maxAlpha: 0.13 * (1 - fogAmountForDepth(tree.t)),
          exponent: 2.4
        });
      }
    }
    ctx.restore();
  }

  function drawPebble(ctx, p, x, y, palette, luz) {
    var variant = PEBBLE_VARIANTS[p.colorVariant] || PEBBLE_VARIANTS[0];
    var topColor = CanvasUtils.addHexLight(
      shadeTerrain(variant.top, p.t, palette),
      palette.keyColor,
      palette.keyStrength * 0.22 * (1 - fogAmountForDepth(p.t))
    );
    var bottomColor = shadeTerrain(variant.bottom, p.t, palette);
    if (luz.amount > 0.001) {
      topColor = CanvasUtils.addHexLight(topColor, luz.color, luz.amount * 0.7);
      bottomColor = CanvasUtils.addHexLight(bottomColor, luz.color, luz.amount * 0.95);
    }

    ctx.save();
    ctx.translate(x, y + p.r * 0.35);
    ctx.scale(1.5, 0.5);
    var shadowGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, p.r);
    shadowGrad.addColorStop(0, 'rgba(14,12,8,0.26)');
    shadowGrad.addColorStop(1, 'rgba(14,12,8,0)');
    ctx.fillStyle = shadowGrad;
    ctx.beginPath();
    ctx.arc(0, 0, p.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1, p.aspect);
    var blobPts = CanvasUtils.buildBlobPoints(0, 0, p.r, p.radii, p.rotationRad);
    var grad = ctx.createLinearGradient(0, -p.r, 0, p.r);
    grad.addColorStop(0, topColor);
    grad.addColorStop(1, bottomColor);
    ctx.fillStyle = grad;
    ctx.beginPath();
    CanvasUtils.tracePointsSmooth(ctx, blobPts);
    ctx.fill();
    ctx.restore();
  }

  function drawGrassTuft(ctx, tuft, x, y, palette, luz, time) {
    var color = shadeTerrain(GRASS_TONES[tuft.toneIndex], tuft.t, palette);
    if (luz.amount > 0.001) color = CanvasUtils.addHexLight(color, luz.color, luz.amount * 0.9);
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.45 + tuft.t * 0.5;
    ctx.lineWidth = Math.max(0.7, 0.8 + tuft.t * 1.1);
    // Balanço leve, comum ao tufo inteiro: lâmina por lâmina com fase
    // própria vira ruído, não vento.
    var sway = Math.sin(time * 0.7 + tuft.x * 0.01) * 0.14;
    for (var i = 0; i < tuft.blades.length; i++) {
      var b = tuft.blades[i];
      var bx = x + b.dx;
      ctx.beginPath();
      ctx.moveTo(bx, y);
      ctx.quadraticCurveTo(
        bx + (b.lean + sway) * b.len * 0.35, y - b.len * 0.6,
        bx + (b.lean + sway) * b.len * 0.9, y - b.len
      );
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  // O halo da fogueira. Duas peças, e a divisão importa:
  //
  //   poça no chão - elipse bem achatada, porque a fogueira está APOIADA no
  //     chão e a luz se espalha rasante. Um círculo aqui lê como lâmpada
  //     flutuando.
  //   halo no ar   - redondo, bem mais fraco, é a fumaça/poeira acesa em
  //     volta do fogo.
  //
  // Ambos em composição 'lighter': luz SOMA, não substitui. Com
  // 'source-over' a poça viraria um adesivo laranja opaco por cima do chão,
  // apagando a textura que o modelo de luz acabou de desenhar.
  Background.prototype._drawFireGlow = function (ctx, width, height, palette) {
    var f = this.fire;
    if (!f.active) return;
    var night = nightFactor(palette);
    var strength = f.intensity * night;
    if (strength < 0.01) return;
    var refUnit = Math.min(width, height);
    var reach = refUnit * FIRE_REACH_UNIT * FIRE_GLOW_FRAC * (0.82 + f.intensity * 0.28);

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    ctx.save();
    ctx.translate(f.x, f.y);
    ctx.scale(1, 0.34);
    var pool = ctx.createRadialGradient(0, 0, 0, 0, 0, reach);
    pool.addColorStop(0, CanvasUtils.hexToRgba(FIRE_LIGHT_COLOR, 0.50 * strength));
    pool.addColorStop(0.35, CanvasUtils.hexToRgba(FIRE_LIGHT_COLOR, 0.20 * strength));
    pool.addColorStop(1, CanvasUtils.hexToRgba(FIRE_LIGHT_COLOR, 0));
    ctx.fillStyle = pool;
    ctx.beginPath();
    ctx.arc(0, 0, reach, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    var airR = reach * 0.72;
    var air = ctx.createRadialGradient(f.x, f.y - airR * 0.22, 0, f.x, f.y - airR * 0.22, airR);
    air.addColorStop(0, CanvasUtils.hexToRgba('#ffb663', 0.22 * strength));
    air.addColorStop(0.45, CanvasUtils.hexToRgba(FIRE_LIGHT_COLOR, 0.08 * strength));
    air.addColorStop(1, CanvasUtils.hexToRgba(FIRE_LIGHT_COLOR, 0));
    ctx.fillStyle = air;
    ctx.fillRect(0, 0, width, height);

    ctx.restore();
  };

  // Poça de luz das luminárias no chão. Bem menor e mais fraca que a da
  // fogueira, e sem o halo no ar: fumaça acesa em volta é coisa de fogo, e
  // pôr um halo de névoa em volta de um lampião o transformaria num poste de
  // rua com neblina.
  //
  // Achatada em 0.30 na vertical, como a do fogo, porque é luz caindo num
  // chão visto quase de lado - poça redonda lê como bola flutuando.
  Background.prototype._drawLampGlow = function (ctx, palette) {
    var lamps = this._lamps;
    if (!lamps || !lamps.length) return;
    var night = nightFactor(palette);
    if (night < 0.02) return;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (var i = 0; i < lamps.length; i++) {
      var l = lamps[i];
      var forca = l.intensity * night;
      if (forca < 0.02) continue;
      var raio = l.reachX * 0.85;
      ctx.save();
      ctx.translate(l.x, l.groundY);
      ctx.scale(1, 0.30);
      var poca = ctx.createRadialGradient(0, 0, 0, 0, 0, raio);
      poca.addColorStop(0, CanvasUtils.hexToRgba(l.color, 0.30 * forca));
      poca.addColorStop(0.4, CanvasUtils.hexToRgba(l.color, 0.10 * forca));
      poca.addColorStop(1, CanvasUtils.hexToRgba(l.color, 0));
      ctx.fillStyle = poca;
      ctx.beginPath();
      ctx.arc(0, 0, raio, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  };

  Background.prototype._drawEmbers = function (ctx, palette) {
    var list = this._embers;
    if (!list || !list.length) return;
    var night = nightFactor(palette);
    if (night < 0.02) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      // A brasa ESFRIA enquanto sobe: some por perda de calor, não por um
      // fade genérico.
      var lifeT = CanvasUtils.clamp(e.life / e.maxLife, 0, 1);
      var color = CanvasUtils.lerpHexColor('#8a2b10', '#ffcf7a', lifeT);
      ctx.fillStyle = CanvasUtils.hexToRgba(color, lifeT * 0.75 * night);
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.r * (0.5 + lifeT * 0.6), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  };

  Background.prototype._drawDustTier = function (ctx, key, palette) {
    var list = this._dust && this._dust[key];
    if (!list) return;
    var def = DUST_TIER_DEFS[key];
    ctx.save();
    if (def.blurPx && 'filter' in ctx) ctx.filter = 'blur(' + def.blurPx + 'px)';
    var tint = CanvasUtils.lerpHexColor('#ffffff', palette.bodyColor, def.depth * 0.4);
    // Poeira é luz refletida: em pleno escuro não há o que refletir.
    var vis = 0.25 + palette.ambient * 0.75;
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      ctx.beginPath();
      ctx.fillStyle = CanvasUtils.hexToRgba(tint, p.opacity * vis);
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    if (def.blurPx && 'filter' in ctx) ctx.filter = 'none';
    ctx.restore();
  };

  // Névoa acumulada rente à linha do horizonte - é o que assenta a serra no
  // chão em vez de deixá-la recortada como adesivo.
  Background.prototype._drawHorizonHaze = function (ctx, width, height, palette) {
    var top = height * (CLEARING_DEF.horizonYf - 0.18);
    var bottom = height * (CLEARING_DEF.horizonYf + 0.12);
    var grad = CanvasUtils.makeVerticalGradient(ctx, 0, top, 0, bottom, [
      [0, CanvasUtils.hexToRgba(palette.fogColor, 0)],
      [0.45, CanvasUtils.hexToRgba(palette.fogColor, 0.10)],
      [1, CanvasUtils.hexToRgba(palette.fogColor, 0)]
    ]);
    ctx.fillStyle = grad;
    ctx.fillRect(0, top, width, bottom - top);
  };

  Background.prototype._drawVignette = function (ctx, width, height, palette) {
    var cx = width / 2, cy = height * 0.45;
    var maxR = Math.sqrt(width * width + height * height) * 0.62;
    var grad = ctx.createRadialGradient(cx, cy, maxR * 0.52, cx, cy, maxR);
    var vColor = CanvasUtils.scaleHexColor(palette.fogColor, 0.40);
    grad.addColorStop(0, CanvasUtils.hexToRgba(vColor, 0));
    grad.addColorStop(1, CanvasUtils.hexToRgba(vColor, 0.22));
    ctx.save();
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  };

  // O primeiro plano é estático: só a cor (horário) e o tamanho (resize)
  // mudam. Rasterizado UMA vez fora de tela; o quadro só faz drawImage com o
  // deslocamento de parallax, então o blur - a parte cara - não roda por
  // frame.
  Background.prototype._foregroundSprite = function (palette) {
    var key = Math.round(palette.ambient * 40) + ':' + palette.fogColor + ':' + this._width + 'x' + this._height;
    if (this._fgSprite && this._fgSpriteKey === key) return this._fgSprite;
    if (!this._foregroundPolys || !this._width) return null;

    var refUnit = Math.min(this._width, this._height);
    var pad = 40;
    var cv = this._fgSprite || document.createElement('canvas');
    cv.width = this._width + pad * 2;
    cv.height = this._height + pad * 2;
    var c = cv.getContext('2d');
    c.clearRect(0, 0, cv.width, cv.height);
    c.save();
    c.translate(pad, pad);
    if ('filter' in c) c.filter = 'blur(' + CanvasUtils.clamp(refUnit * FOREGROUND_DEF.blurUnit, 3, 14) + 'px)';
    c.fillStyle = CanvasUtils.lerpHexColor(
      CanvasUtils.scaleHexColor('#1c2418', palette.ambient * FOREGROUND_DEF.darkness + FOREGROUND_DEF.floor),
      palette.fogColor,
      0.16
    );
    this._foregroundPolys.forEach(function (points) {
      c.beginPath();
      c.moveTo(points[0].x, points[0].y);
      for (var i = 1; i < points.length; i++) c.lineTo(points[i].x, points[i].y);
      c.closePath();
      c.fill();
    });
    c.restore();

    this._fgSprite = cv;
    this._fgSpriteKey = key;
    this._fgSpritePad = pad;
    return cv;
  };

  Background.prototype._drawForeground = function (ctx, camera, palette) {
    var sprite = this._foregroundSprite(palette);
    if (!sprite) return;
    var parallax = camera ? camera.parallaxFor(FOREGROUND_DEF.depth) : { x: 0, y: 0 };
    var pad = this._fgSpritePad;
    ctx.drawImage(sprite, -pad + parallax.x * 1.6, -pad + parallax.y * 0.5);
  };

  PMV.Themes.Acampamento.Background = Background;
})(window.PMV = window.PMV || {});
