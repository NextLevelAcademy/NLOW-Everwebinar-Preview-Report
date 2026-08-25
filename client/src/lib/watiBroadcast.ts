import * as XLSX from "xlsx";
import type {
  BroadcastType,
  OptInRow,
  ReportData,
  ShowUpRow,
  SignUpRow,
  VWDateEntry,
  WatiContact,
} from "../../../shared/schema";
import { isValidForBroadcast, normalizePhone } from "./phone";

// Which report.* array a WATI broadcast tab's contacts are derived from —
// used to route contact edits/deletes back to the right source table (see
// updateBroadcastContact/deleteBroadcastContact in pages/home.tsx).
export type WatiSourceType = "optIns" | "showUps" | "signUps";
export type ContactPatch = {
  name?: string;
  countryCode?: string;
  phone?: string;
  email?: string;
};

export interface BroadcastDefinition {
  type: BroadcastType;
  label: string;
  description: string;
  templateName: string;
  defaultBroadcastName: string; // user can edit
  /** Path (relative to site root) to the banner image. The frontend resolves this
   * to an absolute URL at send time so WATI can fetch it for the template's media header.
   * Templates without an image header should leave this undefined. */
  bannerPath?: string;
  bannerLabel?: string;
}

// Welcome broadcast definitions are now generated dynamically per VW Date Entry.
// Only static (non-welcome) broadcast types live in this map.
export const BROADCASTS: Record<Exclude<BroadcastType, "may_signups" | "june_signups">, BroadcastDefinition> = {
  showup_no_buy: {
    type: "showup_no_buy",
    label: "Showed Up — No Sign-Up",
    description:
      "Attended live but did not sign up. Sales follow-up template.",
    templateName: "nlow_tues_sales_fu_270226",
    defaultBroadcastName: "NLOW_ShowUp_NoBuy_Followup",
  },
  no_show: {
    type: "no_show",
    label: "No-Show — Did Not Attend",
    description:
      "Opted in via Keap but did NOT appear in the Everwebinar attendance file (registered but didn't show up). Re-engagement template.",
    templateName: "l1nlow_noshow_v1",
    defaultBroadcastName: "NLOW_NoShow_Followup",
  },
};

export interface BroadcastBuild {
  type: BroadcastType | string; // welcome builds use a synthetic id like "welcome:may"
  definition: BroadcastDefinition;
  contacts: WatiContact[];
  excluded: { name: string; email: string; reason: string }[];
  // Populated only for no_show. Count of opt-ins filtered out via the
  // uploaded Tag 4 List CSV (NLOW4 contacts).
  nlow4ExcludedCount?: number;
  // For dynamic welcome builds: the VW label (month text) the user entered.
  vwLabel?: string;
}

function titleCase(s: string): string {
  const t = (s || "").trim();
  if (!t) return t;
  return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
}

// Per-month WATI template override. Months not listed here fall back to the
// default welcome template.
const WELCOME_TEMPLATE_OVERRIDES: Record<string, string> = {
  june: "nlow_welcome_wati_02",
};
const DEFAULT_WELCOME_TEMPLATE = "l2nlmba_tgreminder_update_v1";

function synthWelcomeDefinition(vwLabel: string): BroadcastDefinition {
  const month = titleCase(vwLabel);
  const slug = month.toLowerCase().replace(/[^a-z0-9]+/g, "_");
  const templateName =
    WELCOME_TEMPLATE_OVERRIDES[slug] ?? DEFAULT_WELCOME_TEMPLATE;
  return {
    type: `welcome:${slug}` as unknown as BroadcastType,
    label: `${month} Intake Welcome`,
    description: `Sign-ups whose pricing option indicates the ${month} intake. Welcome message + TG group reminder.`,
    templateName,
    defaultBroadcastName: `NLOW_${month}_Intake_Welcome`,
    bannerPath: `/banners/${slug}.jpg`,
    bannerLabel: `${month} intake banner`,
  };
}

export function buildBroadcasts(
  report: ReportData,
  vwDates?: VWDateEntry[]
): {
  welcomes: BroadcastBuild[];
  showup_no_buy: BroadcastBuild;
  no_show: BroadcastBuild;
} {
  const allSignUps: SignUpRow[] = report.signUps;

  // Build one welcome broadcast per VW Date Entry (matched by month text).
  // Falls back to whatever VW entries were saved on the report's session details
  // if the caller doesn't pass an explicit list.
  const effectiveVwDates: VWDateEntry[] = (vwDates ?? report.sessionDetails?.vwDates ?? []).filter(
    (v) => v && (v.label || "").trim().length > 0
  );

  const welcomes: BroadcastBuild[] = effectiveVwDates.map((vw) => {
    const monthKey = vw.label.trim().toLowerCase();
    const rows = allSignUps.filter(
      (s) => (s.intake || "").trim().toLowerCase() === monthKey
    );
    const definition = synthWelcomeDefinition(vw.label);
    const build = signUpsToBroadcastWithDefinition(definition, rows);
    build.vwLabel = vw.label.trim();
    return build;
  });

  // Exclude anyone who signed up — match by email OR by last 8 digits of the
  // full phone (handles cases where the same person registered with a
  // different email or phone format across the two systems).
  const signUpEmails = new Set(
    allSignUps.map((s) => (s.email || "").toLowerCase()).filter(Boolean)
  );
  const PHONE_TAIL_LEN = 8;
  const phoneTail = (full: string | null | undefined): string => {
    const d = (full || "").replace(/\D/g, "");
    return d.length >= PHONE_TAIL_LEN ? d.slice(-PHONE_TAIL_LEN) : "";
  };
  const signUpPhoneTails = new Set(
    allSignUps.map((s) => phoneTail(s.fullPhone)).filter(Boolean)
  );
  const isSignedUp = (email: string, fullPhone: string): boolean => {
    if (email && signUpEmails.has(email.toLowerCase())) return true;
    const tail = phoneTail(fullPhone);
    if (tail && signUpPhoneTails.has(tail)) return true;
    return false;
  };
  const showUpNoBuy: ShowUpRow[] = report.showUps.filter(
    (a) => !isSignedUp(a.email, a.fullPhone)
  );

  // No-show: opted in via Keap but did NOT show up to webinar.
  const noShowOptIns: OptInRow[] = report.optIns.filter((o) => !o.showedUp);

  // Tag 4 List exclusion (NLOW4) — filter out anyone whose phone (digits-only)
  // or email is in the uploaded Tag 4 List CSV. Empty sets when no CSV uploaded.
  const nlow4Phones = new Set(
    (report.nlow4ExcludedPhones ?? []).map((p) => p.replace(/\D/g, "")).filter(Boolean)
  );
  const nlow4Emails = new Set(
    (report.nlow4ExcludedEmails ?? []).map((e) => e.toLowerCase()).filter(Boolean)
  );
  const noShowOptInsFiltered = noShowOptIns.filter((k) => {
    const phoneDigits = (k.fullPhone || "").replace(/\D/g, "");
    const emailLower = (k.email || "").toLowerCase();
    if (phoneDigits && nlow4Phones.has(phoneDigits)) return false;
    if (emailLower && nlow4Emails.has(emailLower)) return false;
    return true;
  });
  const nlow4ExcludedCount = noShowOptIns.length - noShowOptInsFiltered.length;

  const noShowBuild = optInsToBroadcast("no_show", noShowOptInsFiltered);
  noShowBuild.nlow4ExcludedCount = nlow4ExcludedCount;

  return {
    welcomes,
    showup_no_buy: showUpsToBroadcast("showup_no_buy", showUpNoBuy),
    no_show: noShowBuild,
  };
}

function optInsToBroadcast(
  type: Exclude<BroadcastType, "may_signups" | "june_signups">,
  rows: OptInRow[]
): BroadcastBuild {
  const definition = BROADCASTS[type];
  const contacts: WatiContact[] = [];
  const excluded: { name: string; email: string; reason: string }[] = [];

  for (const r of rows) {
    const np = normalizePhone(r.phoneNumber || r.fullPhone, r.countryCode);
    if (!isValidForBroadcast(np)) {
      excluded.push({
        name: r.fullName,
        email: r.email,
        reason: !np.phone ? "Missing phone" : "Invalid country code",
      });
      continue;
    }
    contacts.push({
      name: r.fullName || r.email || "Customer",
      countryCode: np.countryCode,
      phone: np.phone,
      allowCampaign: true,
      allowSMS: true,
      email: r.email,
    });
  }

  const seen = new Set<string>();
  const dedup = contacts.filter((c) => {
    const key = `${c.countryCode}${c.phone}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return { type, definition, contacts: dedup, excluded };
}

function signUpsToBroadcastWithDefinition(
  definition: BroadcastDefinition,
  rows: SignUpRow[]
): BroadcastBuild {
  const type = definition.type;
  const contacts: WatiContact[] = [];
  const excluded: { name: string; email: string; reason: string }[] = [];

  for (const r of rows) {
    const np = normalizePhone(r.phoneNumber || r.fullPhone, r.countryCode);
    if (!isValidForBroadcast(np)) {
      excluded.push({
        name: r.fullName,
        email: r.email,
        reason: !np.phone ? "Missing phone" : "Invalid country code",
      });
      continue;
    }
    contacts.push({
      name: r.fullName || r.email || "Customer",
      countryCode: np.countryCode,
      phone: np.phone,
      allowCampaign: true,
      allowSMS: true,
      email: r.email,
      intake: r.intake,
    });
  }

  // Dedupe by full phone
  const seen = new Set<string>();
  const dedup = contacts.filter((c) => {
    const key = `${c.countryCode}${c.phone}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return { type, definition, contacts: dedup, excluded };
}

function showUpsToBroadcast(
  type: Exclude<BroadcastType, "may_signups" | "june_signups">,
  rows: ShowUpRow[]
): BroadcastBuild {
  const definition = BROADCASTS[type];
  const contacts: WatiContact[] = [];
  const excluded: { name: string; email: string; reason: string }[] = [];

  for (const r of rows) {
    const np = normalizePhone(r.phoneNumber || r.fullPhone, r.countryCode);
    if (!isValidForBroadcast(np)) {
      excluded.push({
        name: r.fullName,
        email: r.email,
        reason: !np.phone ? "Missing phone" : "Invalid country code",
      });
      continue;
    }
    contacts.push({
      name: r.fullName || r.email || "Attendee",
      countryCode: np.countryCode,
      phone: np.phone,
      allowCampaign: true,
      allowSMS: true,
      email: r.email,
    });
  }

  const seen = new Set<string>();
  const dedup = contacts.filter((c) => {
    const key = `${c.countryCode}${c.phone}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return { type, definition, contacts: dedup, excluded };
}

// Download CSV in WATI's exact format: Name, CountryCode, Phone, AllowCampaign, AllowSMS
export function downloadWatiCsv(build: BroadcastBuild): void {
  const rows: any[][] = [
    ["Name", "CountryCode", "Phone", "AllowCampaign", "AllowSMS"],
    ...build.contacts.map((c) => [
      c.name,
      c.countryCode,
      c.phone,
      c.allowCampaign ? "TRUE" : "FALSE",
      c.allowSMS ? "TRUE" : "FALSE",
    ]),
  ];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const csv = XLSX.utils.sheet_to_csv(ws);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const ds = new Date().toISOString().split("T")[0];
  a.download = `wati-${build.type}-${ds}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
