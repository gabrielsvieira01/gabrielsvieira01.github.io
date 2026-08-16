(function (PMV) {
  'use strict';

  PMV.World = PMV.World || {};

  // Faixa de profundidade em que uma peça pode ser colocada. Fora dela não
  // existe peça, então não existe nada pra intercalar: o que está antes fica
  // sempre atrás do acampamento e o que está depois, sempre na frente.
  // Fatiar só o miolo é o que mantém a pilha em 6 camadas em vez de 20.
  var FAIXA_PECAS = [0.33, 0.72];

  function SceneManager() {
    this.stage = null;
    this.canvas = null;     // fundo: céu, serra, chão, lago, brilho local
    this.ctx = null;
    this.fgCanvas = null;   // primeiro plano oclusor + atmosfera
    this.fgCtx = null;
    // Uma faixa = um canvas de espalhado com o SVG de peças logo acima dele.
    // Do mais distante ao mais próximo.
    this.bands = [];
    this.theme = null;
    this.camera = null;
    this.rng = null;
    this.loop = null;
    this.progress = 0; // progresso de foco acumulado, nunca regride
    this._width = 0;
    this._height = 0;
    this._resizeBound = null;
  }

  // Monta a pilha alternada. A ORDEM NO DOCUMENTO é a ordem de empilhamento:
  // todas as camadas são position:fixed sobre a mesma área, sem z-index, e
  // quem vem depois desenha por cima. Trocar a ordem aqui é trocar a cena.
  SceneManager.prototype._montarPilha = function (stage, quantasFaixas) {
    var doc = stage.ownerDocument;
    function camada(tag, classe) {
      var el = tag === 'svg'
        ? doc.createElementNS('http://www.w3.org/2000/svg', 'svg')
        : doc.createElement(tag);
      el.setAttribute('class', classe);
      el.setAttribute('aria-hidden', 'true');
      stage.appendChild(el);
      return el;
    }

    this.canvas = camada('canvas', 'pmv-layer pmv-layer-bg');
    this.ctx = this.canvas.getContext('2d');

    var largura = (FAIXA_PECAS[1] - FAIXA_PECAS[0]) / quantasFaixas;
    this.bands = [];
    for (var i = 0; i < quantasFaixas; i++) {
      var cv = camada('canvas', 'pmv-layer pmv-layer-scatter');
      var sv = camada('svg', 'pmv-layer pmv-layer-svg');
      this.bands.push({
        canvas: cv,
        ctx: cv.getContext('2d'),
        svg: sv,
        // Meio aberto [de, ate): um item na fronteira cai numa faixa só.
        de: FAIXA_PECAS[0] + largura * i,
        ate: i === quantasFaixas - 1 ? Infinity : FAIXA_PECAS[0] + largura * (i + 1)
      });
    }
    // A primeira faixa recolhe tudo que vem antes dela.
    if (this.bands.length) this.bands[0].de = -Infinity;

    this.fgCanvas = camada('canvas', 'pmv-layer pmv-layer-fg');
    this.fgCtx = this.fgCanvas.getContext('2d');
  };

  SceneManager.prototype.init = function (opts) {
    this.stage = opts.stage;
    this._montarPilha(this.stage, Math.max(1, opts.bands || 4));
    this.rng = PMV.Engine.CanvasUtils.mulberry32(opts.seed || 1337);
    this.camera = new PMV.Camera.Camera({ rng: this.rng });
    this.progress = opts.initialProgress || 0;

    // Resize com debounce: cada evento reconstrói TODA a geometria e a
    // camada SVG dos organismos. Arrastar a borda de uma janela dispara
    // dezenas de eventos por segundo, e sem debounce isso reconstrói o
    // recife inteiro dezenas de vezes por segundo.
    this._resize();
    this._resizeBound = function () {
      clearTimeout(this._resizeTimer);
      this._resizeTimer = setTimeout(this._resize.bind(this), 150);
    }.bind(this);
    window.addEventListener('resize', this._resizeBound);

    // Aba escondida: um app de pomodoro passa os 25 minutos de foco
    // justamente numa aba de fundo. Manter o rAF girando ali é queimar
    // bateria pra desenhar o que ninguém está vendo.
    this._visibilityBound = function () {
      if (document.hidden) this.loop.stop();
      else if (this._wantRunning) this.loop.start();
    }.bind(this);
    document.addEventListener('visibilitychange', this._visibilityBound);

    this.loop = new PMV.Engine.Loop({ fps: opts.fps || 30 });
    this.loop.onTick(this._tick.bind(this));
  };

  // Solta os listeners globais - sem isto, uma cena descartada continua
  // presa na memória pelo window/document.
  SceneManager.prototype.destroy = function () {
    this.stop();
    clearTimeout(this._resizeTimer);
    window.removeEventListener('resize', this._resizeBound);
    document.removeEventListener('visibilitychange', this._visibilityBound);
  };

  SceneManager.prototype.setTheme = function (themeModule) {
    this.theme = themeModule;
    this.theme.init({
      bands: this.bands,
      rng: this.rng,
      width: this._width,
      height: this._height
    });
    this.theme.setProgress(this.progress);
  };

  SceneManager.prototype.start = function () {
    this._wantRunning = true;
    if (!document.hidden) this.loop.start();
  };

  SceneManager.prototype.stop = function () {
    this._wantRunning = false;
    this.loop.stop();
  };

  SceneManager.prototype._resize = function () {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = window.innerWidth;
    var h = window.innerHeight;
    this._width = w;
    this._height = h;
    sizeCanvas(this.canvas, this.ctx, w, h, dpr);
    for (var i = 0; i < this.bands.length; i++) {
      sizeCanvas(this.bands[i].canvas, this.bands[i].ctx, w, h, dpr);
      this.bands[i].svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
    }
    if (this.fgCanvas) sizeCanvas(this.fgCanvas, this.fgCtx, w, h, dpr);
    if (this.theme && this.theme.resize) this.theme.resize(w, h);
  };

  function sizeCanvas(canvas, ctx, w, h, dpr) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  SceneManager.prototype._tick = function (dt) {
    this.camera.update(dt);
    if (this.theme && this.theme.update) {
      this.theme.update(dt, this.camera);
    }
    this.ctx.clearRect(0, 0, this._width, this._height);
    if (this.theme && this.theme.drawCanvas) {
      this.theme.drawCanvas(this.ctx, this.camera, this._width, this._height);
    }

    // O espalhado de cada faixa, no canvas que fica logo ABAIXO do SVG
    // daquela faixa. É isto que dá a terceira gaveta: um tufo pode ficar na
    // frente da barraca do fundo e atrás da rede da frente.
    for (var i = 0; i < this.bands.length; i++) {
      var b = this.bands[i];
      b.ctx.clearRect(0, 0, this._width, this._height);
      if (this.theme && this.theme.drawBand) {
        this.theme.drawBand(b.ctx, this.camera, this._width, this._height, i);
      }
    }

    // Camada da frente - desenhada depois de toda a pilha, então oclui o
    // acampamento como qualquer coisa entre a câmera e a cena.
    if (this.fgCtx) {
      this.fgCtx.clearRect(0, 0, this._width, this._height);
      if (this.theme && this.theme.drawForeground) {
        this.theme.drawForeground(this.fgCtx, this.camera, this._width, this._height);
      }
    }
  };

  // Progresso é cumulativo entre ciclos - nunca aceita regressão.
  SceneManager.prototype.onFocusComplete = function (newProgress) {
    this.progress = Math.max(this.progress, newProgress);
    if (this.theme) this.theme.setProgress(this.progress);
    return this.progress;
  };

  PMV.World.SceneManager = SceneManager;
})(window.PMV = window.PMV || {});
