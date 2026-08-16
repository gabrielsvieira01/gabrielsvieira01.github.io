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
  //   fogDensity - QUANTA névoa, contra a referência em js/engine/light.js.
  //               É chave separada de `fog` porque cor e quantidade não
  //               andam juntas: a bruma da alvorada é espessa e rosada, a
  //               do meio-dia é rala e azul. Enquanto isto não existia, a
  //               densidade era constante e o meio-dia usava a dose de um
  //               fim de tarde - o quadro inteiro abaixo da serra ficava
  //               atrás de um véu cinza.
  var TIME_KEYFRAMES = [
    { hour: 0,  sky: [[0, '#080f28'], [0.34, '#0d1836'], [0.62, '#132244'], [0.84, '#1b2c50'], [1, '#243459']],
      body: '#c9d8ff', bodyOpacityMul: 0.34, fog: '#16203c', fogDensity: 1.00, ambient: 0.12, key: '#8fb4ff', keyStrength: 0.13 },
    // A alvorada é a hora MAIS enevoada, e é de propósito: é a única em que
    // a névoa é o assunto do quadro em vez de ser distância.
    { hour: 5,  sky: [[0, '#1d2f5c'], [0.30, '#3a5279'], [0.58, '#6d7194'], [0.82, '#b98d8a'], [1, '#e0a87e']],
      body: '#ffd2ab', bodyOpacityMul: 0.55, fog: '#6a6c85', fogDensity: 1.15, ambient: 0.33, key: '#ffc39c', keyStrength: 0.26 },
    { hour: 8,  sky: [[0, '#3f86c8'], [0.30, '#63a4da'], [0.58, '#96c4e6'], [0.82, '#c2dcef'], [1, '#e2edf2']],
      body: '#fff6dd', bodyOpacityMul: 0.90, fog: '#b6d0e2', fogDensity: 0.78, ambient: 0.82, key: '#fff3d6', keyStrength: 0.42 },
    // Meio-dia é a hora mais LIMPA. O ar já queimou a bruma da manhã e o sol
    // a pino não deixa nada em meia-luz.
    { hour: 13, sky: [[0, '#2f78c4'], [0.30, '#559dd6'], [0.58, '#8fc2e6'], [0.82, '#bfdcee'], [1, '#e4eff5']],
      body: '#ffffff', bodyOpacityMul: 1.0,  fog: '#c1dbec', fogDensity: 0.58, ambient: 1.00, key: '#ffffff', keyStrength: 0.48 },
    { hour: 17, sky: [[0, '#3d7ab4'], [0.30, '#6e9bc2'], [0.58, '#a8adba'], [0.82, '#d8b493'], [1, '#f0cf9c']],
      body: '#ffe3b0', bodyOpacityMul: 0.92, fog: '#c6b39c', fogDensity: 0.76, ambient: 0.84, key: '#ffd79a', keyStrength: 0.46 },
    // Pôr do sol: o quente fica no TERÇO DE BAIXO do céu, junto do horizonte,
    // e o topo já puxa pro azul-noite. Laranja subindo até o topo do quadro
    // lê como filtro, não como fim de tarde.
    { hour: 19, sky: [[0, '#1e2551'], [0.30, '#3c3566'], [0.56, '#6e4269'], [0.80, '#c2645a'], [1, '#f0985a']],
      body: '#ffab6a', bodyOpacityMul: 0.68, fog: '#8a6672', fogDensity: 1.00, ambient: 0.42, key: '#ff9a5c', keyStrength: 0.40 },
    { hour: 21, sky: [[0, '#0d1433'], [0.32, '#141d42'], [0.60, '#20264e'], [0.84, '#32305a'], [1, '#4a3d5e']],
      body: '#c2b6ff', bodyOpacityMul: 0.42, fog: '#2a2f52', fogDensity: 1.00, ambient: 0.18, key: '#9d92ff', keyStrength: 0.17 },
    { hour: 24, sky: [[0, '#080f28'], [0.34, '#0d1836'], [0.62, '#132244'], [0.84, '#1b2c50'], [1, '#243459']],
      body: '#c9d8ff', bodyOpacityMul: 0.34, fog: '#16203c', fogDensity: 1.00, ambient: 0.12, key: '#8fb4ff', keyStrength: 0.13 }
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
      fogDensity: CanvasUtils.lerp(a.fogDensity, b.fogDensity, t),
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

  // A paleta é obrigatória: é dela que sai a densidade da névoa. Chamar sem
  // ela devolve a névoa da hora mais enevoada em qualquer horário, que é
  // exatamente o véu de meio-dia que isto veio consertar.
  function fogAmountForDepth(t, palette) {
    return Light.fogForDepth(t, palette);
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

  // As paletas de pedra, mato, conífera e folhosa saíram daqui: cada peça
  // ilustrada traz as próprias cores, e o `tone` por indivíduo continua
  // dando a variação que impedia a mata de ler como papel de parede. Manter
  // tabelas de cor aqui seria uma segunda opinião sobre a cor de uma árvore
  // que ninguém mais consulta.

  // ---- Serra ----
  // Montanha NÃO é a mesma curva do chão com mais amplitude: Catmull-Rom só
  // produz colina arredondada, e uma fileira de colinas azuis lê como duna,
  // não como serra. Deslocamento do ponto médio (midpoint displacement) com
  // rugosidade < 1 dá o perfil autossemelhante e ANGULOSO que o olho
  // reconhece como cordilheira - picos agudos, vales em V, e detalhe fino
  // encaixado dentro do detalhe grosso.
  //
  // Desfoque CURTO - essa parte segue valendo, e é dela que vem a silhueta.
  //
  // A cor base é outra história, e ela é um caso de bruma contada duas vezes.
  // A primeira versão usava azuis médios (#54708f) com blur largo, e ao
  // meio-dia a serra virava um borrão indistinguível do céu; a resposta foi
  // escurecer a base até #33506e. Só que a serra não estava clara demais - a
  // NÉVOA é que estava forte demais, porque a densidade dela era constante e
  // o meio-dia levava dose de fim de tarde. Escurecer a base consertou o
  // sintoma na camada errada: a partir dali a haze estava assada na cor E
  // aplicada de novo pelo modelo de luz, e as duas metades somavam um total
  // plausível só enquanto a segunda estivesse errada.
  //
  // Com a densidade consultando o horário (ver fogDensity, acima), sobrou a
  // metade assada sozinha - e sozinha ela é escura: ao meio-dia a serra
  // virava a massa mais pesada de um quadro de sol a pino. Estes valores
  // devolvem a base pra perto do instinto original, agora que existe névoa
  // de verdade pra desbotá-la.
  //
  // Isto quase não mexe na noite, e não por sorte: às 22h o `ambient` vale
  // 0.16 e esmaga qualquer base antes do resto da conta - o quadro noturno é
  // decidido pelo termo de névoa. Cor de base é alavanca de dia.
  //
  // O que continua valendo da lição antiga: perspectiva aérea faz o distante
  // DESBOTAR, não DESAPARECER. Se a serra não tem valor sobrando pra perder,
  // ela some - e é por isso que ela clareia até aqui e não além.
  var RIDGE_DEFS = {
    far:  { depth: 0.10, baseYf: 0.492, amplitudeUnit: 0.150, roughness: 0.56, subdiv: 6, blurUnit: 0.0045, color: '#4e6987', rim: 0.16 },
    near: { depth: 0.17, baseYf: 0.566, amplitudeUnit: 0.105, roughness: 0.52, subdiv: 6, blurUnit: 0.0028, color: '#3d5673', rim: 0.24 }
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

  // Mato e pedra: densidades por unidade de largura. O `t` de cada item é
  // sorteado UNIFORME, o que dá distribuição uniforme na TELA (porque y é
  // linear em t) - e não amontoada no horizonte.

  // O tufo é a TEXTURA do gramado: é ele que impede o chão de ler como
  // feltro liso.
  //
  // A densidade caiu de ~120 para ~65 quando a relva passou a ser ilustrada.
  // O número alto tinha sido calibrado para tufos de 3 a 6 riscos de 1px; a
  // relva desenhada tem 6 a 8 lâminas PREENCHIDAS e cobre muito mais chão
  // por peça. Mantendo a densidade antiga, o gramado virava mato fechado.
  var GRASS_DEF = {
    densityRange: [55, 78], minCount: 40, maxCount: 190,
    sizeUnitRange: [0.022, 0.050]   // tamanho antes da escala do plano
  };

  // Arbustos: a família que faltava entre o tufo (0.02 de refUnit) e a
  // árvore (0.38). Sem ela a mata encontrava o gramado por um degrau de
  // escala, e o olho lê degrau de escala como colagem.
  var BUSH_DEF = {
    density: 9, minCount: 5, maxCount: 22,
    heightUnitRange: [0.055, 0.105],
    // Nem no fundo (viram manchas) nem rente à câmera (viram parede): a
    // moita serve na meia distância, que é onde a clareira encontra a mata.
    tRange: [0.14, 0.62]
  };
  var PEBBLE_DEF = {
    densityRange: [8, 13], minCount: 6, maxCount: 30,
    sizeUnitRange: [0.010, 0.032]
  };

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

  // ---- Órbita do sol e da lua ----
  //
  // O corpo celeste ficava num ponto sorteado por sessão e só trocava de
  // DESENHO conforme a hora. Isso bastava enquanto ele era um adereço do
  // céu. A partir do momento em que ele anda, ele vira a fonte visível da
  // direção da luz - e a cena inteira passa a ter que concordar com onde ele
  // está, senão a mata acende do lado errado e o erro fica gritante
  // justamente porque agora há para onde olhar.
  //
  // Por isso `_lightDirX` deixou de sair da inclinação sorteada dos feixes e
  // passa a sair DAQUI. Eram dois sorteios independentes que não se falavam;
  // ninguém notava só porque o sol não saía do lugar.
  //
  // As janelas se cruzam de propósito. Às 5h30 o sol nasce à esquerda com a
  // lua ainda se pondo à direita: os dois nunca dividem o mesmo ponto, que
  // era o risco da dissolvência antiga - dois desenhos empilhados no mesmo
  // lugar não leem como transição, leem como erro de camada.
  var ORBIT = {
    sol: { nasce: 5.5,  poe: 20.0 },
    // A lua atravessa a meia-noite: 19h30 até 6h30 do dia seguinte.
    lua: { nasce: 19.5, poe: 30.5 },
    xNasce: 0.06, xPoe: 0.94,
    yApice: 0.10, yHorizonte: 0.52,
    // Fração da janela gasta nascendo e se pondo. 0.07 de 14h30 dá cerca de
    // uma hora de cada lado, que é a mesma dissolvência de antes.
    bordaFade: 0.07,
    // (0.5 - xf) -> tangente da inclinação da luz. Calibrado pra bater com o
    // alcance que os feixes já tinham (baseTiltDegRange, ±16°): com o corpo
    // rente à borda a luz deita ~16°, e a pino ela cai reta.
    espalhamentoLuz: 0.65
  };

  // Onde o corpo está, e com que força, numa hora dada. Devolve null quando
  // ele não está no céu.
  //
  // A força sai do MESMO `u` que a posição: era conta separada, e conta
  // separada é como as duas cópias do modelo de luz começaram. Assim um
  // corpo não tem como estar aceso fora da própria janela.
  function posicaoOrbital(janela, hora) {
    var vao = janela.poe - janela.nasce;
    var u = (hora - janela.nasce) / vao;
    // Testar a hora somada de 24 é o que faz a madrugada cair dentro da
    // janela da lua - senão ela sumiria justo quando é a única coisa no céu.
    if (u < 0 || u > 1) u = (hora + 24 - janela.nasce) / vao;
    if (u < 0 || u > 1) return null;

    var borda = ORBIT.bordaFade;
    return {
      xf: ORBIT.xNasce + (ORBIT.xPoe - ORBIT.xNasce) * u,
      yf: ORBIT.yHorizonte - (ORBIT.yHorizonte - ORBIT.yApice) * Math.sin(Math.PI * u),
      forca: CanvasUtils.clamp(u / borda, 0, 1) * CanvasUtils.clamp((1 - u) / borda, 0, 1)
    };
  }

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
      // O sol e a lua já não moram num ponto sorteado: a órbita decide onde
      // eles estão pela HORA (ver ORBIT). Os dois sorteios continuam sendo
      // CONSUMIDOS, e nesta posição exata - o rng é uma sequência, e pular
      // duas leituras empurraria todas as de baixo, reembaralhando poeira e
      // primeiro plano. É a mesma regra que manteve a cena idêntica entre
      // resizes quando o espelhamento por lado entrou: consuma igual mesmo
      // quando for descartar.
      _orbitaDescartada: [
        CanvasUtils.randRange(rng, 0.16, 0.84),
        CanvasUtils.randRange(rng, 0.10, 0.26)
      ],
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

  // ---- Ilustração do cenário ----
  //
  // Árvore, arbusto, pedra e relva deixaram de ser desenho procedural e
  // passaram a ser ARTE, compilada em Path2D por js/engine/svgPaths.js.
  //
  // O que sumiu junto foram ~200 linhas que geravam silhueta ponto a ponto:
  // o serrilhado da conífera, os lobos da folhosa, o blob da pedra. Elas
  // existiam porque não havia ilustração; existindo, manter as duas seria
  // manter duas respostas para "que forma tem um pinheiro".
  //
  // Cada família tem variantes, e a escolha é seedada - a mesma cena volta
  // igual, mas duas árvores vizinhas não são gêmeas.
  var SPRITES = {
    conifera: ['conifera1Larga', 'conifera2Magra', 'conifera3Inclinada', 'conifera4Falhada'],
    folhosa: ['folhosa1Copada', 'folhosa2Alta', 'folhosa3Aberta'],
    arbusto: ['arbusto1Largo', 'arbusto2Compacto', 'arbusto3Aberto'],
    pedra: ['pedra1Grande', 'pedra2Media', 'pedra3Chata', 'pedra4Alta'],
    relva: ['relva1Densa', 'relva2Alta', 'relva3Baixa', 'relva4Inclinada']
  };

  // Compilado sob demanda e guardado: o Path2D de cada forma é construído
  // uma vez na vida da aba, não por quadro nem por item.
  var _formasCache = {};
  function formasDe(nome) {
    if (_formasCache[nome] !== undefined) return _formasCache[nome];
    var markup = PMV.Assets && PMV.Assets.Cenario ? PMV.Assets.Cenario[nome] : null;
    _formasCache[nome] = markup ? PMV.Engine.SvgPaths.parse(markup, nome) : null;
    return _formasCache[nome];
  }

  // Onde começa o "primeiro plano" pro espelhamento por lado. Abaixo disso a
  // peça é pequena e distante, e a névoa já comeu o contraste entre a massa
  // de sombra e a de luz - virar a peça não muda nada em quadro.
  var PRIMEIRO_PLANO_T = 0.45;

  // Escolhe variante e devolve o que o desenho precisa: as formas, a escala
  // que leva a arte à altura pedida em pixels, e o espelhamento.
  //
  // `xf` (posição na largura, 0 a 1) e `t` decidem o espelhamento das peças
  // de primeiro plano. Toda a coleção foi desenhada com a luz vindo da
  // DIREITA - medi: em todas as vinte, o centro da massa `...-sombra` está à
  // esquerda do centro da `...-luz`. Então o desenho nativo já serve pra
  // metade esquerda da tela, e a metade direita é espelhada.
  //
  // O efeito é que as sombras do primeiro plano apontam pra FORA, e a luz
  // parece vir do meio do quadro - que é onde a fogueira está. A moldura de
  // plantas passa a concordar com o centro da cena em vez de brigar com ele.
  //
  // No fundo continua sorteado: lá a peça é pequena, a névoa comeu o
  // contraste entre as duas massas, e um padrão regular de espelhamento só
  // criaria simetria - que é o que se quer evitar numa mata.
  function escolherSprite(rng, familia, alturaPx, xf, t) {
    var lista = SPRITES[familia];
    var nome = lista[Math.floor(rng() * lista.length) % lista.length];
    // O sorteio acontece SEMPRE, mesmo quando o resultado é descartado: a
    // sequência do rng é a mesma pra qualquer decisão de espelhamento, e é
    // isso que mantém a cena idêntica entre dois resizes.
    var sorteado = rng() < 0.5 ? -1 : 1;
    var flip = sorteado;
    if (t !== undefined && t >= PRIMEIRO_PLANO_T) {
      flip = xf < 0.5 ? 1 : -1;
    }
    var f = formasDe(nome);
    var escala = f && f.caixa.altura ? alturaPx / f.caixa.altura : 0;
    return { sprite: nome, escala: escala, flip: flip };
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
      var escolha = escolherSprite(rng, broadleaf ? 'folhosa' : 'conifera', h, xf, t);
      // Árvore não nasce dentro d'água. O sorteio acontece do mesmo jeito
      // (o rng já foi consumido acima) - só a peça não entra na lista, então
      // a margem do lago some da mata sem desviar a sequência aleatória.
      if (this._lake && this._lake.contains(xf * width, t)) continue;
      items.push({
        t: t, x: xf * width, hw: halfW * (broadleaf ? 1.35 : 1.0),
        sprite: escolha.sprite, escala: escolha.escala, flip: escolha.flip,
        height: h,
        // Escurecimento próprio: uma mata em que toda árvore tem o mesmo
        // valor lê como papel de parede.
        tone: CanvasUtils.randRange(rng, 0.84, 1.14)
      });
    }

    // --- arbustos ---
    // Família nova: a ilustração trouxe moitas, e elas resolvem um buraco
    // real de escala. Entre o tufo de relva (40 unidades) e a árvore (300)
    // não havia nada, e a mata encontrava o gramado por um degrau.
    rng = CanvasUtils.mulberry32((layout.trees.seed ^ 0x9e37) >>> 0);
    var bushCount = densityCount(BUSH_DEF.density, width, refUnit, BUSH_DEF.minCount, BUSH_DEF.maxCount);
    for (i = 0; i < bushCount; i++) {
      var bt = CanvasUtils.randRange(rng, BUSH_DEF.tRange[0], BUSH_DEF.tRange[1]);
      var bx = CanvasUtils.randRange(rng, -0.03, 1.03) * width;
      var bh = CanvasUtils.randRange(rng, BUSH_DEF.heightUnitRange[0], BUSH_DEF.heightUnitRange[1]) *
               refUnit * plane.rawScaleAt(bt);
      var bEscolha = escolherSprite(rng, 'arbusto', bh, bx / width, bt);
      var bTom = CanvasUtils.randRange(rng, 0.86, 1.12);
      if (this._lake && this._lake.contains(bx, bt)) continue;
      items.push({
        t: bt, x: bx, hw: bh * 0.7,
        sprite: bEscolha.sprite, escala: bEscolha.escala, flip: bEscolha.flip,
        height: bh, tone: bTom
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
      var pEscolha = escolherSprite(rng, 'pedra', pr * 1.6);
      var pebble = {
        t: pt, x: px, hw: pr,
        sprite: pEscolha.sprite, escala: pEscolha.escala, flip: pEscolha.flip,
        tone: CanvasUtils.randRange(rng, 0.88, 1.10)
      };
      if (!(this._lake && this._lake.contains(px, pt))) items.push(pebble);
    }

    // --- mato baixo ---
    rng = CanvasUtils.mulberry32(layout.grass.seed);
    var grassCount = densityCount(layout.grass.density, width, refUnit, GRASS_DEF.minCount, GRASS_DEF.maxCount);
    for (i = 0; i < grassCount; i++) {
      var gt = CanvasUtils.randRange(rng, 0.02, 1.0);
      var size = CanvasUtils.randRange(rng, GRASS_DEF.sizeUnitRange[0], GRASS_DEF.sizeUnitRange[1]) * refUnit * plane.rawScaleAt(gt);
      // O x vem ANTES da escolha do sprite: é ele que decide o espelhamento
      // das peças de primeiro plano.
      var gx = CanvasUtils.randRange(rng, -0.03, 1.03) * width;
      var gEscolha = escolherSprite(rng, 'relva', size, gx / width, gt);
      var tuft = {
        t: gt, x: gx, hw: size * 0.5,
        sprite: gEscolha.sprite, escala: gEscolha.escala, flip: gEscolha.flip,
        tone: CanvasUtils.randRange(rng, 0.84, 1.14)
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
    // Um valor inicial pra quem desenhar antes do primeiro quadro; a partir
    // daí quem manda é `draw`, porque a direção da luz mudou de natureza:
    // era sorteio de sessão, virou consequência de onde o sol está.
    this._lightDirX = this._lightDirXAgora();
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
  //
  // ---- POR QUE O CHÃO NÃO USA ISTO ----
  //
  // Quem lê `pointLight` são as PEÇAS e o espalhado - coisas discretas, que
  // sombreiam forma a forma. O chão recebe luz por outro caminho: uma poça
  // pintada em `_drawFireGlow` / `_drawLampGlow`, com centro, raio e
  // achatamento próprios.
  //
  // Isso PARECE duplicação, e já foi tratado como tal: as duas contas foram
  // unificadas, o chão passou a ser um desenho exato deste campo, e o
  // resultado foi pior - o chão inundou e as peças viraram silhuetas escuras
  // sobre ele. A unificação foi desfeita.
  //
  // O motivo é que os dois NÃO respondem à mesma pergunta, e a diferença
  // está no eixo Y. Este campo é uma elipse em espaço de TELA, e `reachY`
  // (= reachX/1.7) foi calibrado como queda por ALTURA: o fogo está no chão,
  // a luz vem de baixo e lambe a base das coisas, então o ápice de uma
  // barraca recebe bem menos que o pé dela.
  //
  // Só que no CHÃO deslocamento vertical em tela não é altura, é
  // PROFUNDIDADE - pelo plano, y = H(x) + (rodapé - H(x)) · t. Cem pixels
  // abaixo do horizonte são centenas de metros; cem pixels rente à câmera
  // são poucos passos. Aplicar a queda-por-altura sobre essa distância
  // espalha a luz por uma área enorme da clareira.
  //
  // Uma elipse em tela não descreve as duas grandezas ao mesmo tempo. Fazer
  // o chão ler o campo do objeto exigiria primeiro converter Y em distância
  // pelo plano (depthAtY existe e é exato) - e isso é modelo novo, não
  // conserto. Enquanto não for feito, os dois caminhos são separados DE
  // PROPÓSITO, e a divergência entre eles é o preço conhecido.
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
  // Devolve também DE ONDE a luz vem: `sx`,`sy` são a posição das fontes
  // ponderada pelo quanto cada uma contribui naquele ponto. É o que permite
  // a uma superfície saber se está virada pra luz ou de costas pra ela.
  //
  // Ponderar, e não escolher a fonte mais forte, é o mesmo raciocínio da
  // direção da luz-chave: entre o fogo e um lampião, a normal varre
  // suavemente de um pro outro em vez de saltar quando a dominância troca.
  Background.prototype.localLightAt = function (x, y) {
    var amount = this.fireLightAt(x, y);
    var f = this.fire;
    var lamps = this._lamps;
    if (!lamps || !lamps.length) {
      return { amount: amount, color: FIRE_LIGHT_COLOR, sx: f.x, sy: f.y };
    }
    var night = nightFactor(this.currentPalette());

    var r = 0, g = 0, b = 0, total = 0, px = 0, py = 0;
    for (var i = 0; i < lamps.length; i++) {
      var a = pointLight(lamps[i], x, y, night);
      if (a <= 0.002) continue;
      var c = lamps[i].rgb;
      r += c.r * a; g += c.g * a; b += c.b * a;
      px += lamps[i].x * a; py += lamps[i].y * a;
      total += a;
    }
    // Nenhuma luminária alcança aqui: a resposta é a do fogo, sem mistura.
    if (total <= 0.002) return { amount: amount, color: FIRE_LIGHT_COLOR, sx: f.x, sy: f.y };

    if (amount > 0) {
      r += FIRE_RGB.r * amount; g += FIRE_RGB.g * amount; b += FIRE_RGB.b * amount;
      px += f.x * amount; py += f.y * amount;
      total += amount;
    }
    return {
      amount: Math.min(total, FIRE_MAX_ADD),
      color: rgbToHexLocal(r / total, g / total, b / total),
      sx: px / total, sy: py / total
    };
  };

  // Profundidade no plano de um ponto de tela. A fonte de luz é dada em
  // pixels; a face de um objeto precisa saber se a luz está À FRENTE ou
  // ATRÁS dele, e isso é profundidade, não altura.
  Background.prototype.depthAtPoint = function (x, y) {
    return this.depthAtY(x, y);
  };

  // ---- Sombra projetada no chão ----
  //
  // A geometria aqui é mais simples do que parece, e o motivo vale escrever:
  // a sombra vai do PONTO DE CONTATO do oclusor, na direção oposta ao PONTO
  // DE CONTATO da fonte. Os dois pontos estão sobre o plano, e entre dois
  // pontos do plano a direção em espaço de tela JÁ É a direção no chão - a
  // perspectiva está embutida no mapeamento do plano. Só faria falta o
  // cálculo em (x, profundidade) se um dos dois estivesse no ar.
  //
  // Comprimento cresce com a altura do oclusor, com teto no alcance da
  // própria fonte: sombra que passa de onde a luz chega não descreve nada,
  // porque ali já não há brilho pra subtrair.
  var SOMBRA_POR_ALTURA = 2.6;   // quanto de sombra cada pixel de altura dá
  var SOMBRA_ESPALHA = 1.55;     // quanto a sombra alarga na ponta
  var SOMBRA_BORRAO = 0.055;     // desfoque da borda, em fração do alcance

  // Achatamento do plano visto quase de lado: um passo AFASTANDO-SE da
  // câmera anda muito menos pixels na vertical do que um passo pro lado anda
  // na horizontal. É a mesma constante da poça no chão, e ela aparece duas
  // vezes aqui - na pegada do oclusor e no teste de "luz por dentro".
  var ACHATAMENTO_DO_CHAO = 0.34;

  function quadDeSombra(srcX, srcY, occ, alcance) {
    if (occ.halfWidth <= 0 || occ.altura <= 0) return null;

    var dx = occ.x - srcX, dy = occ.groundY - srcY;

    // Luz DENTRO do oclusor não é bloqueada por ele - é o caso da chama
    // dentro da roda de pedras. O teste é ELÍPTICO, não só em X: com a
    // comparação horizontal sozinha, qualquer peça larga que cruzasse a
    // vertical do fogo era descartada mesmo estando passos atrás ou à frente
    // dele. Era assim que o varal, a barraca e a pilha de lenha deixavam de
    // projetar sombra alguma.
    var ry = occ.halfWidth * ACHATAMENTO_DO_CHAO;
    if ((dx * dx) / (occ.halfWidth * occ.halfWidth) + (dy * dy) / (ry * ry) < 1) return null;

    var d = Math.sqrt(dx * dx + dy * dy);
    if (d < 1) return null;
    var ux = dx / d, uy = dy / d;
    var comp = Math.min(occ.altura * SOMBRA_POR_ALTURA, alcance * 1.4);
    if (comp < 2) return null;

    // A largura da sombra é a pegada do oclusor MEDIDA PERPENDICULARMENTE à
    // luz - e a pegada é uma elipse no chão, não um segmento em X.
    //
    // Usar sempre a extensão horizontal era o bug do "tronco deitado com
    // sombra em pé": com o fogo ao lado, a perpendicular fica vertical, e a
    // largura de 200 px do tronco era desenhada ao longo do eixo Y da tela.
    // Em pixels de tela, a mesma distância no chão vale ACHATAMENTO_DO_CHAO
    // quando medida na vertical.
    var px = -uy, py = ux;
    var hw = occ.halfWidth *
             Math.sqrt(px * px + (py * ACHATAMENTO_DO_CHAO) * (py * ACHATAMENTO_DO_CHAO));
    if (hw < 1) return null;
    var hwLonge = hw * SOMBRA_ESPALHA;
    var fx = occ.x + ux * comp, fy = occ.groundY + uy * comp;
    return [
      occ.x + px * hw, occ.groundY + py * hw,
      occ.x - px * hw, occ.groundY - py * hw,
      fx - px * hwLonge, fy - py * hwLonge,
      fx + px * hwLonge, fy + py * hwLonge
    ];
  }

  // Desenha um brilho e SUBTRAI dele as sombras dos oclusores.
  //
  // Subtrair, e não pintar escuro por cima do chão: o brilho é aditivo e vem
  // depois do terreno, então escurecer o chão antes seria desfeito pelo
  // próprio brilho no passo seguinte. A sombra é ausência de luz, e é assim
  // que ela é construída aqui.
  //
  // Vai num canvas fora de tela porque a borda precisa ser MACIA. Um clip
  // recorta com borda dura, e borda dura de sombra lê como mancha de tinta -
  // é o mesmo erro da coluna de luz do recife. Com `destination-out` e um
  // filtro de desfoque, a sombra come o brilho com a borda certa.
  Background.prototype._brilhoComSombra = function (ctx, width, height, alcance, srcX, srcY, desenhar) {
    var occ = this._occluders || [];
    var quads = [];
    for (var i = 0; i < occ.length; i++) {
      var q = quadDeSombra(srcX, srcY, occ[i], alcance);
      if (q) quads.push(q);
    }
    if (!quads.length) { desenhar(ctx); return; }

    var buf = this._bufSombra;
    if (!buf || buf.width !== width || buf.height !== height) {
      buf = this._bufSombra = document.createElement('canvas');
      buf.width = width; buf.height = height;
      this._bufSombraCtx = buf.getContext('2d');
    }
    var b = this._bufSombraCtx;
    b.setTransform(1, 0, 0, 1, 0, 0);
    b.clearRect(0, 0, width, height);
    b.globalCompositeOperation = 'source-over';
    desenhar(b);

    b.globalCompositeOperation = 'destination-out';
    if ('filter' in b) b.filter = 'blur(' + Math.max(2, alcance * SOMBRA_BORRAO) + 'px)';
    b.fillStyle = '#000';
    b.beginPath();
    for (var k = 0; k < quads.length; k++) {
      var q = quads[k];
      b.moveTo(q[0], q[1]);
      b.lineTo(q[2], q[3]);
      b.lineTo(q[4], q[5]);
      b.lineTo(q[6], q[7]);
      b.closePath();
    }
    b.fill();
    if ('filter' in b) b.filter = 'none';
    b.globalCompositeOperation = 'source-over';

    ctx.drawImage(buf, 0, 0);
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

    // Por QUADRO, não por resize: a direção da luz agora depende da hora,
    // porque depende de onde o sol está. Fica aqui, antes de qualquer
    // desenho, pra que serra, mata e feixes leiam todos o mesmo valor no
    // mesmo quadro - se cada um recalculasse por conta, voltaríamos a ter
    // várias opiniões sobre onde está o sol.
    this._lightDirX = this._lightDirXAgora();

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

    // A luz da fogueira entra DEPOIS de todo o terreno: ela ilumina o chão
    // que já existe, em vez de virar mais uma camada de cenário.
    //
    // E entra AQUI, no canvas de fundo, antes de qualquer espalhado. Antes o
    // espalhado de trás vinha primeiro e levava o brilho pintado por cima -
    // mas ele já recebe a luz local no próprio sombreamento, via
    // localLightAt. Era luz contada duas vezes; a pilha desfez isso sozinha,
    // porque agora o espalhado mora em outra camada.
    this._drawFireGlow(ctx, width, height, palette);
    this._drawLampGlow(ctx, palette);

    this._drawHorizonHaze(ctx, width, height, palette);
  };

  // O espalhado de UMA faixa. Vai no canvas que fica logo abaixo do SVG
  // daquela faixa, e é isso que dá a terceira gaveta.
  Background.prototype.drawBand = function (ctx, camera, width, height, faixa) {
    this._drawScatter(ctx, camera, this.currentPalette(), faixa);
  };

  // O canvas de primeiro plano fica POR CIMA da pilha inteira: é o que está
  // entre a câmera e a clareira.
  //
  // A atmosfera (brasas, poeira e vinheta) subiu pra cá junto com a moita.
  // Ela estava no canvas de fundo, ou seja, DEBAIXO do acampamento - a
  // vinheta escurecia o chão nas bordas e não tocava numa peça posta ali. É
  // atmosfera entre a câmera e a cena; ela vale pra tudo que está em quadro.
  Background.prototype.drawForeground = function (ctx, camera, width, height) {
    var palette = this.currentPalette();
    this._drawForeground(ctx, camera, palette);
    this._drawEmbers(ctx, palette);
    this._drawDustTier(ctx, 'front', palette);
    this._drawVignette(ctx, width || this._width, height || this._height, palette);
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

  // Sol e lua, cada um na própria posição da órbita (ver ORBIT).
  //
  // A lição que sobrevive de duas versões atrás, e que continua sendo a
  // razão de a janela ser em HORA e não em `ambient`: às 5h o ambiente vale
  // 0.33 e às 19h vale 0.42 - quase o mesmo -, mas numa o sol nasce e na
  // outra se põe. Decidir pelo ambiente fazia a alvorada mostrar sol e lua
  // somados no mesmo ponto, e dois desenhos empilhados não leem como corpo
  // em transição, leem como erro de camada.
  //
  // Agora a hora resolve as duas coisas de uma vez: ela diz a força E o
  // lugar, e na virada os dois estão em bordas opostas do quadro. O que era
  // uma sobreposição a ser evitada virou uma leitura - o sol nascendo de um
  // lado enquanto a lua se põe do outro.
  //
  // O corpo é desenhado ANTES das serras de propósito: é o que o faz se pôr
  // atrás da montanha sem nenhum recorte.
  Background.prototype._drawCelestialBody = function (ctx, width, height, palette) {
    var refUnit = Math.min(width, height);
    var r = refUnit * (0.030 + 0.026 * palette.ambient);
    var ceu = this._corposNoCeu();

    ctx.save();
    // A lua primeiro: nas horas em que os dois aparecem, o sol é quem manda
    // no quadro e fica por cima.
    this._desenharCorpoNoCeu(ctx, width, height, palette, 'lua', ceu.lua, r * 1.9);
    this._desenharCorpoNoCeu(ctx, width, height, palette, 'sol', ceu.sol, r * 2.0);
    ctx.restore();
  };

  // Onde cada corpo está agora. Um só lugar responde isso, e tanto o desenho
  // quanto a direção da luz bebem daqui - se fossem duas contas, elas
  // divergiriam, e o sol acabaria num canto com a luz vindo de outro.
  Background.prototype._corposNoCeu = function () {
    var hora = this._resolveHourFraction();
    return {
      sol: posicaoOrbital(ORBIT.sol, hora),
      lua: posicaoOrbital(ORBIT.lua, hora)
    };
  };

  // A inclinação horizontal da luz-chave, tirada de onde os corpos estão.
  //
  // Pesada pela força dos dois, e não "o mais forte manda": na virada o sol
  // está numa borda e a lua na outra, então escolher um deles faria a luz
  // saltar de um lado pro outro num quadro. Pesando, ela varre o meio e
  // passa por zero - luz reta, sem direção, que é exatamente o que a meia-luz
  // do crepúsculo é.
  Background.prototype._lightDirXAgora = function () {
    var ceu = this._corposNoCeu();
    var fSol = ceu.sol ? ceu.sol.forca : 0;
    var fLua = ceu.lua ? ceu.lua.forca : 0;
    var total = fSol + fLua;
    if (total < 0.001) return 0;
    var xf = ((ceu.sol ? ceu.sol.xf * fSol : 0) + (ceu.lua ? ceu.lua.xf * fLua : 0)) / total;
    return (0.5 - xf) * ORBIT.espalhamentoLuz;
  };

  Background.prototype._desenharCorpoNoCeu = function (ctx, width, height, palette, nome, pos, raio) {
    if (!pos || pos.forca <= 0.01) return;
    var cx = pos.xf * width;
    var cy = pos.yf * height;
    var forca = pos.forca;

    ctx.save();
    // Halo largo cobrindo a tela toda - um fillRect estreito com gradiente
    // deixa a borda dura visível (foi o bug da coluna de luz do recife).
    var halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(width, height) * 0.55);
    var pico = 0.20 * palette.bodyOpacityMul * forca;
    halo.addColorStop(0, CanvasUtils.hexToRgba(palette.bodyColor, pico));
    halo.addColorStop(0.28, CanvasUtils.hexToRgba(palette.bodyColor, pico * 0.35));
    halo.addColorStop(1, CanvasUtils.hexToRgba(palette.bodyColor, 0));
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, width, height);

    desenharCorpo(ctx, nome, cx, cy, raio, forca, palette);
    ctx.restore();
  };

  function desenharCorpo(ctx, nome, cx, cy, raio, forca, palette) {
    if (forca <= 0.01) return;
    var f = formasDe(nome);
    if (!f || !f.caixa.altura) return;
    var escala = (raio * 2) / f.caixa.altura;

    ctx.save();
    ctx.globalAlpha = forca;
    ctx.translate(cx, cy);
    ctx.scale(escala, escala);
    for (var i = 0; i < f.formas.length; i++) {
      var forma = f.formas[i];
      // O corpo celeste é EMISSOR: não passa pelo sombreamento nem pela
      // névoa. O que ele faz é tomar a cor da hora - é a mesma luz que
      // pinta o céu, e um sol branco num céu de pôr do sol lê como furo.
      ctx.fillStyle = CanvasUtils.lerpHexColor(forma.base, palette.bodyColor, 0.55);
      ctx.fill(forma.caminho);
    }
    ctx.restore();
  }

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
      maxAlpha: def.rim * (1 - fogAmountForDepth(def.depth, palette)),
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

    // Os feixes eram inclinados por um ângulo sorteado na sessão, e o sol
    // ficava onde outro sorteio mandasse - dois valores independentes que
    // por acaso nunca se contradiziam, porque nada se movia. Com o sol
    // andando, feixe apontando pra um lado e sol no outro é a primeira coisa
    // que o olho pega.
    //
    // Cada feixe guarda a variação PRÓPRIA em relação à base antiga; o que
    // muda aqui é a âncora, que passa a ser o sol. Assim a dispersão entre
    // feixes continua a mesma e nenhum rng novo é lido - a cena sobrevive ao
    // resize igual.
    var ancoraAntiga = this._layout.shafts.baseTiltDeg;
    var ancoraNova = Math.atan(this._lightDirX) * 180 / Math.PI;

    ctx.save();
    var parallax = camera ? camera.parallaxFor(0.10) : { x: 0, y: 0 };
    ctx.translate(parallax.x * 0.25, 0);

    this._shafts.forEach(function (shaft) {
      var sway = Math.sin(self._time * shaft.swaySpeed + shaft.phase) * refUnit * 0.014;
      var topX = shaft.xf * width + sway;
      var len = height * shaft.lengthFrac;
      var tilt = shaft.tiltDeg - ancoraAntiga + ancoraNova;
      var bottomX = topX + Math.tan(tilt * Math.PI / 180) * len;
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
      maxAlpha: 0.10 * (1 - fogAmountForDepth(0.1, palette))
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

  // Roteia cada item do espalhado pra uma FAIXA da pilha.
  //
  // Isto era binário e é a pendência que mais incomodava. A camada da frente
  // era um canvas por cima do SVG INTEIRO - não por cima de uma peça -, então
  // entre "atrás de tudo" e "na frente de tudo" não havia terceira gaveta.
  // Um tufo que cruzava a barraca do fundo, se promovido, passava a cobrir
  // também a rede que está vários passos à frente dele. A regra vigente
  // ("só sobe quem está na frente de TUDO que cruza") era uma defesa contra
  // isso, não uma descrição da cena: ela errava pra trás de propósito.
  //
  // Agora a cena tem uma pilha alternada de faixas, e o item simplesmente
  // vai pra faixa da própria profundidade. A pergunta "na frente de quem?"
  // deixou de existir - cada tufo é desenhado entre as peças que de fato
  // estão atrás e na frente dele. O erro residual é a LARGURA da faixa, não
  // mais a cena inteira, e ele encolhe aumentando o número de faixas.
  Background.prototype._partitionScatter = function () {
    var list = this._scatter;
    if (!list || !this._bands) return;
    var bands = this._bands;
    for (var i = 0; i < list.length; i++) {
      var it = list[i];
      it.band = 0;
      for (var k = 0; k < bands.length; k++) {
        if (it.t >= bands[k].de && it.t < bands[k].ate) { it.band = k; break; }
        if (k === bands.length - 1) it.band = k;
      }
    }
  };

  // O tema publica as faixas aqui: quem sabe a geometria do espalhado é o
  // background, e quem sabe em quantas faixas a cena foi fatiada é a pilha.
  Background.prototype.setBands = function (bands) {
    this._bands = bands;
    this._partitionScatter();
  };

  // Um laço só, do fundo pra frente. Árvore, pedra e mato dividem a mesma
  // lista ordenada por `t`, então a oclusão entre eles sai de graça.
  Background.prototype._drawScatter = function (ctx, camera, palette, faixa) {
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
      if (it.band !== faixa) continue;
      var f = parallaxFactor(it.t);
      var x = it.x + camX * f;
      var y = plane.yAtT(it.x, it.t) + camY * f * 0.3;
      var luz = self.localLightAt(x, y);
      drawSprite(ctx, it, x, y, palette, luz);
    }

    ctx.globalAlpha = 1;
    ctx.restore();
  };

  // Desenha uma peça ilustrada do cenário.
  //
  // Uma passada por forma, e a cor de cada uma sai do MESMO modelo de luz que
  // o chão usa (Light.shade, via shadeTerrain). Três termos por forma:
  //
  //   tom      - escurecimento próprio do indivíduo, pra que uma mata não
  //              seja papel de parede de árvores idênticas;
  //   luz-chave - só nas massas nomeadas "...-luz", que são as faces viradas
  //              pra luz. É o que faz a mata inteira concordar com a direção
  //              do sol em vez de cada árvore ter volume inventado;
  //   luz local - fogueira e luminárias, com peso por grupo: o tronco leva
  //              0.9 e a copa 0.35, porque o fogo está no chão e decai rápido
  //              na vertical.
  function drawSprite(ctx, it, x, y, palette, luz) {
    var f = formasDe(it.sprite);
    if (!f || !it.escala) return;

    var nevoa = fogAmountForDepth(it.t, palette);
    var chave = palette.keyStrength * 0.16 * (1 - nevoa);

    ctx.save();
    ctx.translate(x, y);
    ctx.scale(it.escala * it.flip, it.escala);

    for (var i = 0; i < f.formas.length; i++) {
      var forma = f.formas[i];
      // A luz local vai DENTRO de Light.shade, com o peso da forma - não
      // somada por fora depois.
      //
      // Este trecho somava a luz local por conta própria, depois de o
      // sombreamento já ter terminado. Era o mesmo termo aditivo que fazia
      // cores diferentes convergirem, e ele sobreviveu à correção do modelo
      // justamente por estar FORA dele: o acampamento passou a receber a luz
      // como iluminação e o mato continuou recebendo como tinta laranja por
      // cima. Cenário e peças de novo com dois modelos, que é o erro que a
      // seção 5 do documento existe pra impedir.
      //
      // A luz-chave (direcional, do sol) continua somada aqui: ela é outro
      // fenômeno, e só as faces nomeadas "-luz" a recebem.
      var cor = Light.shade(
        CanvasUtils.scaleHexColor(forma.base, it.tone),
        palette, it.t, luz, forma.peso
      );
      if (forma.iluminada && chave > 0.002) {
        cor = CanvasUtils.addHexLight(cor, palette.keyColor, chave);
      }
      ctx.fillStyle = cor;
      ctx.fill(forma.caminho);
    }
    ctx.restore();
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
  // A poça no chão. Geometria PRÓPRIA, e isso é deliberado - ver o comentário
  // longo em fireLightAt: o achatamento 0.34 daqui é a perspectiva do plano
  // vista de quase de lado, não a queda por altura que o campo dos objetos
  // usa. Já foram unificados uma vez, e a cena piorou.
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

    // A poça no chão é o que as peças bloqueiam. O halo no ar, logo abaixo,
    // não: é fumaça acesa ACIMA do fogo, e nada em cena está entre ela e a
    // câmera pra fazer sombra nela.
    this._brilhoComSombra(ctx, width, height, reach, f.x, f.y, function (alvo) {
      alvo.save();
      alvo.translate(f.x, f.y);
      alvo.scale(1, 0.34);
      var pool = alvo.createRadialGradient(0, 0, 0, 0, 0, reach);
      pool.addColorStop(0, CanvasUtils.hexToRgba(FIRE_LIGHT_COLOR, 0.50 * strength));
      pool.addColorStop(0.35, CanvasUtils.hexToRgba(FIRE_LIGHT_COLOR, 0.20 * strength));
      pool.addColorStop(1, CanvasUtils.hexToRgba(FIRE_LIGHT_COLOR, 0));
      alvo.fillStyle = pool;
      alvo.beginPath();
      alvo.arc(0, 0, reach, 0, Math.PI * 2);
      alvo.fill();
      alvo.restore();
    });

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
  // chão visto quase de lado - poça redonda lê como bola flutuando. E é
  // centrada no CHÃO, não na lâmpada: é a marca que a luz deixa na
  // superfície, não a lâmpada vista de perto.
  //
  // Sim, isto diverge do campo que as peças leem, e sim, isso é medível -
  // o poste recebe mais luz que o chão logo atrás dele. Ver fireLightAt
  // para por que a resposta NÃO é unificar os dois.
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
      // Cada luminária é sombreada pelos SEUS próprios oclusores: a barraca
      // que corta a luz do lampião não corta a da fogueira do outro lado.
      this._brilhoComSombra(ctx, this._width, this._height, raio, l.x, l.groundY,
        function (alvo) {
          alvo.save();
          alvo.translate(l.x, l.groundY);
          alvo.scale(1, 0.30);
          var poca = alvo.createRadialGradient(0, 0, 0, 0, 0, raio);
          poca.addColorStop(0, CanvasUtils.hexToRgba(l.color, 0.30 * forca));
          poca.addColorStop(0.4, CanvasUtils.hexToRgba(l.color, 0.10 * forca));
          poca.addColorStop(1, CanvasUtils.hexToRgba(l.color, 0));
          alvo.fillStyle = poca;
          alvo.beginPath();
          alvo.arc(0, 0, raio, 0, Math.PI * 2);
          alvo.fill();
          alvo.restore();
        });
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
