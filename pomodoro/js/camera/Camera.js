// js/camera/Camera.js
export class Camera {
    constructor(viewportElement) {
        this.viewport = viewportElement;
        this.targetX = 0;
        this.targetY = 0;
        this.currentX = 0;
        this.currentY = 0;
        this.zoom = 1;
        this.targetZoom = 1;
        
        this.driftX = 0;
        this.driftY = 0;
        
        this.initEvents();
    }

    initEvents() {
        window.addEventListener('mousemove', (e) => {
            const nx = (e.clientX / window.innerWidth) - 0.5;
            const ny = (e.clientY / window.innerHeight) - 0.5;
            this.targetX = nx * -30;
            this.targetY = ny * -20;
        });
    }

    update(time) {
        // Continuous organic floating drift
        this.driftX = Math.sin(time * 0.3) * 12;
        this.driftY = Math.cos(time * 0.2) * 8;

        // Smooth interpolation (lerp)
        const finalTargetX = this.targetX + this.driftX;
        const finalTargetY = this.targetY + this.driftY;

        this.currentX += (finalTargetX - this.currentX) * 0.04;
        this.currentY += (finalTargetY - this.currentY) * 0.04;
        this.zoom += (this.targetZoom - this.zoom) * 0.02;

        this.viewport.style.transform = `translate3d(${this.currentX}px, ${this.currentY}px, 0) scale(${this.zoom})`;
    }
}