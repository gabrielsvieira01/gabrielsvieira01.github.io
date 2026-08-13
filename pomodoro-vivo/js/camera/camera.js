(function (PMV) {
  'use strict';

  PMV.Camera = PMV.Camera || {};

  function Camera(opts) {
    opts = opts || {};
    this.rng = opts.rng || function () { return 0.5; };
    this.driftAmplitudeX = opts.driftAmplitudeX === undefined ? 14 : opts.driftAmplitudeX;
    this.driftAmplitudeY = opts.driftAmplitudeY === undefined ? 6 : opts.driftAmplitudeY;
    this.driftSpeed = opts.driftSpeed === undefined ? 0.05 : opts.driftSpeed;
    this._t = this.rng() * 1000; // fase de dessincronia, seedada
    this.x = 0;
    this.y = 0;
  }

  Camera.prototype.update = function (dt) {
    this._t += dt * this.driftSpeed;
    this.x = Math.sin(this._t) * this.driftAmplitudeX;
    this.y = Math.sin(this._t * 0.63 + 1.7) * this.driftAmplitudeY;
  };

  // Offset de parallax para uma dada profundidade (0 = fundo, 1 = primeiro plano).
  Camera.prototype.parallaxFor = function (depth) {
    var factor = 0.15 + depth * 0.85;
    return { x: this.x * factor, y: this.y * factor };
  };

  PMV.Camera.Camera = Camera;
})(window.PMV = window.PMV || {});
