// js/components/Seaweed.js
export class Seaweed {
    constructor(parentEl, { x, y, height = 220, bladeWidth = 18 }) {
        this.parentEl = parentEl;
        this.x = x;
        this.y = y;
        this.targetHeight = height;
        this.bladeWidth = bladeWidth;
        this.growthProgress = 0;

        this.element = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        this.element.setAttribute('fill', 'url(#seaweed-grad)');
        this.element.setAttribute('opacity', '0.9');
        this.parentEl.appendChild(this.element);
    }

    setGrowth(progress) {
        this.growthProgress = Math.min(1, Math.max(0, progress));
    }

    update(time, offset = 0) {
        if (this.growthProgress <= 0) {
            this.element.setAttribute('d', '');
            return;
        }

        const h = this.targetHeight * this.growthProgress;
        const w = this.bladeWidth * this.growthProgress;
        
        // Fluid sine-wave swaying path computation
        const sway1 = Math.sin(time * 1.5 + offset) * 25;
        const sway2 = Math.cos(time * 1.2 + offset) * 35;

        const d = `
            M ${this.x - w/2},${this.y}
            Q ${this.x + sway1},${this.y - h * 0.5} ${this.x + sway2},${this.y - h}
            Q ${this.x + sway1 + w},${this.y - h * 0.5} ${this.x + w/2},${this.y}
            Z
        `;
        this.element.setAttribute('d', d);
    }
}