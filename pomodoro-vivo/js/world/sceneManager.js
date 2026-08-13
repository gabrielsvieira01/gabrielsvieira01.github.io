(function (PMV) {
  'use strict';

  PMV.World = PMV.World || {};

  function SceneManager() {
    this.canvas = null;
    this.ctx = null;
    this.fgCanvas = null;   // camada acima do SVG (primeiro plano oclusor)
    this.fgCtx = null;
    this.svg = null;
    this.theme = null;
    this.camera = null;
    this.rng = null;
    this.loop = null;
    this.progress = 0; // progresso de foco acumulado, nunca regride
    this._width = 0;
    this._height = 0;
    this._resizeBound = null;
  }

  SceneManager.prototype.init = function (opts) {
    this.canvas = opts.canvas;
    this.svg = opts.svg;
    this.ctx = this.canvas.getContext('2d');
    this.fgCanvas = opts.foregroundCanvas || null;
    this.fgCtx = this.fgCanvas ? this.fgCanvas.getContext('2d') : null;
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
      svgRoot: this.svg,
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
    if (this.fgCanvas) sizeCanvas(this.fgCanvas, this.fgCtx, w, h, dpr);
    this.svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
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
    // Camada da frente - desenhada depois do SVG dos organismos, então
    // oclui o recife como qualquer coisa entre a câmera e a cena.
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
