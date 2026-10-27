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

  // Akkordserie: every streakStep parts in a row add streakMultStep to the points multiplier.
  // Points only: the pay packet doesn't care. Not in SPEC before v2.
  streakStep: 5,
  streakMultStep: 0.5,
  streakMultMax: 3,

  // Part types (weeks 2–6). One or two changes per shift, each costing setup time.
  partsFromWeek: 2,
  setupSeconds: 2,
  fineWidthScale: 0.7, // 'fine' parts: narrower band
  doubleWidthScale: 0.6, // 'double' parts: two narrower bands
  driftSpeed: 0.12, // 'drift' parts: band moves this many gauge widths per second

  // Brandt's task: so many parts within so many seconds, once a shift from week 2.
  tasksFromWeek: 2,
  taskWindow: [12, 38] as [number, number], // when in the shift he calls it
  taskSeconds: 10,
  taskNeedWeek2: 5,
  taskNeedPerWeek: 0.5, // extra parts per week after 2
  taskBonusPoints: 60,
  taskFailAttention: 4,

  // Blanks: the stack beside the press. Fetching more takes you away.
  blanksPerStack: 25,
  blanksSeconds: 2,
  blanksLow: 5,

  // Story
  breakAfterShift: 1, // the week's break scene follows this shift's report
  homeTalkEvening: 2, // the week's talk at home happens on this evening
  letterEvening: 1, // Karl's letters arrive on this evening of weeks 2, 4, 6

  tickRate: 60, // Hz
  maxTickDt: 0.25, // seconds; longer gaps (a hidden tab) are clipped
} as const;
