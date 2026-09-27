export type DrawingTool = 'cursor' | 'trendline' | 'horizontal' | 'vertical' | 'measure';

export interface Point {
  time: number;
  price: number;
}

export interface BaseDrawing {
  id: string;
  color: string;
  lineWidth?: number;
}

export interface TrendlineDrawing extends BaseDrawing {
  type: 'trendline';
  p1: Point;
  p2: Point;
}

export interface HorizontalDrawing extends BaseDrawing {
  type: 'horizontal';
  price: number;
  label?: string;
}

export interface VerticalDrawing extends BaseDrawing {
  type: 'vertical';
  time: number;
}

export interface MeasureDrawing extends BaseDrawing {
  type: 'measure';
  p1: Point;
  p2: Point;
}

export type Drawing = TrendlineDrawing | HorizontalDrawing | VerticalDrawing | MeasureDrawing;

export function loadDrawings(symbol: string): Drawing[] {
  try {
    const raw = localStorage.getItem(`criptovisualizer:drawings:${symbol}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveDrawings(symbol: string, drawings: Drawing[]): void {
  try {
    localStorage.setItem(`criptovisualizer:drawings:${symbol}`, JSON.stringify(drawings));
  } catch {
    // localStorage can fail in private browsing or memory constraints
  }
}

export function clearDrawings(symbol: string): void {
  try {
    localStorage.removeItem(`criptovisualizer:drawings:${symbol}`);
  } catch {
    // ignore
  }
}
