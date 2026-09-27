export type DrawingTool = 'cursor' | 'trendline' | 'horizontal' | 'vertical' | 'measure';

export interface Point {
  time: number; // UTC timestamp in seconds
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
  extendRight?: boolean;
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

export type PatternType =
  | 'symmetrical'
  | 'ascending'
  | 'descending'
  | 'rising_wedge'
  | 'falling_wedge'
  | 'convergence';

export interface TrendConvergence {
  id: string;
  line1: TrendlineDrawing;
  line2: TrendlineDrawing;
  apexTime: number; // in seconds
  apexPrice: number;
  timeFormatted: string; // e.g. "Hoje às 01:00" or "Amanhã às 01:00"
  remainingFormatted: string; // e.g. "em 15h 02m"
  remainingSeconds: number;
  patternType: PatternType;
  patternName: string;
  description: string;
}

export function formatApexPrice(price: number): string {
  if (!Number.isFinite(price) || price <= 0) return '—';
  try {
    if (price >= 1000) {
      return price.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    if (price >= 1) {
      return price.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
    }
    if (price >= 0.01) {
      return price.toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 6 });
    }
    return price.toLocaleString('pt-BR', { minimumFractionDigits: 6, maximumFractionDigits: 8 });
  } catch {
    return String(price);
  }
}

export function calculateLineEquation(p1: Point, p2: Point) {
  const [start, end] = p1.time <= p2.time ? [p1, p2] : [p2, p1];
  const dt = end.time - start.time;
  if (dt === 0) return null;
  const slope = (end.price - start.price) / dt;
  const intercept = start.price - slope * start.time;
  return { slope, intercept, start, end };
}

export function findTrendlinesConvergence(
  drawings: Drawing[],
  nowSec: number = Math.floor(Date.now() / 1000)
): TrendConvergence[] {
  const trendlines = drawings.filter((d): d is TrendlineDrawing => d.type === 'trendline');
  if (trendlines.length < 2) return [];

  const results: TrendConvergence[] = [];

  for (let i = 0; i < trendlines.length; i++) {
    for (let j = i + 1; j < trendlines.length; j++) {
      const line1 = trendlines[i];
      const line2 = trendlines[j];

      const eq1 = calculateLineEquation(line1.p1, line1.p2);
      const eq2 = calculateLineEquation(line2.p1, line2.p2);
      if (!eq1 || !eq2) continue;

      const slopeDiff = eq1.slope - eq2.slope;
      // Parallel lines
      if (Math.abs(slopeDiff) < 1e-13) continue;

      const apexTime = (eq2.intercept - eq1.intercept) / slopeDiff;
      const apexPrice = eq1.slope * apexTime + eq1.intercept;

      // Must be finite and positive price
      if (apexPrice <= 0 || apexPrice > 1e10 || !Number.isFinite(apexPrice) || !Number.isFinite(apexTime)) continue;

      // Check that intersection is in the future relative to the anchor points
      const latestAnchor = Math.max(eq1.end.time, eq2.end.time);

      // If apex is before the drawn segment end or before now - 120s, it's already in the past
      if (apexTime <= latestAnchor || apexTime < nowSec - 120) continue;

      // Limitar a convergências realistas (máximo 60 dias no futuro para evitar números astronômicos)
      if (apexTime > nowSec + 60 * 86400) continue;

      const apexDate = new Date(apexTime * 1000);
      if (isNaN(apexDate.getTime())) continue;

      const remainingSeconds = Math.max(0, Math.round(apexTime - nowSec));

      // Remaining formatted
      let remainingFormatted = '';
      if (remainingSeconds > 0) {
        const days = Math.floor(remainingSeconds / 86400);
        const hours = Math.floor((remainingSeconds % 86400) / 3600);
        const mins = Math.floor((remainingSeconds % 3600) / 60);
        if (days > 0) {
          remainingFormatted = `em ${days}d ${hours}h`;
        } else if (hours > 0) {
          remainingFormatted = `em ${hours}h ${mins.toString().padStart(2, '0')}m`;
        } else {
          remainingFormatted = `em ${Math.max(1, mins)}m`;
        }
      } else {
        remainingFormatted = 'no ápice / agora';
      }

      const nowDate = new Date(nowSec * 1000);

      const isToday =
        apexDate.getDate() === nowDate.getDate() &&
        apexDate.getMonth() === nowDate.getMonth() &&
        apexDate.getFullYear() === nowDate.getFullYear();

      const tomorrow = new Date(nowDate);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const isTomorrow =
        apexDate.getDate() === tomorrow.getDate() &&
        apexDate.getMonth() === tomorrow.getMonth() &&
        apexDate.getFullYear() === tomorrow.getFullYear();

      const hoursStr = apexDate.getHours().toString().padStart(2, '0');
      const minsStr = apexDate.getMinutes().toString().padStart(2, '0');

      let timeFormatted = '';
      if (isToday) {
        timeFormatted = `Hoje às ${hoursStr}:${minsStr}`;
      } else if (isTomorrow) {
        timeFormatted = `Amanhã às ${hoursStr}:${minsStr}`;
      } else {
        const day = apexDate.getDate().toString().padStart(2, '0');
        const month = (apexDate.getMonth() + 1).toString().padStart(2, '0');
        timeFormatted = `${day}/${month} às ${hoursStr}:${minsStr}`;
      }

      // Pattern classification
      const m1 = eq1.slope;
      const m2 = eq2.slope;
      let patternType: PatternType = 'convergence';
      let patternName = 'Convergência de Tendência';
      let description = 'Cruzamento de linhas com possível definição de mercado';

      // Distinguish flat line (horizontal threshold)
      const isFlat1 = Math.abs(m1) < 1e-9;
      const isFlat2 = Math.abs(m2) < 1e-9;

      if ((m1 > 0 && m2 < 0) || (m1 < 0 && m2 > 0)) {
        patternType = 'symmetrical';
        patternName = 'Triângulo Simétrico';
        description = 'Afunilamento de suporte e resistência: rompimento iminente no vértice';
      } else if (isFlat1 || isFlat2) {
        const nonFlatSlope = isFlat1 ? m2 : m1;
        if (nonFlatSlope > 0) {
          patternType = 'ascending';
          patternName = 'Triângulo Ascendente';
          description = 'Fundos ascendentes pressionando resistência (viés altista)';
        } else {
          patternType = 'descending';
          patternName = 'Triângulo Descendente';
          description = 'Topos descendentes pressionando suporte (viés baixista)';
        }
      } else if (m1 > 0 && m2 > 0) {
        patternType = 'rising_wedge';
        patternName = 'Cunha Ascendente';
        description = 'Compressão de alta estreitando (atenção para exaustão)';
      } else if (m1 < 0 && m2 < 0) {
        patternType = 'falling_wedge';
        patternName = 'Cunha Descendente';
        description = 'Compressão de baixa estreitando (potencial reversão altista)';
      }

      results.push({
        id: `${line1.id}-${line2.id}`,
        line1,
        line2,
        apexTime,
        apexPrice,
        timeFormatted,
        remainingFormatted,
        remainingSeconds,
        patternType,
        patternName,
        description,
      });
    }
  }

  return results.sort((a, b) => a.apexTime - b.apexTime);
}

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

