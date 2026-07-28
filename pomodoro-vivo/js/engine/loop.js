(function (PMV) {
  'use strict';

  PMV.Engine = PMV.Engine || {};

  function Loop(opts) {
    opts = opts || {};
    this.fps = opts.fps || 30;
    this._interval = 1000 / this.fps;
    this._last = 0;
    this._running = false;
    this._rafId = null;
    this._listeners = [];
    this._boundTick = this._tick.bind(this);
  }

  Loop.prototype.onTick = function (fn) {
    this._listeners.push(fn);
    return fn;
  };

  Loop.prototype.offTick = function (fn) {
    var idx = this._listeners.indexOf(fn);
    if (idx >= 0) this._listeners.splice(idx, 1);
  };

  Loop.prototype.start = function () {
    if (this._running) return;
    this._running = true;
    this._last = performance.now();
    this._rafId = requestAnimationFrame(this._boundTick);
  };

  Loop.prototype.stop = function () {
    this._running = false;
    if (this._rafId) cancelAnimationFrame(this._rafId);
    this._rafId = null;
  };

  Loop.prototype._tick = function (now) {
    if (!this._running) return;
    this._rafId = requestAnimationFrame(this._boundTick);

    var elapsed = now - this._last;
    if (elapsed < this._interval) return;
    // Avança _last em passos do intervalo pra não acumular drift.
    this._last = now - (elapsed % this._interval);

    var dt = Math.min(elapsed, this._interval * 3) / 1000; // segundos, com clamp
    for (var i = 0; i < this._listeners.length; i++) {
      this._listeners[i](dt, now);
    }
  };

  PMV.Engine.Loop = Loop;
})(window.PMV = window.PMV || {});
