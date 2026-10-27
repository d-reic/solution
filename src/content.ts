import clues from './content/clues.json';
import lines from './content/lines.json';
import weeks from './content/weeks.json';
import type { CoworkerId } from './state';

export interface WeekContent {
  week: number;
  month: string;
}

export interface Clue {
  id: string;
  source: { kind: 'ask' | 'look' | 'talk' | 'read'; who?: string; target?: string };
  label: string;
  available: {
    weekMin?: number;
    from?: number[]; // [week, shift]
    trust?: Partial<Record<CoworkerId, number>>;
    clues?: string[];
    knowledgeMin?: number;
    window?: 'brandtOut' | 'railCar';
  };
  cost: { seconds: number; points: number; attention: number };
  knowledge: number;
  trust?: Partial<Record<CoworkerId, number>>;
  flags?: Record<string, boolean>;
  text: string;
  note: string;
}

export interface OfficeOption {
  id: string;
  label: string;
  reply?: string;
  attention?: number;
  trust?: Partial<Record<CoworkerId, number>>;
  report?: boolean;
  read?: string;
}

export const WEEKS: WeekContent[] = weeks;
export const LINES = lines;
export const CLUES = clues as Clue[];
export const OFFICE_OPTIONS = lines.officeOptions as {
  warning: OfficeOption[];
  warningReport: OfficeOption;
  warningDeny: OfficeOption;
  statement: OfficeOption[];
};

export function clue(id: string): Clue {
  const c = CLUES.find((x) => x.id === id);
  if (!c) throw new Error(`Unknown clue ${id}`);
  return c;
}

/** Picks a line deterministically, so the same shift always reads the same. */
export function pick(list: readonly string[], n: number): string {
  return list[((n % list.length) + list.length) % list.length];
}

/** Fills {name} slots in a line. */
export function fill(line: string, values: Record<string, string | number>): string {
  return line.replace(/\{(\w+)\}/g, (m, k: string) => (k in values ? String(values[k]) : m));
}
