import { z } from "zod";

// ===== WATI Broadcast types =====

// Contact accepts either {countryCode, phone} (UI build) or {whatsappNumber}
// (compact API payload). After parsing, both shapes resolve to countryCode+phone.
const baseContactSchema = z.object({
  name: z.string().default(""),
  allowCampaign: z.boolean().optional().default(true),
  allowSMS: z.boolean().optional().default(true),
  email: z.string().optional(),
  intake: z.string().optional(),
});

const splitContact = baseContactSchema.extend({
  countryCode: z.string(),
  phone: z.string(),
});

const wholeContact = baseContactSchema.extend({
  whatsappNumber: z.string(),
});

export const watiContactSchema = z
  .union([splitContact, wholeContact])
  .transform((c) => {
    if ("whatsappNumber" in c) {
      const digits = c.whatsappNumber.replace(/\D/g, "");
      return {
        name: c.name ?? "",
        countryCode: digits, // entire number lives here; phone is empty
        phone: "",
        allowCampaign: c.allowCampaign ?? true,
        allowSMS: c.allowSMS ?? true,
        email: c.email,
        intake: c.intake,
      };
    }
    return {
      name: c.name ?? "",
      countryCode: c.countryCode,
      phone: c.phone,
      allowCampaign: c.allowCampaign ?? true,
      allowSMS: c.allowSMS ?? true,
      email: c.email,
      intake: c.intake,
    };
  });

export type WatiContact = z.infer<typeof watiContactSchema>;

export const broadcastTypeSchema = z.enum([
  "may_signups",
  "june_signups",
  "showup_no_buy",
  "no_show",
]);
export type BroadcastType = z.infer<typeof broadcastTypeSchema>;

// sendBroadcastSchema accepts both the UI shape (templateName/broadcastName,
// broadcastType) and a minimal API shape (template, contacts only).
export const sendBroadcastSchema = z
  .object({
    // Accept any string — dynamic Welcome broadcasts use synthetic ids like
    // "welcome:june", so we no longer enforce the legacy enum here. The server
    // doesn't route on this value; it's just passed through for audit/logging.
    broadcastType: z.string().optional(),
    templateName: z.string().optional(),
    template: z.string().optional(),
    broadcastName: z.string().optional(),
    contacts: z.array(watiContactSchema).min(1),
    mediaUrl: z.string().url().optional(),
  })
  .transform((d) => {
    const templateName = d.templateName ?? d.template;
    if (!templateName) {
      throw new Error("templateName (or template) is required");
    }
    return {
      broadcastType: d.broadcastType,
      templateName,
      broadcastName:
        d.broadcastName ?? `${templateName}_${new Date().toISOString().slice(0, 10)}`,
      contacts: d.contacts,
      mediaUrl: d.mediaUrl,
    };
  });

export type SendBroadcastRequest = z.infer<typeof sendBroadcastSchema>;

// ===== Report data types =====

export type CountryGroup =
  | "SG"
  | "MY"
  | "USA"
  | "HK"
  | "OTHERS"
  | "INVALID"
  | "NA";

export interface VWDateEntry {
  label: string; // e.g. "May"
  pastSignups: number;
}

export interface SessionDetails {
  sessionDate: string; // "DD/MM/YY" or "DDMMYY"
  attendanceAtPitch: number | null;
  programPrice: number; // default 297
  vwDates: VWDateEntry[];
  speaker?: string; // optional, shown on Excel Report sheet (e.g. "Bjorn")
}

export interface PreviewMetrics {
  optInCount: number;
  optInWithoutInvalidCount: number; // optInCount minus flagged-INVALID opt-ins
  showUpCount: number;
  showUpPct: number; // % of opt-in EXCLUDING flagged-invalid opt-ins
  showUpsNotInOptInCount: number;
  showUpsNotInOptInPct: number; // % of show-ups
  attendanceAtPitch: number; // from session details
  attendanceAtPitchPct: number; // % of show-up
  signUpCount: number; // TC + BT (incl. those not in opt-in)
  signUpPct: number; // % of show-ups
  revenueTotal: number;
  signUpsByIntakeForVW: Record<string, number>; // {May: 12, June: 6}
}

export interface OptInRow {
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
  countryCode: string; // from Keap
  phoneNumber: string; // local digits
  fullPhone: string;
  country: CountryGroup;
  showedUp: boolean; // matched in show up by email
  signedUp: boolean; // matched in sign up by email
  source: "keap" | "showup_only"; // showup_only = appended at bottom of opt-in sheet
}

export interface ShowUpRow {
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
  countryCode: string;
  phoneNumber: string;
  fullPhone: string;
  country: CountryGroup;
  timeInRoom: string;
  signedUp: boolean;
  inOptIn: boolean;
}

export interface SignUpRow {
  fullName: string;
  email: string;
  countryCode: string;
  phoneNumber: string;
  fullPhone: string;
  country: CountryGroup;
  source: "TC" | "BT" | "TC+BT";
  intake: string; // "May", "June", or other
  pricingOption: string;
  total: number;
  orderDate: string;
  showedUp: boolean;
  inOptIn: boolean;
}

export interface ShowUpNotInOptInRow {
  fullName: string;
  email: string;
  fullPhone: string;
  country: CountryGroup;
}

export interface CountryBreakdown {
  SG: number;
  MY: number;
  USA: number;
  HK: number;
  OTHERS: number;
  INVALID: number;
  NA: number;
}

export interface ReportData {
  sessionDetails: SessionDetails;
  metrics: PreviewMetrics;
  optInByCountry: CountryBreakdown;
  showUpByCountry: CountryBreakdown;
  signUpByCountry: CountryBreakdown;
  optIns: OptInRow[];
  showUps: ShowUpRow[];
  signUps: SignUpRow[];
  showUpsNotInOptIn: ShowUpNotInOptInRow[];
  generatedAt: string;
  // Tag 4 List exclusion (NLOW4) — contacts in the uploaded Tag 4 CSV are
  // filtered out of the No-Show broadcast only. Match by normalized phone
  // (primary) with email fallback. Empty when no Tag 4 CSV was uploaded.
  nlow4ExcludedPhones?: string[];
  nlow4ExcludedEmails?: string[];
}
