/**
 * LoadingScreen - Web Component for displaying loading progress and start button
 *
 * Shows loading progress during resource initialization, then displays a
 * "Click to Start" button to unlock audio (browser autoplay policy).
 * Uses Shadow DOM for style isolation. Inherits design tokens from :root.
 */
export class LoadingScreen extends HTMLElement {
  private shadow: ShadowRoot;
  private onStartCallback: (() => void) | null = null;

  constructor() {
    super();
    this.shadow = this.attachShadow({ mode: "open" });
    this.render();
  }

  private render(): void {
    this.shadow.innerHTML = `
      <style>
        :host {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: var(--color-surface, #1a1a1a);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 9999;
          font-family: var(--font-family, system-ui, sans-serif);
          transition: opacity var(--transition-slow, 0.3s ease);
        }

        :host([hidden]) {
          opacity: 0;
          pointer-events: none;
        }

        .content {
          text-align: center;
          max-width: 400px;
          padding: 2rem;
        }

        .title {
          color: var(--color-text-primary, #fff);
          font-size: var(--font-size-2xl, 32px);
          font-weight: 300;
          margin: 0 0 2rem;
          letter-spacing: 0.1em;
        }

        .progress-container {
          width: 100%;
          height: 4px;
          background: var(--color-gray-800, #333);
          border-radius: 2px;
          overflow: hidden;
          margin-bottom: 1rem;
        }

        .progress-bar {
          height: 100%;
          background: var(--color-accent-gradient, linear-gradient(90deg, #4a9eff, #00d4ff));
          width: 0%;
          transition: width var(--transition-slow, 0.3s ease);
          border-radius: 2px;
        }

        .progress-text {
          color: var(--color-text-secondary, #888);
          font-size: var(--font-size-base, 14px);
          margin: 0;
          min-height: 1.25rem;
        }

        .start-button {
          display: none;
          background: var(--color-accent, #4a9eff);
          color: var(--color-text-primary, #fff);
          border: 2px solid var(--color-accent, #4a9eff);
          padding: 1rem 3rem;
          font-size: var(--font-size-lg, 16px);
          font-weight: 500;
          letter-spacing: 0.1em;
          border-radius: var(--radius-md, 8px);
          cursor: pointer;
          transition: all var(--transition-normal, 0.15s ease);
          margin-top: 1.5rem;
          text-transform: uppercase;
          font-family: inherit;
        }

        .start-button:hover {
          background: var(--color-accent-hover, #3a8eef);
          border-color: var(--color-accent-hover, #3a8eef);
        }

        .start-button:focus {
          outline: 2px solid var(--color-accent, #4a9eff);
          outline-offset: 4px;
        }

        .start-button:active {
          transform: scale(0.98);
        }

        .start-button.visible {
          display: inline-block;
          animation: fadeIn 0.5s ease-out;
        }

        .loading-indicator {
          display: flex;
          justify-content: center;
          gap: 0.5rem;
          margin-top: 1.5rem;
        }

        .loading-indicator.hidden {
          display: none;
        }

        .loading-dot {
          width: 8px;
          height: 8px;
          background: var(--color-accent, #4a9eff);
          border-radius: var(--radius-full, 9999px);
          animation: pulse 1.4s ease-in-out infinite;
        }

        .loading-dot:nth-child(2) {
          animation-delay: 0.2s;
        }

        .loading-dot:nth-child(3) {
          animation-delay: 0.4s;
        }

        @keyframes pulse {
          0%, 80%, 100% {
            opacity: 0.3;
            transform: scale(0.8);
          }
          40% {
            opacity: 1;
            transform: scale(1);
          }
        }

        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      </style>

      <div class="content">
        <h1 class="title">Loading</h1>
        <div class="progress-container">
          <div class="progress-bar"></div>
        </div>
        <p class="progress-text">Initializing...</p>
        <div class="loading-indicator">
          <div class="loading-dot"></div>
          <div class="loading-dot"></div>
          <div class="loading-dot"></div>
        </div>
        <button class="start-button">Click to Start</button>
      </div>
    `;

    // Add start button handler
    const startBtn = this.shadow.querySelector(".start-button");
    startBtn?.addEventListener("click", () => {
      if (this.onStartCallback) {
        this.onStartCallback();
      }
      this.hide();
    });
  }

  /**
   * Update loading progress
   * @param progress - Progress value from 0 to 1
   * @param message - Optional status message
   */
  setProgress(progress: number, message?: string): void {
    const progressBar = this.shadow.querySelector<HTMLElement>(".progress-bar");
    const progressText = this.shadow.querySelector(".progress-text");

    if (progressBar) {
      progressBar.style.width = `${Math.min(100, Math.max(0, progress * 100))}%`;
    }

    if (progressText && message) {
      progressText.textContent = message;
    }
  }

  /**
   * Show the start button (called when loading is complete)
   */
  showStartButton(): void {
    const startBtn = this.shadow.querySelector(".start-button");
    const loadingIndicator = this.shadow.querySelector(".loading-indicator");
    const progressText = this.shadow.querySelector(".progress-text");

    startBtn?.classList.add("visible");
    loadingIndicator?.classList.add("hidden");

    if (progressText) {
      progressText.textContent = "Ready!";
    }
  }

  /**
   * Set callback for when start button is clicked
   */
  setOnStart(callback: () => void): void {
    this.onStartCallback = callback;
  }

  /**
   * Hide the loading screen with fade animation
   */
  hide(): void {
    this.setAttribute("hidden", "");
    // Remove from DOM after animation
    setTimeout(() => {
      this.remove();
    }, 300);
  }
}

// Register the custom element
customElements.define("loading-screen", LoadingScreen);
