import * as XLSX from "xlsx";
import type { ReportData, SignUpRow } from "../../../shared/schema";

const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** Format DD/MM/YY or DDMMYY into "DD-Mon-YYYY" (e.g. "13-Jun-2026"). */
function formatSessionDateLong(s: string): string {
  if (!s) return "";
  const compact = s.replace(/\D/g, "");
  if (compact.length === 6) {
    const dd = compact.slice(0, 2);
    const mm = compact.slice(2, 4);
    const yy = compact.slice(4, 6);
    const month = parseInt(mm, 10);
    if (month >= 1 && month <= 12) {
      return `${dd}-${MONTHS_SHORT[month - 1]}-20${yy}`;
    }
  }
  return s;
}

/** DDMMYY suffix for Keap tags. */
function formatDDMMYY(s: string): string {
  if (!s) return "";
  return s.replace(/\D/g, "").padEnd(6, "").slice(0, 6);
}

/** YYYY-MM-DD form of session date for filenames. */
function formatYYYYMMDD(s: string): string {
  if (!s) return "";
  const compact = s.replace(/\D/g, "");
  if (compact.length === 6) {
    const dd = compact.slice(0, 2);
    const mm = compact.slice(2, 4);
    const yy = compact.slice(4, 6);
    return `20${yy}-${mm}-${dd}`;
  }
  return s;
}

/** Strip duplicate name parts (e.g. "k W" stays as "k W" but "Jane Jane" → "Jane Jane" is fine).
 * Helper to format display names consistently. */
function singleName(fullName: string): string {
  return (fullName || "").trim();
}

/** Order of country buckets in the Report sheet breakdowns. */
const COUNTRY_ORDER = ["SG", "MY", "USA", "HK", "OTHERS", "INVALID", "NA"] as const;

export function downloadExcelReport(report: ReportData): void {
  const wb = XLSX.utils.book_new();
  const session = report.sessionDetails;
  const m = report.metrics;
  const sessionLong = formatSessionDateLong(session.sessionDate);
  const ddmmyy = formatDDMMYY(session.sessionDate);
  const yyyymmdd = formatYYYYMMDD(session.sessionDate);

  // ============ Sheet 1: Report ============
  // Layout matches the user's reference workbook exactly.
  //   B/C columns: metric label + value (D column for percentages)
  //   F/G columns: stacked country breakdowns (Opt In → Show Up → Sign Up)
  const reportRows: any[][] = [];

  // Row 1 — title + session date
  reportRows.push(["", "NLOW Everwebinar", ddmmyy || "", "", "", "Opt In", ""]);
  // Row 2 — speaker + first breakdown header
  reportRows.push([
    "", "Speaker", session.speaker ?? "", "", "", "COUNTRY", "TOTAL",
  ]);

  // Build breakdowns stacked in column F/G
  const breakdowns: { title: string; data: Record<string, number> }[] = [
    { title: "Opt In", data: report.optInByCountry as any },
    { title: "Show Up", data: report.showUpByCountry as any },
    { title: "Sign Up", data: report.signUpByCountry as any },
  ];

  // We'll fill column F/G row-by-row while also writing the metric rows
  // in B/C/D. Track current write index for each side.
  const metricRows: any[][] = [
    ["", "Opt In", m.optInCount, ""],
    ["", "Opt In (without Invalid)", m.optInWithoutInvalidCount, ""],
    ["", "Show Up", m.showUpCount, `${m.showUpPct.toFixed(1)}% of valid opt-ins`],
    ["", "Attendance at Pitch", m.attendanceAtPitch, `${m.attendanceAtPitchPct.toFixed(1)}%`],
    ["", "Sign Up", m.signUpCount, `${m.signUpPct.toFixed(1)}%`],
  ];

  // Construct breakdown rows (per breakdown: COUNTRY rows + Grand Total + blank).
  const breakdownLines: { col5: string; col6: any }[] = [];
  // Note: first breakdown's "COUNTRY/TOTAL" header is already in row 2.
  // So the first breakdown's data rows start immediately after.
  for (let b = 0; b < breakdowns.length; b++) {
    const bd = breakdowns[b];
    if (b > 0) {
      // Blank spacer + title + header for subsequent breakdowns.
      breakdownLines.push({ col5: "", col6: "" });
      breakdownLines.push({ col5: bd.title, col6: "" });
      breakdownLines.push({ col5: "COUNTRY", col6: "TOTAL" });
    }
    let total = 0;
    for (const c of COUNTRY_ORDER) {
      const n = (bd.data as any)[c] || 0;
      breakdownLines.push({ col5: c, col6: n });
      total += n;
    }
    breakdownLines.push({ col5: "GRAND TOTAL", col6: total });
  }

  // Merge metric rows (B/C/D) and breakdown lines (F/G) row by row,
  // starting at row 3 (0-indexed 2).
  const maxLines = Math.max(metricRows.length, breakdownLines.length);
  for (let i = 0; i < maxLines; i++) {
    const mRow = metricRows[i] ?? ["", "", "", ""];
    const bLine = breakdownLines[i];
    const row: any[] = [
      mRow[0] || "",
      mRow[1] || "",
      mRow[2] ?? "",
      mRow[3] ?? "",
      "",
      bLine ? bLine.col5 : "",
      bLine ? bLine.col6 : "",
    ];
    reportRows.push(row);
  }

  // Append VW intake totals (B/C) after metrics.
  reportRows.push([]);
  for (const [label, count] of Object.entries(m.signUpsByIntakeForVW)) {
    reportRows.push(["", `Total Signups [${label}] for VW`, count, ""]);
  }

  // Append revenue & program price (below VW totals)
  reportRows.push([]);
  reportRows.push(["", "Total Revenue Generated", m.revenueTotal, ""]);
  reportRows.push(["", "Program Price (SGD)", session.programPrice, ""]);
  // Session date (long form) for human readability
  reportRows.push(["", "Session Date", sessionLong || "", ""]);

  const reportSheet = XLSX.utils.aoa_to_sheet(reportRows);
  reportSheet["!cols"] = [
    { wch: 4 }, { wch: 28 }, { wch: 16 }, { wch: 10 }, { wch: 4 },
    { wch: 18 }, { wch: 12 },
  ];
  XLSX.utils.book_append_sheet(wb, reportSheet, "Report");

  // ============ Sheet 2: Opt In ============
  const optInData = [
    ["First Name", "Email", "Phone Number", "Country", "Show up", "Sign up"],
    ...report.optIns.map((r) => [
      r.firstName,
      r.email,
      r.fullPhone,
      r.country,
      r.showedUp ? r.email : "",
      r.signedUp ? r.email : "",
    ]),
  ];
  const optInSheet = XLSX.utils.aoa_to_sheet(optInData);
  optInSheet["!cols"] = [
    { wch: 16 }, { wch: 30 }, { wch: 18 }, { wch: 10 }, { wch: 30 }, { wch: 30 },
  ];
  XLSX.utils.book_append_sheet(wb, optInSheet, "Opt In");

  // ============ Sheet 3: Show Up ============
  const showUpData = [
    ["Name", "Email", "Phone Number", "Country", "Time in Room", "Sign up"],
    ...report.showUps.map((r) => [
      singleName(`${r.firstName} ${r.lastName}`.trim()),
      r.email,
      r.fullPhone,
      r.country,
      r.timeInRoom,
      r.signedUp ? r.email : "",
    ]),
  ];
  const showUpSheet = XLSX.utils.aoa_to_sheet(showUpData);
  showUpSheet["!cols"] = [
    { wch: 22 }, { wch: 30 }, { wch: 18 }, { wch: 10 }, { wch: 14 }, { wch: 30 },
  ];
  XLSX.utils.book_append_sheet(wb, showUpSheet, "Show Up");

  // ============ Sheet 4: Sign Up ============
  const sourceLabel = (src: SignUpRow["source"]) =>
    src === "TC" ? "ThriveCart" : src === "BT" ? "Bank Transfer" : "ThriveCart+BT";
  const signUpData = [
    ["Name", "Email", "Phone Number", "Country", "Source", "Intake", "Show up"],
    ...report.signUps.map((s) => [
      s.fullName,
      s.email,
      s.fullPhone,
      s.country,
      sourceLabel(s.source),
      s.intake,
      s.showedUp ? s.email : "",
    ]),
  ];
  const signUpSheet = XLSX.utils.aoa_to_sheet(signUpData);
  signUpSheet["!cols"] = [
    { wch: 22 }, { wch: 30 }, { wch: 18 }, { wch: 10 }, { wch: 14 }, { wch: 18 }, { wch: 30 },
  ];
  XLSX.utils.book_append_sheet(wb, signUpSheet, "Sign Up");

  // ============ Sheet 5: Keap Workings ============
  // Tag rules (same as before):
  //   Show-up + in opt-in + NOT signed up      → NLOW3,NLOW3-DDMMYY
  //   Show-up + in opt-in + signed up          → NLOW3,NLOW3-DDMMYY,NLOW4,NLOW4-DDMMYY
  //   Show-up NOT in opt-in + NOT signed up    → NLOW3,NLOW3-DDMMYY,NLOW2,NLOW2-DDMMYY
  //   Sign-up + show-up + NOT in opt-in        → NLOW3,NLOW3-DDMMYY,NLOW4,NLOW4-DDMMYY,NLOW2,NLOW2-DDMMYY
  //   Sign-up only (no show-up) + in opt-in    → NLOW4,NLOW4-DDMMYY
  //   Sign-up only (no show-up) + NOT in opt-in→ NLOW4,NLOW4-DDMMYY,NLOW2,NLOW2-DDMMYY
  const hasDate = ddmmyy.length === 6;
  const tagBaseSuffix = hasDate ? `,NLOW3-${ddmmyy}` : "";
  const tagN2Suffix = hasDate ? `,NLOW2-${ddmmyy}` : "";
  const tagN4Suffix = hasDate ? `,NLOW4-${ddmmyy}` : "";

  type WorkingRow = { first: string; email: string; phone: string; tags: string };
  const workings: WorkingRow[] = [];
  const handledEmails = new Set<string>();

  for (const su of report.showUps) {
    if (!su.inOptIn) continue;
    const tags = su.signedUp
      ? `NLOW3${tagBaseSuffix},NLOW4${tagN4Suffix}`
      : `NLOW3${tagBaseSuffix}`;
    workings.push({ first: su.firstName, email: su.email, phone: su.fullPhone, tags });
    if (su.email) handledEmails.add(su.email.toLowerCase());
  }

  const signedUpEmailsLc = new Set(
    report.signUps.map((s) => (s.email || "").toLowerCase()).filter(Boolean)
  );
  for (const r of report.showUpsNotInOptIn) {
    const lc = (r.email || "").toLowerCase();
    if (signedUpEmailsLc.has(lc)) continue;
    const [first] = (r.fullName || "").split(/\s+/);
    workings.push({
      first: first || r.fullName,
      email: r.email,
      phone: r.fullPhone,
      tags: `NLOW3${tagBaseSuffix},NLOW2${tagN2Suffix}`,
    });
    if (lc) handledEmails.add(lc);
  }

  for (const s of report.signUps) {
    const lc = (s.email || "").toLowerCase();
    if (lc && handledEmails.has(lc)) continue;
    const [first] = (s.fullName || "").split(/\s+/);
    const parts: string[] = [];
    if (s.showedUp) parts.push(`NLOW3${tagBaseSuffix}`);
    parts.push(`NLOW4${tagN4Suffix}`);
    if (!s.inOptIn) parts.push(`NLOW2${tagN2Suffix}`);
    workings.push({
      first: first || s.fullName,
      email: s.email,
      phone: s.fullPhone,
      tags: parts.join(","),
    });
    if (lc) handledEmails.add(lc);
  }

  const keapWorkingsData = [
    ["First Name", "Email", "Phone 1", "Tags"],
    ...workings.map((w) => [w.first, w.email, w.phone, w.tags]),
  ];
  const keapWorkingsSheet = XLSX.utils.aoa_to_sheet(keapWorkingsData);
  keapWorkingsSheet["!cols"] = [
    { wch: 16 }, { wch: 30 }, { wch: 18 }, { wch: 60 },
  ];
  XLSX.utils.book_append_sheet(wb, keapWorkingsSheet, "Keap Workings");

  // ============ Sheet 6: Show Up Not In Opt-In ============
  const notInOptInData = [
    ["Name", "Email", "Phone Number", "Country"],
    ...report.showUpsNotInOptIn.map((r) => [
      r.fullName,
      r.email,
      r.fullPhone,
      r.country,
    ]),
  ];
  const notInOptInSheet = XLSX.utils.aoa_to_sheet(notInOptInData);
  notInOptInSheet["!cols"] = [
    { wch: 22 }, { wch: 30 }, { wch: 18 }, { wch: 10 },
  ];
  XLSX.utils.book_append_sheet(wb, notInOptInSheet, "Show Up Not In Opt-In");

  // ============ Sheet 7: Students List ============
  // One row per sign-up. Columns map from sign-up data:
  //   Name, Email Address, Mobile (full phone), Mobile Country Code (country),
  //   Welcome WATI (blank), TM (blank), Affiliate ID ("-"),
  //   Preview Date (session date long), Original Intake Selected (intake + workshop),
  //   Enrolment Date (order date long), Currency ("SGD"),
  //   Course Fee w GST (programPrice), Amount Paid (s.total),
  //   Payment Gateway ("stripe" / "Bank Transfer" / "ThriveCart+BT").
  const gateway = (src: SignUpRow["source"]) =>
    src === "TC" ? "stripe" : src === "BT" ? "Bank Transfer" : "ThriveCart+BT";

  // Convert orderDate to long form if it's parseable.
  const formatOrderDate = (raw: string): string => {
    if (!raw) return sessionLong;
    // Accept ISO YYYY-MM-DD, DD/MM/YY, or raw date strings.
    const d = new Date(raw);
    if (!isNaN(d.getTime())) {
      const dd = String(d.getDate()).padStart(2, "0");
      const mon = MONTHS_SHORT[d.getMonth()];
      const yyyy = d.getFullYear();
      return `${dd}-${mon}-${yyyy}`;
    }
    return raw;
  };

  const studentsListData = [
    [
      "Name", "Email Address", "Mobile", "Mobile Country Code", "Welcome WATI",
      "TM", "Affiliate ID", "Preview Date", "Original Intake Selected",
      "Enrolment Date", "Currency", "Course Fee w GST", "Amount Paid",
      "Payment Gateway (e.g PayPal, Stripe, Bank Transfer)",
    ],
    ...report.signUps.map((s) => [
      s.fullName,
      s.email,
      s.fullPhone,
      s.country,
      "",
      "",
      "-",
      sessionLong,
      s.intake ? `${s.intake} Options MBA Workshop` : "",
      formatOrderDate(s.orderDate),
      "SGD",
      session.programPrice.toFixed(2),
      (s.total ?? session.programPrice).toFixed(2),
      gateway(s.source),
    ]),
  ];
  const studentsListSheet = XLSX.utils.aoa_to_sheet(studentsListData);
  studentsListSheet["!cols"] = [
    { wch: 22 }, { wch: 30 }, { wch: 18 }, { wch: 18 }, { wch: 14 },
    { wch: 8 }, { wch: 12 }, { wch: 14 }, { wch: 32 }, { wch: 14 },
    { wch: 10 }, { wch: 16 }, { wch: 14 }, { wch: 36 },
  ];
  XLSX.utils.book_append_sheet(wb, studentsListSheet, "Students List");

  // Filename — match target convention: NLOW_Preview_Report_YYYY-MM-DD-1.xlsx
  const safeDate = yyyymmdd || new Date().toISOString().split("T")[0];
  const filename = `NLOW_Preview_Report_${safeDate}-1.xlsx`;
  XLSX.writeFile(wb, filename);
}
