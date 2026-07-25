// js/app.js
import { RenderLoop } from './engine/Loop.js';
import { Camera } from './camera/Camera.js';
import { CanvasRenderer } from './world/CanvasRenderer.js';
import { RecifeTheme } from './themes/RecifeTheme.js';

class App {
    constructor() {
        // UI Elements
        this.timeDisplay = document.getElementById('time-display');
        this.progressFill = document.getElementById('progress-fill');
        this.statsCorals = document.getElementById('stats-corals');
        this.statsFauna = document.getElementById('stats-fauna');
        this.sessionLabel = document.getElementById('session-label');
        
        // Hide controls for visual demo mode
        document.querySelector('.controls').style.display = 'none';

        // Core Systems
        this.loop = new RenderLoop(30);
        this.canvasRenderer = new CanvasRenderer(document.getElementById('world-canvas'));
        this.camera = new Camera(document.getElementById('stage-viewport'));
        this.theme = new RecifeTheme();

        // Visual Demo State
        this.demoProgress = 0;
        this.demoDuration = 45; // Crescimento completo em 45 segundos para visualização
        this.demoCompleted = false;

        this.init();
    }

    init() {
        // Setup Demo UI
        this.timeDisplay.textContent = "DEMO VISUAL";
        this.timeDisplay.style.fontSize = "3rem";
        this.sessionLabel.textContent = "Evolução acelerada (45s)";

        // Main Loop Engine
        this.loop.add((time, deltaSec) => {
            // Auto-advance progress
            if (this.demoProgress < 1.0) {
                this.demoProgress += deltaSec / this.demoDuration;
                
                if (this.demoProgress >= 1.0) {
                    this.demoProgress = 1.0;
                    if (!this.demoCompleted) {
                        this.demoCompleted = true;
                        this.theme.triggerCompletionFauna();
                        this.timeDisplay.textContent = "CONCLUÍDO";
                        this.sessionLabel.textContent = "Ecossistema Formado";
                    }
                }
            }

            // Sync UI
            this.progressFill.style.width = `${(this.demoProgress * 100).toFixed(2)}%`;
            this.statsCorals.textContent = this.theme.stats.structures;
            this.statsFauna.textContent = this.theme.stats.fauna;

            // Render Pipeline
            this.canvasRenderer.render(time);
            this.camera.update(time);
            
            // Ecosystem Evolution & Render
            this.theme.updateGrowth(this.demoProgress);
            this.theme.render(time, deltaSec, this.demoProgress);
        });

        // Start presentation
        this.loop.start();
    }
}

window.addEventListener('DOMContentLoaded', () => {
    window.app = new App();
});