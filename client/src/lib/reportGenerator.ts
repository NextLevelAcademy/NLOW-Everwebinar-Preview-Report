import type {
  CountryGroup,
  OptInRow,
  ReportData,
  SessionDetails,
  ShowUpRow,
  SignUpRow,
} from "../../../shared/schema";
import { parseCsv, getVal } from "./csvParse";
import { deriveMetrics } from "./deriveMetrics";

// ============ Phone helpers (raw, kept here for clarity) ============

function digits(s: string | null | undefined): string {
  return (s || "").replace(/\D/g, "");
}

/**
 * Build full international phone digits (no plus). Logic:
 * - If cc is provided AND phone does NOT already start with cc → fullPhone = cc + phone
 * - If cc is provided AND phone starts with cc → fullPhone = phone (avoid double prefix)
 * - If cc is empty → fullPhone = phone
 */
function buildFullPhone(rawCc: string, rawPhone: string): {
  countryCode: string;
  phoneNumber: string;
  fullPhone: string;
} {
  const cc = digits(rawCc);
  const ph = digits(rawPhone);
  if (!cc && !ph) return { countryCode: "", phoneNumber: "", fullPhone: "" };
  if (!cc) return { countryCode: "", phoneNumber: ph, fullPhone: ph };
  if (!ph) return { countryCode: cc, phoneNumber: "", fullPhone: cc };
  // Concatenate cc + phone always (matches original behavior — even when phone
  // already starts with cc, the original Edmund Tan row shows "656592392229").
  return { countryCode: cc, phoneNumber: ph, fullPhone: cc + ph };
}

/**
 * Country grouping for an Everwebinar (or generic) row.
 * Rules derived from the original NLOW report behavior:
 *  - Only inspect the raw `phone` field digits (NOT cc + phone).
 *  - If the phone field is empty → NA
 *  - If phone field starts with `65` and is 10 digits → SG
 *  - Else if phone field starts with `60` and is 11–12 digits → MY
 *  - Else → OTHERS
 *  - When cc is provided in addition to phone, country is OTHERS unless an
 *    explicit Keap match overrides it (since the EW phone field already has
 *    the trunk-stripped local digits).
 */
function detectCountryFromEW(rawCc: string, rawPhone: string): CountryGroup {
  const cc = digits(rawCc);
  const ph = digits(rawPhone);
  if (!cc && !ph) return "NA";
  // Prefer the explicit EW country code when present.
  if (cc === "65") return "SG";
  if (cc === "60") return "MY";
  if (cc === "1") return "USA";
  if (cc === "852") return "HK";
  if (cc) return "OTHERS";
  // cc empty → look at phone digits as full int'l number
  if (/^65\d{8}$/.test(ph)) return "SG";
  if (/^60\d{9,10}$/.test(ph)) return "MY";
  if (/^852\d{8}$/.test(ph)) return "HK";
  if (/^1\d{10}$/.test(ph)) return "USA";
  // Bare 8-digit SG (6/8/9 prefix)
  if (/^[689]\d{7}$/.test(ph)) return "SG";
  // Numbers too short/long to be a valid local mobile → INVALID
  if (ph.length < 7 || ph.length > 15) return "INVALID";
  return "OTHERS";
}

/** Country grouping for a Keap row.
 * Prefers explicit Mobile Country Code; falls back to parsing the phone field
 * which may contain a +cc prefix or full international digits (e.g. 6591234567,
 * 60123456789, +85291234567) — common when Keap exports without the cc column.
 */
function detectCountryFromKeap(rawCc: string, rawPhone: string = ""): CountryGroup {
  const cc = digits(rawCc);
  if (cc === "65") return "SG";
  if (cc === "60") return "MY";
  if (cc === "1") return "USA";
  if (cc === "852") return "HK";
  if (cc) return "OTHERS";
  // No explicit cc — inspect the phone field for an embedded country code.
  const ph = digits(rawPhone);
  if (!ph) return "NA";
  // International prefixes
  if (/^65[689]\d{7}$/.test(ph)) return "SG";
  if (/^60\d{9,10}$/.test(ph)) return "MY";
  if (/^852\d{8}$/.test(ph)) return "HK";
  if (/^1\d{10}$/.test(ph)) return "USA";
  // Bare 8-digit SG local (starts with 6/8/9) — common when cc is absent
  if (/^[689]\d{7}$/.test(ph)) return "SG";
  // Bare MY local (10-11 digits starting with 1)
  if (/^1\d{9,10}$/.test(ph)) return "MY";
  // Malformed (too short or too long)
  if (ph.length < 7 || ph.length > 15) return "INVALID";
  return "OTHERS";
}

/** Country grouping for a TC / BT row using fullPhone digits.
 * Recognizes bare 8-digit SG locals (starting with 6/8/9) and bare MY locals
 * (10-11 digits starting with 1) in addition to numbers with explicit cc. */
function detectCountryFromFullPhone(fullPhone: string): CountryGroup {
  const ph = digits(fullPhone);
  if (!ph) return "NA";
  if (/^65[689]\d{7}$/.test(ph)) return "SG";
  if (/^60\d{9,10}$/.test(ph)) return "MY";
  if (/^852\d{8}$/.test(ph)) return "HK";
  if (/^1\d{10}$/.test(ph)) return "USA";
  // Bare SG local (8 digits, starts with 6/8/9) — no cc prefix
  if (/^[689]\d{7}$/.test(ph)) return "SG";
  // Bare MY local (10-11 digits starting with 1) — e.g. 1XXXXXXXXX
  if (/^1\d{9,10}$/.test(ph)) return "MY";
  if (ph.length < 7 || ph.length > 15) return "INVALID";
  return "OTHERS";
}

// ============ Parsing ============

interface KeapRow {
  first: string;
  last: string;
  email: string;
  cc: string;
  phone: string;
}

function parseKeapRows(rows: Record<string, any>[]): KeapRow[] {
  return rows
    .map((r) => ({
      first: getVal(r, ["First Name", "FirstName"]),
      last: getVal(r, ["Last Name", "LastName"]),
      email: getVal(r, ["Email", "Email Address"]).toLowerCase(),
      cc: getVal(r, ["Mobile Country Code", "Country Code", "PhoneCountryCode"]),
      phone: getVal(r, ["Phone 1", "Phone", "Mobile", "Mobile Phone"]),
    }))
    .filter((r) => r.email);
}

/**
 * Identifies opt-in contacts whose phone number is a placeholder rather than
 * a real one, in real spam clusters:
 *  - The same phone number is reused across 3+ otherwise-unrelated
 *    contacts (a shared placeholder number, not a real one per person).
 *  - The number itself is a placeholder pattern — 6 or more of the same
 *    digit in a row (e.g. "95111111") — which real mobile numbers don't
 *    produce.
 * Returns the set of flagged emails; callers override those rows' country
 * to INVALID. Rows can still be manually reclassified on the report page
 * if this over-flags a genuine contact.
 */
function computeGibberishFlags(rows: KeapRow[]): Set<string> {
  const phoneCounts = new Map<string, number>();
  const phoneByEmail = new Map<string, string>();
  for (const r of rows) {
    const { fullPhone } = buildFullPhone(r.cc, r.phone);
    if (fullPhone) phoneCounts.set(fullPhone, (phoneCounts.get(fullPhone) || 0) + 1);
    if (r.email) phoneByEmail.set(r.email, fullPhone);
  }
  const repeatedDigitRun = /(\d)\1{5,}/; // same digit 6+ times in a row
  const flagged = new Set<string>();
  for (const r of rows) {
    if (!r.email) continue;
    const fullPhone = phoneByEmail.get(r.email) || "";
    const sharedPhone = !!fullPhone && (phoneCounts.get(fullPhone) || 0) >= 3;
    const placeholderPhone = !!fullPhone && repeatedDigitRun.test(fullPhone);
    if (sharedPhone || placeholderPhone) flagged.add(r.email);
  }
  return flagged;
}

interface EWRow {
  first: string;
  last: string;
  email: string;
  cc: string;
  phone: string;
  attendedLive: boolean;
  timeInRoom: string;
}

function parseEWRows(rows: Record<string, any>[]): EWRow[] {
  return rows
    .map((r) => ({
      first: getVal(r, ["First name", "First Name", "FirstName"]),
      last: getVal(r, ["Last name", "Last Name", "LastName"]),
      email: getVal(r, ["Email", "Email Address"]).toLowerCase(),
      cc: getVal(r, ["Phone country code", "Country code", "PhoneCountryCode"]),
      phone: getVal(r, ["Phone number", "Phone", "PhoneNumber"]),
      attendedLive: /yes|true|1/i.test(getVal(r, ["Attended live", "AttendedLive"])),
      timeInRoom: getVal(r, ["Time in live room", "Time in Room", "TimeInRoom"]),
    }))
    .filter((r) => r.email || r.phone);
}

interface TCRow {
  first: string;
  last: string;
  email: string;
  phone: string; // already includes country code in most cases
  total: number;
  pricingOption: string;
  orderDate: string;
}

function parseTCRows(rows: Record<string, any>[]): TCRow[] {
  return rows
    .map((r) => {
      const totalStr = getVal(r, ["total", "Total", "amount"]);
      const total = parseFloat(totalStr.replace(/[^0-9.\-]/g, "")) || 0;
      return {
        first: getVal(r, ["customer_first_name", "first_name", "Customer First Name", "First Name"]),
        last: getVal(r, ["customer_last_name", "last_name", "Customer Last Name", "Last Name"]),
        email: getVal(r, ["customer_email", "email", "Customer Email", "Email"]).toLowerCase(),
        phone: getVal(r, [
          "customer_phone",
          "phone",
          "Phone",
          "telephone",
          "Telephone",
          "customer_telephone",
        ]),
        total,
        pricingOption: getVal(r, ["relevant_item_pricing_option", "pricing_option", "Pricing Option"]),
        orderDate: getVal(r, ["order_date", "Order Date", "date"]),
      };
    })
    .filter((r) => r.email);
}

interface BTRow {
  fullName: string;
  email: string;
  phone: string;
  intakeDate: string;
  // Matches nlow-zoom-preview BT format: optional Price column. Not currently
  // wired into the Everwebinar sign-up totals (TC drives totals) — kept here
  // so the same sample CSV parses cleanly without dropping the column.
  price: number;
}

function parseBTRows(rows: Record<string, any>[]): BTRow[] {
  return rows
    .map((r) => {
      const first = getVal(r, ["First Name", "FirstName", "first_name"]);
      const last = getVal(r, ["Last Name", "LastName", "last_name"]);
      const fullNameDirect = getVal(r, [
        "Name",
        "Full Name",
        "FullName",
        "name",
      ]);
      const priceRaw = getVal(r, [
        "Price",
        "price",
        "Amount",
        "amount",
        "Total",
        "total",
      ]);
      const priceNum = Number(String(priceRaw).replace(/[^0-9.\-]/g, ""));
      return {
        fullName: fullNameDirect || `${first} ${last}`.trim(),
        email: getVal(r, ["Email", "email", "Email Address"]).toLowerCase(),
        phone: getVal(r, [
          "Phone Number",
          "phone number",
          "Phone",
          "phone",
          "Mobile",
          "telephone",
          "Telephone",
        ]),
        intakeDate: getVal(r, [
          "Date",
          "date",
          "Intake",
          "intake",
          "Intake Date",
          "intake_date",
          "Month",
          "month",
        ]),
        price: Number.isFinite(priceNum) ? priceNum : 0,
      };
    })
    .filter((r) => r.email || r.phone);
}

// ============ Intake extraction ============

const MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

export function extractIntake(s: string): string {
  if (!s) return "";
  const lower = s.toLowerCase();
  for (const m of MONTHS) {
    if (lower.includes(m)) {
      return m.charAt(0).toUpperCase() + m.slice(1);
    }
  }
  return "";
}

// ============ Main entry ============

export interface UploadedFiles {
  keapFile: File;
  everWebinarFile: File;
  thriveCartFile: File;
  bankTransferFile?: File | null;
  // Optional Tag 4 List (NLOW4) export from Keap. Same header format as the
  // main Keap opt-in CSV (First Name, Phone 1, Email). Contacts in this list
  // are excluded from the No-Show broadcast.
  nlow4File?: File | null;
}

export async function generateReport(
  files: UploadedFiles,
  session: SessionDetails
): Promise<ReportData> {
  const [keapRaw, ewRaw, tcRaw, btRaw, nlow4Raw] = await Promise.all([
    parseCsv<Record<string, any>>(files.keapFile),
    parseCsv<Record<string, any>>(files.everWebinarFile),
    parseCsv<Record<string, any>>(files.thriveCartFile),
    files.bankTransferFile
      ? parseCsv<Record<string, any>>(files.bankTransferFile)
      : Promise.resolve([]),
    files.nlow4File
      ? parseCsv<Record<string, any>>(files.nlow4File)
      : Promise.resolve([]),
  ]);

  const keap = parseKeapRows(keapRaw);
  const gibberishEmails = computeGibberishFlags(keap);
  const ew = parseEWRows(ewRaw);
  const tc = parseTCRows(tcRaw);
  const bt = parseBTRows(btRaw);
  // Tag 4 List (NLOW4) — same Keap export format. Collect both normalized
  // phones (cc + phone, digits only) and emails so buildBroadcasts can match
  // by either when filtering the No-Show audience.
  const nlow4Rows = parseKeapRows(nlow4Raw);
  const nlow4ExcludedPhones: string[] = [];
  const nlow4ExcludedEmails: string[] = [];
  for (const r of nlow4Rows) {
    const built = buildFullPhone(r.cc, r.phone);
    if (built.fullPhone) nlow4ExcludedPhones.push(built.fullPhone);
    if (r.email) nlow4ExcludedEmails.push(r.email.toLowerCase());
  }

  // Index by email for joins
  const keapByEmail = new Map<string, KeapRow>();
  for (const k of keap) if (k.email) keapByEmail.set(k.email, k);
  const ewByEmail = new Map<string, EWRow>();
  for (const e of ew) if (e.email) ewByEmail.set(e.email, e);

  // ===== Sign-ups (TC + BT) =====
  const signUpRows: SignUpRow[] = [];
  const seenSignupEmails = new Map<string, SignUpRow>();

  for (const r of tc) {
    const fullName = `${r.first} ${r.last}`.trim() || r.email;
    // Phone resolution priority:
    //   1. EW row with explicit cc+phone (most reliable: EW splits country code
    //      cleanly and is unaffected by keap's scientific-notation truncation).
    //   2. TC's own phone (already int'l in most cases like 6592726038).
    //   3. Keap row (last resort — may be corrupted by Excel autoformatting).
    let cc = "";
    let phoneLocal = "";
    let fullPhone = "";
    const ewMatch = ewByEmail.get(r.email);
    if (ewMatch && digits(ewMatch.cc) && digits(ewMatch.phone).length >= 6) {
      const built = buildFullPhone(ewMatch.cc, ewMatch.phone);
      cc = built.countryCode;
      phoneLocal = built.phoneNumber;
      fullPhone = built.fullPhone;
    } else if (r.phone) {
      const ph = digits(r.phone);
      // TC phone usually already includes country code (e.g. 6592726038)
      if (/^65\d{8}$/.test(ph)) {
        cc = "65"; phoneLocal = ph.slice(2); fullPhone = ph;
      } else if (/^60\d{9,10}$/.test(ph)) {
        cc = "60"; phoneLocal = ph.slice(2); fullPhone = ph;
      } else if (ewMatch && digits(ewMatch.phone).length >= 6) {
        // TC phone unparseable but EW has a phone (no cc) — still use EW phone
        const built = buildFullPhone(ewMatch.cc, ewMatch.phone);
        cc = built.countryCode; phoneLocal = built.phoneNumber; fullPhone = built.fullPhone;
      } else {
        // best-effort: keep raw digits, no cc detected
        cc = ""; phoneLocal = ph; fullPhone = ph;
      }
    } else {
      const k = keapByEmail.get(r.email);
      if (k) {
        const built = buildFullPhone(k.cc, k.phone);
        cc = built.countryCode; phoneLocal = built.phoneNumber; fullPhone = built.fullPhone;
      }
    }
    // Country: when we sourced phone from EW, prefer EW's cc-based detection
    let country: CountryGroup;
    if (ewMatch && digits(ewMatch.cc)) {
      country = detectCountryFromEW(ewMatch.cc, ewMatch.phone);
    } else {
      country = detectCountryFromFullPhone(fullPhone);
    }
    const showedUp = ewByEmail.has(r.email) && ewByEmail.get(r.email)!.attendedLive;
    const inOptIn = keapByEmail.has(r.email);
    const signUp: SignUpRow = {
      fullName,
      email: r.email,
      countryCode: cc,
      phoneNumber: phoneLocal,
      fullPhone,
      country,
      source: "TC",
      intake: extractIntake(r.pricingOption),
      pricingOption: r.pricingOption,
      total: r.total,
      orderDate: r.orderDate,
      showedUp,
      inOptIn,
    };
    seenSignupEmails.set(r.email, signUp);
    signUpRows.push(signUp);
  }

  for (const r of bt) {
    const existing = r.email ? seenSignupEmails.get(r.email) : undefined;
    if (existing) {
      existing.source = "TC+BT";
      continue;
    }
    // Same priority as TC: EW (cc+phone) → BT phone → Keap.
    let cc = "";
    let phoneLocal = "";
    let fullPhone = "";
    const ewMatch = r.email ? ewByEmail.get(r.email) : undefined;
    if (ewMatch && digits(ewMatch.cc) && digits(ewMatch.phone).length >= 6) {
      const built = buildFullPhone(ewMatch.cc, ewMatch.phone);
      cc = built.countryCode; phoneLocal = built.phoneNumber; fullPhone = built.fullPhone;
    } else if (r.phone) {
      const ph = digits(r.phone);
      if (/^65\d{8}$/.test(ph)) {
        cc = "65"; phoneLocal = ph.slice(2); fullPhone = ph;
      } else if (/^60\d{9,10}$/.test(ph)) {
        cc = "60"; phoneLocal = ph.slice(2); fullPhone = ph;
      } else if (/^[689]\d{7}$/.test(ph)) {
        // SG bare 8-digit local
        cc = "65"; phoneLocal = ph; fullPhone = "65" + ph;
      } else if (ewMatch && digits(ewMatch.phone).length >= 6) {
        const built = buildFullPhone(ewMatch.cc, ewMatch.phone);
        cc = built.countryCode; phoneLocal = built.phoneNumber; fullPhone = built.fullPhone;
      } else {
        cc = ""; phoneLocal = ph; fullPhone = ph;
      }
    } else {
      const k = r.email ? keapByEmail.get(r.email) : undefined;
      if (k) {
        const built = buildFullPhone(k.cc, k.phone);
        cc = built.countryCode; phoneLocal = built.phoneNumber; fullPhone = built.fullPhone;
      }
    }
    let country: CountryGroup;
    if (ewMatch && digits(ewMatch.cc)) {
      country = detectCountryFromEW(ewMatch.cc, ewMatch.phone);
    } else {
      country = detectCountryFromFullPhone(fullPhone);
    }
    const showedUp = !!(r.email && ewByEmail.get(r.email)?.attendedLive);
    const inOptIn = !!(r.email && keapByEmail.has(r.email));
    const signUp: SignUpRow = {
      fullName: r.fullName || r.email,
      email: r.email,
      countryCode: cc,
      phoneNumber: phoneLocal,
      fullPhone,
      country,
      source: "BT",
      intake: extractIntake(r.intakeDate),
      pricingOption: r.intakeDate,
      total: 0,
      orderDate: r.intakeDate,
      showedUp,
      inOptIn,
    };
    if (r.email) seenSignupEmails.set(r.email, signUp);
    signUpRows.push(signUp);
  }

  const signUpEmails = new Set(
    signUpRows.map((s) => (s.email || "").toLowerCase()).filter(Boolean)
  );
  // Phone-tail cross-reference: same person may appear in show-up and sign-up
  // with different emails (e.g. work vs personal) or slightly different phone
  // formats (with vs without country-code prefix). Match by last 8 digits of
  // fullPhone — covers SG/MY 8-digit locals without false positives.
  const PHONE_TAIL_LEN = 8;
  const phoneTail = (full: string | null | undefined): string => {
    const d = (full || "").replace(/\D/g, "");
    return d.length >= PHONE_TAIL_LEN ? d.slice(-PHONE_TAIL_LEN) : "";
  };
  const signUpPhoneTails = new Set(
    signUpRows.map((s) => phoneTail(s.fullPhone)).filter(Boolean)
  );
  const isSignedUp = (email: string, fullPhone: string): boolean => {
    if (email && signUpEmails.has(email.toLowerCase())) return true;
    const tail = phoneTail(fullPhone);
    if (tail && signUpPhoneTails.has(tail)) return true;
    return false;
  };
  const showedUpEmails = new Set(ew.filter((e) => e.attendedLive).map((e) => e.email));

  // ===== Show-Ups (from EW) =====
  const showUpRows: ShowUpRow[] = ew
    .filter((r) => r.attendedLive)
    .map((r) => {
      const k = keapByEmail.get(r.email);
      let cc: string;
      let phoneLocal: string;
      let fullPhone: string;
      let country: CountryGroup;
      // Always derive phone from EW (it's the cleanest source for show-ups).
      const built = buildFullPhone(r.cc, r.phone);
      cc = built.countryCode;
      phoneLocal = built.phoneNumber;
      fullPhone = built.fullPhone;
      // Country: prefer Keap's cc when valid; otherwise fall back to EW's cc.
      const keapCountry = k ? detectCountryFromKeap(k.cc, k.phone) : "NA";
      if (k && keapCountry !== "NA") {
        country = keapCountry;
      } else {
        country = detectCountryFromEW(r.cc, r.phone);
      }
      return {
        firstName: r.first,
        lastName: r.last,
        fullName: `${r.first} ${r.last}`.trim() || r.email,
        email: r.email,
        countryCode: cc,
        phoneNumber: phoneLocal,
        fullPhone,
        country,
        timeInRoom: r.timeInRoom,
        signedUp: isSignedUp(r.email, fullPhone),
        inOptIn: !!k,
      };
    });

  // ===== Opt-Ins =====
  // Keap rows + show-ups appended at bottom for those not in Keap
  const keapEmails = new Set(keap.map((k) => k.email));
  const optInRows: OptInRow[] = keap.map((k) => {
    // Prefer EW phone/cc when keap row matches an EW entry — EW is cleaner
    // (keap exports often corrupt phones via scientific notation, and keap
    // may not include a country-code column at all).
    const ewMatch = ewByEmail.get(k.email);
    let cc: string;
    let phoneLocal: string;
    let fullPhone: string;
    let country: CountryGroup;
    if (ewMatch && digits(ewMatch.cc) && digits(ewMatch.phone).length >= 6) {
      const built = buildFullPhone(ewMatch.cc, ewMatch.phone);
      cc = built.countryCode;
      phoneLocal = built.phoneNumber;
      fullPhone = built.fullPhone;
      country = detectCountryFromEW(ewMatch.cc, ewMatch.phone);
    } else {
      const built = buildFullPhone(k.cc, k.phone);
      cc = built.countryCode;
      phoneLocal = built.phoneNumber;
      fullPhone = built.fullPhone;
      country = detectCountryFromKeap(k.cc, k.phone);
    }
    return {
      firstName: k.first,
      lastName: k.last,
      fullName: `${k.first} ${k.last}`.trim() || k.email,
      email: k.email,
      countryCode: cc,
      phoneNumber: phoneLocal,
      fullPhone,
      country,
      showedUp: showedUpEmails.has(k.email),
      signedUp: isSignedUp(k.email, fullPhone),
      source: "keap",
    };
  });

  for (const su of showUpRows) {
    if (!su.inOptIn) {
      // Append to opt-ins (matches "Opt In sheet" structure in the original)
      optInRows.push({
        firstName: su.firstName,
        lastName: su.lastName,
        fullName: su.fullName,
        email: su.email,
        countryCode: su.countryCode,
        phoneNumber: su.phoneNumber,
        fullPhone: su.fullPhone,
        country: su.country,
        showedUp: true,
        signedUp: su.signedUp,
        source: "showup_only",
      });
    }
  }

  // ===== Country cross-reference =====
  // Same person may appear across opt-in / show-up / sign-up with one row
  // missing the country code prefix (e.g. ThriveCart sign-up phone = "96509711"
  // while Everwebinar show-up phone = "6596509711"). When a row's country is
  // OTHERS or NA, inherit a confident SG/MY country from any matching row in
  // the other two sources. Match by lowercase email OR last 8 digits of phone.
  type Lookupable = { email: string; fullPhone: string; country: CountryGroup };
  const buildCountryIndex = (rows: Lookupable[]) => {
    const byEmail = new Map<string, CountryGroup>();
    const byPhoneTail = new Map<string, CountryGroup>();
    for (const r of rows) {
      if (r.country !== "SG" && r.country !== "MY") continue;
      if (r.email) {
        const k = r.email.toLowerCase();
        if (!byEmail.has(k)) byEmail.set(k, r.country);
      }
      const tail = phoneTail(r.fullPhone);
      if (tail && !byPhoneTail.has(tail)) byPhoneTail.set(tail, r.country);
    }
    return { byEmail, byPhoneTail };
  };
  const lookupCountry = (
    email: string,
    fullPhone: string,
    idx: { byEmail: Map<string, CountryGroup>; byPhoneTail: Map<string, CountryGroup> }
  ): CountryGroup | null => {
    if (email) {
      const c = idx.byEmail.get(email.toLowerCase());
      if (c) return c;
    }
    const tail = phoneTail(fullPhone);
    if (tail) {
      const c = idx.byPhoneTail.get(tail);
      if (c) return c;
    }
    return null;
  };
  // Build indexes from the confident rows of each set.
  const optInIdx = buildCountryIndex(optInRows);
  const showUpIdx = buildCountryIndex(showUpRows);
  const signUpIdx = buildCountryIndex(signUpRows);
  // For each row whose country is OTHERS/NA, look in the *other two* sources.
  const promoteRow = (
    r: Lookupable,
    sources: Array<{ byEmail: Map<string, CountryGroup>; byPhoneTail: Map<string, CountryGroup> }>
  ) => {
    if (r.country === "SG" || r.country === "MY") return;
    for (const idx of sources) {
      const c = lookupCountry(r.email, r.fullPhone, idx);
      if (c) { r.country = c; return; }
    }
  };
  for (const r of signUpRows) promoteRow(r, [showUpIdx, optInIdx]);
  for (const r of showUpRows) promoteRow(r, [signUpIdx, optInIdx]);
  for (const r of optInRows) promoteRow(r, [showUpIdx, signUpIdx]);

  // Gibberish contacts are flagged INVALID after country cross-referencing so
  // a shared placeholder phone can't get "promoted" back to SG/MY just
  // because another spam row's tail happens to match a real contact.
  for (const r of optInRows) {
    if (gibberishEmails.has(r.email)) r.country = "INVALID";
  }

  // ===== Metrics and country breakdowns =====
  const { metrics, optInByCountry, showUpByCountry, signUpByCountry, showUpsNotInOptIn } =
    deriveMetrics(session, optInRows, showUpRows, signUpRows);

  return {
    sessionDetails: session,
    metrics,
    optInByCountry,
    showUpByCountry,
    signUpByCountry,
    optIns: optInRows,
    showUps: showUpRows,
    signUps: signUpRows,
    showUpsNotInOptIn,
    generatedAt: new Date().toISOString(),
    nlow4ExcludedPhones,
    nlow4ExcludedEmails,
  };
}
