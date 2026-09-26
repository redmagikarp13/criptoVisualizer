export interface TimedPoint { time: number; [key: string]: unknown }
export function seriesPatch<T extends TimedPoint>(previous: T[], next: T[]): { reset: boolean; data: T[] } {
  if (previous === next) return { reset: false, data: [] };
  const same = (a: T, b: T) => Object.keys(a).length === Object.keys(b).length && Object.keys(a).every(key => a[key] === b[key]);
  if (!previous.length || next.length < previous.length || previous.some((point, index) => index < previous.length - 1 && (!next[index] || !same(point, next[index]))) || previous.at(-1)?.time !== next[previous.length - 1]?.time) {
    return { reset: true, data: next };
  }
  const start = same(previous[previous.length - 1], next[previous.length - 1]) ? previous.length : previous.length - 1;
  return { reset: false, data: next.slice(start) };
}
