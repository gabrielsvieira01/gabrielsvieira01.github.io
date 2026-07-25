// js/components/Coral.js
export class Coral {
    constructor(parentEl, { x, y, scale = 1, gradientId = 'coral-grad-1', branches = 5 }) {
        this.parentEl = parentEl;
        this.x = x;
        this.y = y;
        this.maxScale = scale;
        this.gradientId = gradientId;
        this.branchesCount = branches;
        this.growthProgress = 0; // 0 to 1

        this.element = this._createDOM();
        this.parentEl.appendChild(this.element);
    }

    _createDOM() {
        const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        group.setAttribute('transform', `translate(${this.x}, ${this.y}) scale(0)`);
        group.setAttribute('filter', 'url(#subtle-shadow)');

        // Vector Organic Branching paths
        let pathsHTML = '';
        const baseWidth = 24;
        
        for (let i = 0; i < this.branchesCount; i++) {
            const angle = (-80 + (160 / (this.branchesCount - 1)) * i) * (Math.PI / 180);
            const length = 90 + Math.sin(i * 1.5) * 30;
            const cx1 = Math.cos(angle) * (length * 0.5) + (i % 2 === 0 ? 15 : -15);
            const cy1 = -Math.abs(Math.sin(angle)) * (length * 0.5);
            const ex = Math.cos(angle) * length;
            const ey = -Math.abs(Math.sin(angle)) * length;

            pathsHTML += `
                <path d="M 0,0 C ${cx1},${cy1} ${ex * 0.7},${ey * 0.8} ${ex},${ey}" 
                      fill="none" 
                      stroke="url(#${this.gradientId})" 
                      stroke-width="${baseWidth - i * 2}" 
                      stroke-linecap="round" />
                <circle cx="${ex}" cy="${ey}" r="${(baseWidth - i * 2) * 0.4}" fill="url(#${this.gradientId})" />
            `;
        }

        group.innerHTML = pathsHTML;
        return group;
    }

    setGrowth(progress) {
        // Non-linear organic spring scale and stretch
        this.growthProgress = Math.min(1, Math.max(0, progress));
        const currentScale = this.growthProgress * this.maxScale;
        
        // Organic dynamic stretch effect
        const scaleY = currentScale * (1 + Math.sin(this.growthProgress * Math.PI) * 0.08);
        const scaleX = currentScale;

        this.element.setAttribute('transform', `translate(${this.x}, ${this.y}) scale(${scaleX}, ${scaleY})`);
    }

    animateSway(time, indexOffset = 0) {
        if (this.growthProgress <= 0) return;
        const sway = Math.sin(time * 1.2 + indexOffset) * 2.5;
        const currentScale = this.growthProgress * this.maxScale;
        this.element.setAttribute('transform', 
            `translate(${this.x}, ${this.y}) scale(${currentScale}) rotate(${sway})`
        );
    }
}