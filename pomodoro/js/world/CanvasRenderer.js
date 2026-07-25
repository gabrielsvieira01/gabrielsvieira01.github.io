// js/world/CanvasRenderer.js
export class CanvasRenderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.particles = [];
        this.caustics = [];
        this.resize();

        window.addEventListener('resize', () => this.resize());
        this._initParticles();
    }

    resize() {
        this.width = window.innerWidth;
        this.height = window.innerHeight;
        this.canvas.width = this.width;
        this.canvas.height = this.height;
    }

    _initParticles() {
        // Controlled, low-CPU particle count
        this.particles = [];
        const count = 35;
        for (let i = 0; i < count; i++) {
            this.particles.push({
                x: Math.random() * this.width,
                y: Math.random() * this.height,
                radius: Math.random() * 2.5 + 0.8,
                alpha: Math.random() * 0.5 + 0.2,
                speedY: -(Math.random() * 0.3 + 0.1),
                driftSpeed: Math.random() * 0.002 + 0.001,
                phase: Math.random() * Math.PI * 2
            });
        }
    }

    render(time) {
        const ctx = this.ctx;
        const w = this.width;
        const h = this.height;

        ctx.clearRect(0, 0, w, h);

        // 1. Deep Ocean Gradient
        const oceanGrad = ctx.createLinearGradient(0, 0, 0, h);
        oceanGrad.addColorStop(0, '#0A2540');
        oceanGrad.addColorStop(0.4, '#06192E');
        oceanGrad.addColorStop(1, '#020B14');
        ctx.fillStyle = oceanGrad;
        ctx.fillRect(0, 0, w, h);

        // 2. Light Rays from surface (Crepuscular Rays)
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        const rayGrad = ctx.createLinearGradient(w * 0.3, 0, w * 0.6, h);
        rayGrad.addColorStop(0, 'rgba(56, 189, 248, 0.12)');
        rayGrad.addColorStop(0.5, 'rgba(45, 212, 191, 0.04)');
        rayGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');

        ctx.fillStyle = rayGrad;
        ctx.beginPath();
        const rayShift = Math.sin(time * 0.5) * 40;
        ctx.moveTo(w * 0.1 + rayShift, 0);
        ctx.lineTo(w * 0.4 + rayShift, 0);
        ctx.lineTo(w * 0.8, h);
        ctx.lineTo(w * 0.2, h);
        ctx.closePath();
        ctx.fill();
        ctx.restore();

        // 3. Floating Bioluminescent Marine Snow / Bubbles
        ctx.save();
        for (let i = 0; i < this.particles.length; i++) {
            const p = this.particles[i];
            p.y += p.speedY;
            p.x += Math.sin(time * p.driftSpeed + p.phase) * 0.4;

            if (p.y < -10) {
                p.y = h + 10;
                p.x = Math.random() * w;
            }

            ctx.beginPath();
            ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(125, 211, 252, ${p.alpha * (0.6 + Math.sin(time * 2 + p.phase) * 0.4)})`;
            ctx.fill();
        }
        ctx.restore();

        // 4. Subtle Ambient Vignette / Fog
        const fogGrad = ctx.createRadialGradient(w / 2, h / 2, w * 0.3, w / 2, h / 2, w * 0.75);
        fogGrad.addColorStop(0, 'rgba(0,0,0,0)');
        fogGrad.addColorStop(1, 'rgba(2, 11, 20, 0.6)');
        ctx.fillStyle = fogGrad;
        ctx.fillRect(0, 0, w, h);
    }
}