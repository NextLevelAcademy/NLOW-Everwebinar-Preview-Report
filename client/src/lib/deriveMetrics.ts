import type {
  CountryBreakdown,
  CountryGroup,
  OptInRow,
  PreviewMetrics,
  SessionDetails,
  ShowUpRow,
  SignUpRow,
} from "../../../shared/schema";

export interface DerivedReportSlice {
  metrics: PreviewMetrics;
  optInByCountry: CountryBreakdown;
  showUpByCountry: CountryBreakdown;
  signUpByCountry: CountryBreakdown;
}

/**
 * Recomputes every metric and country breakdown from the current Opt-In /
 * Show Up / Sign Up row lists and session details. Used both by the initial
 * report generation and by the report page's inline editing (row edits,
 * country reclassification, session detail changes) so counts and totals
 * always stay in sync with what's on screen.
 */
export function deriveMetrics(
  session: SessionDetails,
  optInRows: OptInRow[],
  showUpRows: ShowUpRow[],
  signUpRows: SignUpRow[]
): DerivedReportSlice {
  const tally = (rows: { country: CountryGroup }[]): CountryBreakdown => {
    const out: CountryBreakdown = {
      SG: 0,
      MY: 0,
      USA: 0,
      HK: 0,
      OTHERS: 0,
      INVALID: 0,
      NA: 0,
    };
    for (const r of rows) out[r.country]++;
    return out;
  };

  const optInByCountry = tally(optInRows);
  const showUpByCountry = tally(showUpRows);
  const signUpByCountry = tally(signUpRows);

  const optInCount = optInRows.length;
  const optInWithoutInvalidCount = optInCount - optInByCountry.INVALID;
  const showUpCount = showUpRows.length;
  // Excludes flagged-invalid opt-ins from the denominator — a fake/placeholder
  // contact was never a real shot at showing up, so it shouldn't drag the
  // percentage down.
  const showUpPct =
    optInWithoutInvalidCount > 0
      ? (showUpCount / optInWithoutInvalidCount) * 100
      : 0;
  const showUpsNotInOptInCount = showUpRows.filter((r) => !r.inOptIn).length;
  const showUpsNotInOptInPct =
    showUpCount > 0 ? (showUpsNotInOptInCount / showUpCount) * 100 : 0;
  const attendanceAtPitch = session.attendanceAtPitch ?? 0;
  const attendanceAtPitchPct =
    showUpCount > 0 ? (attendanceAtPitch / showUpCount) * 100 : 0;
  const signUpCount = signUpRows.length;
  const signUpPct = showUpCount > 0 ? (signUpCount / showUpCount) * 100 : 0;
  const tcTotal = signUpRows
    .filter((s) => s.source !== "BT")
    .reduce((sum, s) => sum + (s.total || 0), 0);
  const btCount = signUpRows.filter((s) => s.source === "BT").length;
  const revenueTotal = tcTotal + btCount * (session.programPrice || 0);

  const signUpsByIntakeForVW: Record<string, number> = {};
  for (const vw of session.vwDates) {
    if (!vw.label) continue;
    const monthSignups = signUpRows.filter(
      (s) => s.intake.toLowerCase() === vw.label.toLowerCase()
    ).length;
    signUpsByIntakeForVW[vw.label] = (vw.pastSignups || 0) + monthSignups;
  }

  const metrics: PreviewMetrics = {
    optInCount,
    optInWithoutInvalidCount,
    showUpCount,
    showUpPct,
    showUpsNotInOptInCount,
    showUpsNotInOptInPct,
    attendanceAtPitch,
    attendanceAtPitchPct,
    signUpCount,
    signUpPct,
    revenueTotal,
    signUpsByIntakeForVW,
  };

  return { metrics, optInByCountry, showUpByCountry, signUpByCountry };
}
