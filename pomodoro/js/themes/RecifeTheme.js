// js/themes/RecifeTheme.js
import { Coral } from '../components/Coral.js';
import { Anemone } from '../components/Anemone.js';
import { Seaweed } from '../components/Seaweed.js';
import { Fish, MantaRay } from '../components/Fish.js';

export class RecifeTheme {
    constructor() {
        this.layers = {
            backSeaweed: document.getElementById('layer-back-seaweed'),
            coralsBack: document.getElementById('layer-corals-back'),
            anemones: document.getElementById('layer-anemones'),
            coralsFront: document.getElementById('layer-corals-front'),
            frontSeaweed: document.getElementById('layer-front-seaweed'),
            fauna: document.getElementById('layer-fauna'),
            rareFauna: document.getElementById('layer-rare-fauna')
        };

        this.components = [];
        this.fauna = [];
        this.rareEvents = [];
        this.stats = { structures: 0, fauna: 0 };

        this._buildArtComposition();
    }

    _buildArtComposition() {
        // Artistic placement forming structured reef colonies
        const seabedY = 920;

        // 1. Back Seaweed Forest
        const seaweedPositions = [200, 260, 310, 850, 920, 990, 1500, 1580, 1650];
        seaweedPositions.forEach((x, i) => {
            const weed = new Seaweed(this.layers.backSeaweed, {
                x,
                y: seabedY,
                height: 240 + (i % 3) * 40,
                bladeWidth: 20
            });
            this.components.push({ instance: weed, threshold: 0.05 + (i * 0.08) });
        });

        // 2. Main Coral Colonies (Back & Front layers for depth)
        const coralData = [
            // Left Colony
            { layer: this.layers.coralsBack, x: 350, y: seabedY, scale: 1.4, grad: 'coral-grad-1', b: 6, thresh: 0.1 },
            { layer: this.layers.coralsFront, x: 420, y: seabedY + 20, scale: 1.1, grad: 'coral-grad-3', b: 5, thresh: 0.2 },
            { layer: this.layers.coralsBack, x: 280, y: seabedY, scale: 1.0, grad: 'coral-grad-2', b: 4, thresh: 0.35 },

            // Center Coral Atoll
            { layer: this.layers.coralsBack, x: 960, y: seabedY - 10, scale: 1.8, grad: 'coral-grad-2', b: 7, thresh: 0.15 },
            { layer: this.layers.coralsFront, x: 880, y: seabedY + 30, scale: 1.2, grad: 'coral-grad-1', b: 5, thresh: 0.3 },
            { layer: this.layers.coralsFront, x: 1050, y: seabedY + 20, scale: 1.3, grad: 'coral-grad-3', b: 5, thresh: 0.45 },

            // Right Ridge
            { layer: this.layers.coralsBack, x: 1550, y: seabedY, scale: 1.5, grad: 'coral-grad-3', b: 6, thresh: 0.25 },
            { layer: this.layers.coralsFront, x: 1470, y: seabedY + 25, scale: 1.1, grad: 'coral-grad-1', b: 4, thresh: 0.5 }
        ];

        coralData.forEach(c => {
            const coral = new Coral(c.layer, {
                x: c.x,
                y: c.y,
                scale: c.scale,
                gradientId: c.grad,
                branches: c.b
            });
            this.components.push({ instance: coral, threshold: c.thresh });
        });

        // 3. Anemones Nestled in Colonies
        const anemoneData = [
            { x: 480, y: seabedY + 15, scale: 1.0, thresh: 0.4 },
            { x: 980, y: seabedY + 25, scale: 1.3, thresh: 0.5 },
            { x: 1400, y: seabedY + 20, scale: 0.9, thresh: 0.6 }
        ];

        anemoneData.forEach(a => {
            const anemone = new Anemone(this.layers.anemones, {
                x: a.x,
                y: a.y,
                scale: a.scale
            });
            this.components.push({ instance: anemone, threshold: a.thresh });
        });

        // 4. Fish Fauna (Unlocks at progress milestones)
        for (let i = 0; i < 8; i++) {
            const fish = new Fish(this.layers.fauna, {
                xBounds: [150, 1770],
                yBounds: [300, 750],
                speed: 0.6 + Math.random() * 0.5
            });
            this.fauna.push({ instance: fish, minProgress: 0.3 + (i * 0.08) });
        }

        // 5. Rare Event Megafauna
        const manta = new MantaRay(this.layers.rareFauna);
        this.rareEvents.push(manta);
    }

    updateGrowth(progress) {
        let activeStructures = 0;

        // Smooth organic stagger calculation per component
        this.components.forEach(item => {
            if (progress >= item.threshold) {
                // Local progress mapped smoothly 0 -> 1 after passing threshold
                const localProgress = Math.min(1.0, (progress - item.threshold) / 0.25);
                item.instance.setGrowth(localProgress);
                activeStructures++;
            } else {
                item.instance.setGrowth(0);
            }
        });

        this.stats.structures = activeStructures;
    }

    triggerCompletionFauna() {
        // Trigger rare manta ray on session completion
        if (this.rareEvents[0]) {
            this.rareEvents[0].spawn();
        }
    }

    render(time, deltaSec, currentProgress) {
        // Animate components sway
        this.components.forEach((item, index) => {
            if (item.instance.update) {
                item.instance.update(time, index);
            } else if (item.instance.animateSway) {
                item.instance.animateSway(time, index);
            }
        });

        // Update active fauna
        let activeFaunaCount = 0;
        this.fauna.forEach(f => {
            if (currentProgress >= f.minProgress) {
                f.instance.update(time, deltaSec);
                activeFaunaCount++;
            }
        });

        this.stats.fauna = activeFaunaCount;

        // Update rare events
        this.rareEvents.forEach(e => e.update(time, deltaSec));
    }
}