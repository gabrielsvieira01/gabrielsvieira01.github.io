(function (PMV) {
  'use strict';

  PMV.World = PMV.World || {};

  function SceneManager() {
    this.canvas = null;
    this.ctx = null;
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
    this.rng = PMV.Engine.CanvasUtils.mulberry32(opts.seed || 1337);
    this.camera = new PMV.Camera.Camera({ rng: this.rng });
    this.progress = opts.initialProgress || 0;

    this._resizeBound = this._resize.bind(this);
    this._resize();
    window.addEventListener('resize', this._resizeBound);

    this.loop = new PMV.Engine.Loop({ fps: opts.fps || 30 });
    this.loop.onTick(this._tick.bind(this));
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
    this.loop.start();
  };

  SceneManager.prototype.stop = function () {
    this.loop.stop();
  };

  SceneManager.prototype._resize = function () {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = window.innerWidth;
    var h = window.innerHeight;
    this._width = w;
    this._height = h;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
    if (this.theme && this.theme.resize) this.theme.resize(w, h);
  };

  SceneManager.prototype._tick = function (dt) {
    this.camera.update(dt);
    if (this.theme && this.theme.update) {
      this.theme.update(dt, this.camera);
    }
    this.ctx.clearRect(0, 0, this._width, this._height);
    if (this.theme && this.theme.drawCanvas) {
      this.theme.drawCanvas(this.ctx, this.camera, this._width, this._height);
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
