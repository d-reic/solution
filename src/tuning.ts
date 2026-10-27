// Every number a playtest might want to change. See "Tuning values" in SPEC.md.
export const TUNING = {
  shiftLength: 60, // seconds
  shiftsPerWeek: 3,
  weeks: 6,
  quotas: [40, 45, 50, 55, 60, 70], // per shift, weeks 1–6
  inspectionMinimum: 0.5, // share of quota

  // Needle: one sweep across the gauge takes this long, and gets 10% faster over a shift.
  sweepTimeWeek1: 1.2,
  sweepTimeWeek6: 0.7,
  shiftSpeedup: 0.1,

  greenWidth: 0.22, // share of the gauge
  greenWidthNarrow: 0.14, // above narrowWearAbove, or when hungry (M2)
  narrowWearAbove: 70,
  amberWidth: 0.06, // each side of green, once unlocked (M3)

  // Not in SPEC: the green band moves after each press, within this range,
  // so every part is its own timing check.
  bandCenterMin: 0.2,
  bandCenterMax: 0.8,
  // Not in SPEC: the ram's stroke time, so mashing the button doesn't pay.
  pressStroke: 0.2,

  wearPerPress: 1.5, // percent
  oilSeconds: 3,
  jamSeconds: 8,

  pointsPerPart: 10,
  quotaBonusPoints: 100,
  quotaBonusPay: 1.0, // RM
  payPerPart: 0.12, // RM

  tickRate: 60, // Hz
  maxTickDt: 0.25, // seconds; longer gaps (a hidden tab) are clipped
} as const;
