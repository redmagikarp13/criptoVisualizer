import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(cleanup);

if (typeof HTMLCanvasElement !== 'undefined') {
  HTMLCanvasElement.prototype.getContext = (() => ({
    resetTransform: () => {},
    scale: () => {},
    clearRect: () => {},
    save: () => {},
    restore: () => {},
    beginPath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    stroke: () => {},
    fill: () => {},
    fillRect: () => {},
    strokeRect: () => {},
    roundRect: () => {},
    arc: () => {},
    fillText: () => {},
    measureText: () => ({ width: 40 }),
    setLineDash: () => {},
  })) as unknown as typeof HTMLCanvasElement.prototype.getContext;
}
