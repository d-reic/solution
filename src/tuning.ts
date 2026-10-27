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

  questionPenalty: 25, // points per foreman question
  loyaltyBonus: 500, // points for reporting Emil
  christmasBonusPoints: 250, // week 6, shift 3, quota met (not in SPEC: size of the bonus)
  christmasBonusPay: 2.0,

  // Household
  startingMoney: 4.0, // not in SPEC
  rent: 9.0, // last evening of each week
  food: 2.4, // each evening
  coal: 1.2, // each evening, weeks 4–6
  coalFromWeek: 4,
  medicine: 4.0,
  householdLossPerBill: 15,
  householdGainPaidUp: 5, // not in SPEC: a fully paid evening heals a little
  householdAfterMedicine: 40, // not in SPEC

  // Attention
  officeAt: 50,
  inspectorAt: 80,
  arrestAt: 100,
  attentionPerQuestion: 8,
  attentionC12: 12,
  attentionUnderMinimum: 15,
  attentionZeroShift: 25,
  zeroShiftsToDismissal: 2,
  attentionQuotaMet: -3,
  attentionQuotaBeat: -8, // beating quota by 20%+
  quotaBeatShare: 1.2,
  attentionQuietShift: -5,
  attentionQuietWeek: -10,
  attentionGretaWord: -5, // per week, Greta trust ≥ 2
  attentionReport: -40,
  attentionBreadSeen: 10,
  breadSeenChance: 0.35, // not in SPEC
  attentionCoverCaught: 15,
  coverCatchChance: 0.25, // not in SPEC
  coverSeconds: 3,
  breadSeconds: 2,
  attentionGretaReports: 30, // Greta at trust −3 (not in SPEC: size)
  attentionRefuseStatement: 10,

  // Inspection
  sampleChecksFromWeek: 3,
  sampleChance: 1 / 25,
  sampleChanceWatched: 1 / 10,
  amberCatch: 0.2,
  amberCatchWatched: 0.4,
  attentionCaught: 25,

  // World objects (shift clock windows, seconds)
  brandtOut: [20, 35] as [number, number],
  railCar: [25, 45] as [number, number],

  partsPerBreechBlock: 12,
  operatorsOnWerk7: 120,

  tickRate: 60, // Hz
  maxTickDt: 0.25, // seconds; longer gaps (a hidden tab) are clipped
} as const;
