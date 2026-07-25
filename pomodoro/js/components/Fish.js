// js/components/Fish.js
export class Fish {
    constructor(parentEl, { xBounds = [100, 1800], yBounds = [200, 800], speed = 0.8 }) {
        this.parentEl = parentEl;
        this.xBounds = xBounds;
        this.yBounds = yBounds;
        this.speed = speed;

        this.x = xBounds[0] + Math.random() * (xBounds[1] - xBounds[0]);
        this.y = yBounds[0] + Math.random() * (yBounds[1] - yBounds[0]);
        this.direction = Math.random() > 0.5 ? 1 : -1;
        this.phase = Math.random() * Math.PI * 2;

        this.element = this._createDOM();
        this.parentEl.appendChild(this.element);
    }

    _createDOM() {
        const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        group.innerHTML = `
            <!-- Modern minimal vector fish -->
            <path d="M -20,0 C -10,-12 15,-10 25,0 C 15,10 -10,12 -20,0 Z" fill="url(#fish-grad-1)"/>
            <path d="M -18,0 L -30,-8 L -26,0 L -30,8 Z" fill="url(#fish-grad-1)"/>
            <circle cx="14" cy="-3" r="2" fill="#0A2540"/>
        `;
        return group;
    }

    update(time, deltaSec) {
        this.x += this.direction * this.speed * 40 * deltaSec;
        this.y += Math.sin(time * 2 + this.phase) * 0.4;

        if (this.x > this.xBounds[1]) {
            this.direction = -1;
        } else if (this.x < this.xBounds[0]) {
            this.direction = 1;
        }

        const scaleX = this.direction * 0.8;
        const scaleY = 0.8;
        const tilt = Math.sin(time * 3 + this.phase) * 4;

        this.element.setAttribute('transform', 
            `translate(${this.x}, ${this.y}) scale(${scaleX}, ${scaleY}) rotate(${tilt})`
        );
    }
}

export class MantaRay {
    constructor(parentEl) {
        this.parentEl = parentEl;
        this.x = -200;
        this.y = 350;
        this.active = false;
        this.element = this._createDOM();
        this.parentEl.appendChild(this.element);
    }

    _createDOM() {
        const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        group.setAttribute('opacity', '0.45');
        group.innerHTML = `
            <path d="M 0,-40 C 40,-20 90,10 120,40 C 50,30 20,20 0,60 C -20,20 -50,30 -120,40 C -90,10 -40,-20 0,-40 Z" fill="#38BDF8"/>
            <path d="M 0,50 Q 0,120 5,160" stroke="#38BDF8" stroke-width="3" fill="none" stroke-linecap="round"/>
        `;
        return group;
    }

    spawn() {
        this.x = -200;
        this.y = 250 + Math.random() * 300;
        this.active = true;
    }

    update(time, deltaSec) {
        if (!this.active) return;

        this.x += 45 * deltaSec;
        this.y += Math.sin(time * 0.8) * 0.3;

        const wingFlap = Math.sin(time * 1.5) * 0.15 + 0.85;

        this.element.setAttribute('transform', 
            `translate(${this.x}, ${this.y}) scale(1.2, ${wingFlap})`
        );

        if (this.x > 2100) {
            this.active = false;
        }
    }
}