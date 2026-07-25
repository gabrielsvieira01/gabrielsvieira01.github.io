// js/engine/Timer.js
export class Timer {
    constructor(durationMinutes = 25) {
        this.duration = durationMinutes * 60;
        this.remaining = this.duration;
        this.isRunning = false;
        this.isCompleted = false;
        this.progress = 0;

        this.onTick = null;
        this.onComplete = null;

        this._lastTime = 0;
        this._rafId = null;
    }

    start() {
        if (this.isRunning) return;
        
        if (this.remaining <= 0) {
            this.remaining = this.duration;
            this.progress = 0;
            this.isCompleted = false;
        }

        this.isRunning = true;
        this._lastTime = performance.now();
        this._tick();
    }

    pause() {
        this.isRunning = false;
        if (this._rafId) {
            cancelAnimationFrame(this._rafId);
            this._rafId = null;
        }
    }

    reset(durationMinutes = 25) {
        this.pause();
        this.duration = durationMinutes * 60;
        this.remaining = this.duration;
        this.progress = 0;
        this.isCompleted = false;
        if (this.onTick) this.onTick(this.getState());
    }

    _tick() {
        if (!this.isRunning) return;

        const now = performance.now();
        const delta = (now - this._lastTime) / 1000;
        this._lastTime = now;

        this.remaining = Math.max(0, this.remaining - delta);
        this.progress = Math.min(1.0, (this.duration - this.remaining) / this.duration);

        if (this.onTick) this.onTick(this.getState());

        if (this.remaining <= 0) {
            this.isRunning = false;
            this.isCompleted = true;
            if (this.onComplete) this.onComplete();
            return;
        }

        this._rafId = requestAnimationFrame(() => this._tick());
    }

    getState() {
        const totalSecs = Math.ceil(this.remaining);
        const mins = Math.floor(totalSecs / 60);
        const secs = totalSecs % 60;
        const formattedTime = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
        return {
            remaining: this.remaining,
            duration: this.duration,
            progress: this.progress,
            formattedTime,
            isRunning: this.isRunning
        };
    }
}