import lines from './content/lines.json';
import weeks from './content/weeks.json';

export interface WeekContent {
  week: number;
  month: string;
}

export const WEEKS: WeekContent[] = weeks;
export const LINES = lines;

/** Picks a line deterministically, so the same shift always reads the same. */
export function pick(list: readonly string[], n: number): string {
  return list[((n % list.length) + list.length) % list.length];
}

/** Fills {name} slots in a line. */
export function fill(line: string, values: Record<string, string | number>): string {
  return line.replace(/\{(\w+)\}/g, (m, k: string) => (k in values ? String(values[k]) : m));
}
