// js/engine/Loop.js
export class RenderLoop {
    constructor(targetFPS = 30) {
        this.targetFPS = targetFPS;
        this.fpsInterval = 1000 / targetFPS;
        this.lastFrameTime = 0;
        this.callbacks = [];
        this.isRunning = false;
        this.rafId = null;
    }

    add(callback) {
        if (typeof callback === 'function') {
            this.callbacks.push(callback);
        }
    }

    start() {
        if (this.isRunning) return;
        this.isRunning = true;
        this.lastFrameTime = performance.now();
        this._loop(this.lastFrameTime);
    }

    stop() {
        this.isRunning = false;
        if (this.rafId) cancelAnimationFrame(this.rafId);
    }

    _loop(currentTime) {
        if (!this.isRunning) return;

        this.rafId = requestAnimationFrame((t) => this._loop(t));

        const elapsed = currentTime - this.lastFrameTime;

        if (elapsed > this.fpsInterval) {
            this.lastFrameTime = currentTime - (elapsed % this.fpsInterval);
            const deltaSec = elapsed / 1000;

            for (let i = 0; i < this.callbacks.length; i++) {
                this.callbacks[i](currentTime * 0.001, deltaSec);
            }
        }
    }
}