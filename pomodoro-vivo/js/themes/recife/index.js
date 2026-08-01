(function (PMV) {
  'use strict';

  PMV.Themes = PMV.Themes || {};
  PMV.Themes.Recife = PMV.Themes.Recife || {};

  var SvgUtils = PMV.Engine.SvgUtils;

  function RecifeTheme() {
    this.background = new PMV.Themes.Recife.Background();
    this.svgRoot = null;
    this.rng = null;
    this.width = 0;
    this.height = 0;
    this.progress = 0;
    this.instances = [];
    this.fauna = [];
    this._placedGroups = []; // { inst, group } pra checagem de threshold
    this._defs = null;
    this._layer = null;
  }

  RecifeTheme.prototype.init = function (opts) {
    this.svgRoot = opts.svgRoot;
    this.rng = opts.rng;
    this.width = opts.width;
    this.height = opts.height;

    this._defs = SvgUtils.createEl('defs');
    this.svgRoot.appendChild(this._defs);
    this._layer = SvgUtils.createEl('g', { 'data-pmv-layer': 'recife-organisms' });
    this.svgRoot.appendChild(this._layer);

    this.background.resize(this.width, this.height, this.rng);
    this._buildComposition();
  };

  RecifeTheme.prototype.resize = function (width, height) {
    this.width = width;
    this.height = height;
    this.background.resize(width, height, this.rng);

    while (this._layer.firstChild) this._layer.removeChild(this._layer.firstChild);
    this._placedGroups = [];
    this._buildComposition();

    // Progresso já alcançado continua valendo após redimensionar.
    this.setProgress(this.progress);
  };

  RecifeTheme.prototype._buildComposition = function () {
    var Composition = PMV.Themes.Recife.Composition;
    var Fauna = PMV.Themes.Recife.Fauna;
    var bg = this.background;
    var self = this;

    this.instances = Composition.expandPlan(this.rng, this.width);
    this.fauna = Fauna.expandFauna(this.rng, this.instances, this.width, this.height);

    this.instances.forEach(function (inst) {
      self._placeInstance(inst, bg.sandSurfaceYf(inst.x));
    });
    this.fauna.forEach(function (inst) {
      self._placeInstance(inst, inst.y);
    });
  };

  RecifeTheme.prototype._placeInstance = function (inst, worldY) {
    var Component = PMV.Components[inst.component];
    if (!Component || typeof Component.create !== 'function') {
      // Arte ainda não integrada - slot fica reservado, nada é desenhado.
      return;
    }
    var built = Component.create(this._layer, {
      seed: Math.floor(this.rng() * 1e9),
      scale: inst.scale,
      biasType: inst.biasType
    });
    if (!built || !built.group) return;
    SvgUtils.placeAtPivot(built.group, inst.x, worldY, inst.scale);
    this._placedGroups.push({ inst: inst, group: built.group });
  };

  RecifeTheme.prototype.setProgress = function (progress) {
    this.progress = Math.max(this.progress, progress);
    this._placedGroups.forEach(function (entry) {
      if (entry.inst.threshold <= this.progress) {
        SvgUtils.growNow(entry.group);
      }
    }, this);
  };

  RecifeTheme.prototype.update = function (dt) {
    this.background.update(dt);
  };

  RecifeTheme.prototype.drawCanvas = function (ctx, camera, width, height) {
    this.background.draw(ctx, camera, width, height);
  };

  // Prévia de horário do dia (vitrine/testes) - null volta ao horário real.
  RecifeTheme.prototype.setTimeOverrideHour = function (hour) {
    this.background.setTimeOverrideHour(hour);
  };

  PMV.Themes.Recife.ThemeModule = RecifeTheme;
})(window.PMV = window.PMV || {});
