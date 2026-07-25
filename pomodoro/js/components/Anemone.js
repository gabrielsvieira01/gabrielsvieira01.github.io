// js/components/Anemone.js
export class Anemone {
    constructor(parentEl, { x, y, scale = 1, tentacleCount = 9 }) {
        this.parentEl = parentEl;
        this.x = x;
        this.y = y;
        this.targetScale = scale;
        this.tentacleCount = tentacleCount;
        this.growthProgress = 0;

        this.tentacles = [];
        this.element = this._createDOM();
        this.parentEl.appendChild(this.element);
    }

    _createDOM() {
        const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        group.setAttribute('transform', `translate(${this.x}, ${this.y}) scale(0)`);

        // Bulb Base
        const base = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
        base.setAttribute('cx', '0');
        base.setAttribute('cy', '0');
        base.setAttribute('rx', '30');
        base.setAttribute('ry', '12');
        base.setAttribute('fill', 'url(#anemone-grad)');
        group.appendChild(base);

        // Tentacles
        for (let i = 0; i < this.tentacleCount; i++) {
            const angle = (-140 + (280 / (this.tentacleCount - 1)) * i) * (Math.PI / 180);
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('fill', 'none');
            path.setAttribute('stroke', 'url(#anemone-grad)');
            path.setAttribute('stroke-width', '7');
            path.setAttribute('stroke-linecap', 'round');
            
            group.appendChild(path);
            this.tentacles.push({
                element: path,
                angle,
                length: 50 + Math.random() * 20,
                phase: i * 0.4
            });
        }

        return group;
    }

    setGrowth(progress) {
        this.growthProgress = Math.min(1, Math.max(0, progress));
        const currentScale = this.growthProgress * this.targetScale;
        this.element.setAttribute('transform', `translate(${this.x}, ${this.y}) scale(${currentScale})`);
    }

    update(time) {
        if (this.growthProgress <= 0) return;

        for (let t of this.tentacles) {
            const wave = Math.sin(time * 2 + t.phase) * 15;
            const tipX = Math.cos(t.angle) * t.length + wave;
            const tipY = -Math.abs(Math.sin(t.angle)) * t.length - 10;
            const cpX = tipX * 0.5 + wave * 0.5;
            const cpY = tipY * 0.6;

            t.element.setAttribute('d', `M 0,-4 C ${cpX},${cpY} ${cpX},${tipY} ${tipX},${tipY}`);
        }
    }
}