/**
 * EntitySpawnerUI Styles
 * Extracted for maintainability
 */
export const ENTITY_SPAWNER_STYLES = `
  :host {
    position: fixed;
    bottom: 20px;
    left: 20px;
    z-index: 1000;
    font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    user-select: none;
  }

  .container {
    background: rgba(0, 0, 0, 0.75);
    backdrop-filter: blur(8px);
    border-radius: 12px;
    padding: 16px;
    min-width: 180px;
    color: #fff;
  }

  .section {
    margin-bottom: 16px;
  }

  .section:last-child {
    margin-bottom: 0;
  }

  .label {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #888;
    margin-bottom: 8px;
  }

  /* Preview Canvas */
  .preview-section {
    display: flex;
    justify-content: center;
  }

  .preview-canvas {
    width: 80px;
    height: 80px;
    border-radius: 8px;
    background: #1a1a1a;
  }

  /* Shape Toggle */
  .shape-toggle {
    display: flex;
    gap: 8px;
  }

  .shape-btn {
    flex: 1;
    padding: 10px 12px;
    border: 2px solid #444;
    background: transparent;
    color: #aaa;
    border-radius: 8px;
    cursor: pointer;
    font-size: 14px;
    font-weight: 500;
    transition: all 0.15s ease;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
  }

  .shape-btn:hover {
    border-color: #666;
    color: #fff;
  }

  .shape-btn.active {
    border-color: #4a9eff;
    background: rgba(74, 158, 255, 0.15);
    color: #fff;
  }

  .shape-icon {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .shape-icon svg {
    width: 20px;
    height: 20px;
  }

  /* Size Slider */
  .size-row {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .size-slider {
    flex: 1;
    -webkit-appearance: none;
    appearance: none;
    height: 6px;
    background: #333;
    border-radius: 3px;
    cursor: pointer;
  }

  .size-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 18px;
    height: 18px;
    background: #4a9eff;
    border-radius: 50%;
    cursor: pointer;
    transition: transform 0.1s ease;
  }

  .size-slider::-webkit-slider-thumb:hover {
    transform: scale(1.15);
  }

  .size-slider::-moz-range-thumb {
    width: 18px;
    height: 18px;
    background: #4a9eff;
    border: none;
    border-radius: 50%;
    cursor: pointer;
  }

  .size-value {
    font-family: monospace;
    font-size: 13px;
    color: #aaa;
    min-width: 36px;
    text-align: right;
  }

  /* Instructions */
  .instructions {
    font-size: 11px;
    color: #666;
    text-align: center;
    margin-top: 12px;
    padding-top: 12px;
    border-top: 1px solid #333;
  }
`;
