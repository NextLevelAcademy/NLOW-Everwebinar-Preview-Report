import { useEffect, useMemo, useState } from "react";
import {
  ChartColumn,
  CheckCircle,
  Download,
  FileText,
  Moon,
  RefreshCw,
  Send,
  Sun,
  Upload,
  Users,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  generateReport,
  type UploadedFiles,
} from "@/lib/reportGenerator";
import { downloadExcelReport } from "@/lib/excelExport";
import { buildBroadcasts } from "@/lib/watiBroadcast";
import { BroadcastPanel } from "@/components/BroadcastPanel";
import type {
  CountryBreakdown,
  ReportData,
  SessionDetails,
  ShowUpRow,
  SignUpRow,
  VWDateEntry,
} from "../../../shared/schema";

// ============================================================================
// Header (shared between upload + report views)
// ============================================================================
function Header({
  showReportActions,
  onReset,
  onDownload,
  isDark,
  onToggleDark,
}: {
  showReportActions: boolean;
  onReset?: () => void;
  onDownload?: () => void;
  isDark: boolean;
  onToggleDark: () => void;
}) {
  return (
    <header className="border-b border-border px-6 py-4 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div
          className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center"
          data-testid="logo-box"
        >
          <ChartColumn className="w-5 h-5 text-primary-foreground" />
        </div>
        <div>
          <p className="font-bold text-sm leading-tight">NLOW WATI Automation Test 2</p>
          <p className="text-xs text-muted-foreground leading-tight">
            Next Level Academy
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          className="p-2 rounded-lg hover:bg-muted transition-colors"
          onClick={onToggleDark}
          data-testid="button-theme-toggle"
          aria-label="Toggle theme"
        >
          {isDark ? (
            <Sun className="w-4 h-4" />
          ) : (
            <Moon className="w-4 h-4" />
          )}
        </button>
        {showReportActions && (
          <>
            <button
              onClick={onReset}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border hover:bg-muted text-sm font-medium transition-colors"
              data-testid="button-reset"
            >
              <RefreshCw className="w-4 h-4" /> Start Over
            </button>
            <button
              onClick={onDownload}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 transition-opacity"
              data-testid="button-download-excel"
            >
              <Download className="w-4 h-4" /> Download Excel
            </button>
          </>
        )}
      </div>
    </header>
  );
}

// ============================================================================
// Upload page
// ============================================================================
type FileSlotProps = {
  file: File | null;
  onFile: (f: File | null) => void;
  title: string;
  accept: string;
  testId: string;
  hint?: string;
};

function RequiredFileSlot({
  file,
  onFile,
  title,
  accept,
  testId,
  hint,
}: FileSlotProps) {
  const filled = !!file;
  return (
    <label
      className={[
        "relative flex flex-col items-center justify-center gap-2 p-6 rounded-xl border-2 border-dashed cursor-pointer transition-all",
        filled
          ? "border-green-500 bg-green-50 dark:bg-green-950/20"
          : "border-border hover:border-primary/50 hover:bg-muted/30",
      ].join(" ")}
      data-testid={`dropzone-${testId}`}
    >
      <input
        type="file"
        accept={accept}
        className="sr-only"
        onChange={(e) => onFile(e.target.files?.[0] ?? null)}
        data-testid={`input-file-${testId}`}
      />
      {filled ? (
        <CheckCircle className="w-6 h-6 text-green-500" />
      ) : (
        <Upload className="w-6 h-6 text-muted-foreground" />
      )}
      <div className="text-center">
        <p
          className={[
            "font-semibold text-sm",
            filled
              ? "text-green-700 dark:text-green-400"
              : "text-foreground",
          ].join(" ")}
        >
          {title}{" "}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {filled ? file!.name : (hint ?? "Click to upload")}
        </p>
      </div>
    </label>
  );
}

// Tag 4 List (NLOW4) upload — optional Keap export. Contacts in this list
// are excluded from the No-Show broadcast.
function OptionalNLOW4Slot({
  file,
  onFile,
}: {
  file: File | null;
  onFile: (f: File | null) => void;
}) {
  const filled = !!file;
  return (
    <label
      className={[
        "relative h-full flex flex-col items-center justify-center gap-2 p-6 rounded-xl border-2 border-dashed cursor-pointer transition-all",
        filled
          ? "border-green-500 bg-green-50 dark:bg-green-950/20"
          : "border-border hover:border-primary/50 hover:bg-muted/30",
      ].join(" ")}
      data-testid="dropzone-nlow4"
    >
      <input
        type="file"
        accept=".csv"
        className="sr-only"
        onChange={(e) => onFile(e.target.files?.[0] ?? null)}
        data-testid="input-file-nlow4"
      />
      {filled ? (
        <CheckCircle className="w-6 h-6 text-green-500" />
      ) : (
        <Upload className="w-6 h-6 text-muted-foreground" />
      )}
      <div className="text-center">
        <p
          className={[
            "font-semibold text-sm",
            filled
              ? "text-green-700 dark:text-green-400"
              : "text-foreground",
          ].join(" ")}
        >
          Tag 4 List{" "}
          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground ml-1">
            Optional
          </span>
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {filled
            ? file!.name
            : "Keap export (NLOW4) — excluded from No-Show broadcast"}
        </p>
      </div>
    </label>
  );
}

function OptionalBTSlot({
  file,
  onFile,
}: {
  file: File | null;
  onFile: (f: File | null) => void;
}) {
  const filled = !!file;
  return (
    <div className="h-full flex flex-col gap-2">
      <label
        className={[
          "relative flex flex-col items-center justify-center gap-2 p-6 rounded-xl border-2 border-dashed cursor-pointer transition-all",
          filled
            ? "border-green-500 bg-green-50 dark:bg-green-950/20"
            : "border-border hover:border-primary/50 hover:bg-muted/30",
        ].join(" ")}
        data-testid="dropzone-bt"
      >
        <input
          type="file"
          accept=".csv,.xlsx"
          className="sr-only"
          onChange={(e) => onFile(e.target.files?.[0] ?? null)}
          data-testid="input-file-bt"
        />
        {filled ? (
          <CheckCircle className="w-6 h-6 text-green-500" />
        ) : (
          <Upload className="w-6 h-6 text-muted-foreground" />
        )}
        <div className="text-center">
          <p
            className={[
              "font-semibold text-sm",
              filled
                ? "text-green-700 dark:text-green-400"
                : "text-foreground",
            ].join(" ")}
          >
            Bank Transfer Sales{" "}
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground ml-1">
              Optional
            </span>
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {filled ? file!.name : "PayNow / bank transfer sign-ups"}
          </p>
        </div>
      </label>

      <div className="rounded-lg border border-border bg-muted/30 px-3 py-2.5">
        <p className="text-[11px] font-semibold text-foreground mb-1">
          Required columns
        </p>
        <ul className="text-[11px] text-muted-foreground space-y-0.5 leading-snug">
          <li>
            <span className="font-medium text-foreground">Name</span> ·{" "}
            <span className="font-medium text-foreground">email</span> ·{" "}
            <span className="font-medium text-foreground">phone number</span>
          </li>
          <li>
            <span className="font-medium text-foreground">Date</span>{" "}
            (e.g. May, June) — used to route into the May / June Welcome WATI
          </li>
          <li>
            <span className="font-medium text-foreground">Price</span> (e.g.
            297) — falls back to Program Price if blank
          </li>
        </ul>
        <a
          href="samples/bank-transfer-sample.csv"
          download="bank-transfer-sample.csv"
          data-testid="link-download-bt-sample"
          className="inline-flex items-center gap-1 mt-2 text-[11px] font-semibold text-primary hover:underline"
        >
          <FileText className="w-3 h-3" />
          Download sample file
        </a>
      </div>
    </div>
  );
}

function SessionDetailsCard({
  session,
  setSession,
}: {
  session: SessionDetails;
  setSession: (s: SessionDetails) => void;
}) {
  function update<K extends keyof SessionDetails>(key: K, val: SessionDetails[K]) {
    setSession({ ...session, [key]: val });
  }

  function updateVw(idx: number, patch: Partial<VWDateEntry>) {
    const next = session.vwDates.map((v, i) =>
      i === idx ? { ...v, ...patch } : v
    );
    setSession({ ...session, vwDates: next });
  }

  function addVw() {
    setSession({
      ...session,
      vwDates: [...session.vwDates, { label: "", pastSignups: 0 }],
    });
  }

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
          <Users className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <p className="font-semibold text-sm text-foreground">
              Session Details
            </p>
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
              Optional
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Session date is used for Keap tag suffixes.
          </p>
          <div className="mt-3 flex flex-col gap-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground">
                Session Date
              </label>
              <input
                type="text"
                placeholder="09/04/26 or 090426"
                maxLength={8}
                value={session.sessionDate}
                onChange={(e) => update("sessionDate", e.target.value)}
                data-testid="input-session-date"
                className="mt-1 w-44 px-3 py-2 rounded-lg border border-border bg-background text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 tabular-nums"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">
                Attendance at Pitch
              </label>
              <input
                type="number"
                min={0}
                placeholder="e.g. 135"
                value={session.attendanceAtPitch ?? ""}
                onChange={(e) =>
                  update(
                    "attendanceAtPitch",
                    e.target.value === "" ? null : Number(e.target.value)
                  )
                }
                data-testid="input-attendance-pitch"
                className="mt-1 w-36 px-3 py-2 rounded-lg border border-border bg-background text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 tabular-nums"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">
                Speaker
              </label>
              <input
                type="text"
                placeholder="e.g. Bjorn"
                value={session.speaker ?? ""}
                onChange={(e) => update("speaker", e.target.value)}
                data-testid="input-speaker"
                className="mt-1 w-36 px-3 py-2 rounded-lg border border-border bg-background text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">
                Program Price (SGD)
              </label>
              <input
                type="number"
                min={0}
                placeholder="e.g. 297"
                value={session.programPrice}
                onChange={(e) =>
                  update("programPrice", Number(e.target.value) || 0)
                }
                data-testid="input-program-price"
                className="mt-1 w-36 px-3 py-2 rounded-lg border border-border bg-background text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 tabular-nums"
              />
            </div>
            <div className="border-t border-border pt-3 mt-1">
              <label className="text-xs font-medium text-muted-foreground">
                VW Date Entries
              </label>
              <p className="text-[10px] text-muted-foreground mb-2">
                Add one row per upcoming VW date.
              </p>
              {session.vwDates.map((vw, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 mb-2"
                  data-testid={`vw-row-${i}`}
                >
                  <input
                    type="text"
                    placeholder="e.g. May"
                    value={vw.label}
                    onChange={(e) => updateVw(i, { label: e.target.value })}
                    className="w-28 px-2 py-1.5 rounded-lg border border-border bg-background text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                  <input
                    type="number"
                    min={0}
                    placeholder="Past sign-ups"
                    value={vw.pastSignups}
                    onChange={(e) =>
                      updateVw(i, { pastSignups: Number(e.target.value) || 0 })
                    }
                    className="w-32 px-2 py-1.5 rounded-lg border border-border bg-background text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 tabular-nums"
                  />
                </div>
              ))}
              <button
                onClick={addVw}
                data-testid="button-add-vw"
                className="text-xs text-primary font-medium hover:underline mt-0.5"
              >
                + Add VW date
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function FileChip({ label, present }: { label: string; present: boolean }) {
  if (!present) return null;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border border-green-400 bg-green-50 dark:bg-green-950/20 text-green-700 dark:text-green-400">
      <CheckCircle className="w-3 h-3" />
      {label}
    </span>
  );
}

function UploadView(props: {
  keapFile: File | null;
  ewFile: File | null;
  tcFile: File | null;
  btFile: File | null;
  nlow4File: File | null;
  session: SessionDetails;
  generating: boolean;
  setKeapFile: (f: File | null) => void;
  setEwFile: (f: File | null) => void;
  setTcFile: (f: File | null) => void;
  setBtFile: (f: File | null) => void;
  setNlow4File: (f: File | null) => void;
  setSession: (s: SessionDetails) => void;
  onGenerate: () => void;
}) {
  const ready =
    !!props.keapFile && !!props.ewFile && !!props.tcFile && !props.generating;

  return (
    <main className="max-w-4xl mx-auto px-6 py-10">
      <h1 className="text-2xl font-bold mb-1">Upload Files</h1>
      <p className="text-sm text-muted-foreground mb-8">
        Upload the 3 required files, then optionally add bank transfer sales
        before generating the report.
      </p>

      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
        Required
      </p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <RequiredFileSlot
          file={props.keapFile}
          onFile={props.setKeapFile}
          title="Keap Opt-In CSV"
          hint="People who opted in to this webinar"
          accept=".csv"
          testId="keap"
        />
        <RequiredFileSlot
          file={props.ewFile}
          onFile={props.setEwFile}
          title="Everwebinar Show Up CSV"
          hint="Attendee report from Everwebinar"
          accept=".csv"
          testId="ew"
        />
        <RequiredFileSlot
          file={props.tcFile}
          onFile={props.setTcFile}
          title="ThriveCart Sales CSV"
          hint="Customer export from ThriveCart"
          accept=".csv"
          testId="tc"
        />
      </div>

      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
        Optional
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <OptionalBTSlot file={props.btFile} onFile={props.setBtFile} />
        <OptionalNLOW4Slot
          file={props.nlow4File}
          onFile={props.setNlow4File}
        />
      </div>
      <div className="grid grid-cols-1 gap-4 mb-6">
        <SessionDetailsCard
          session={props.session}
          setSession={props.setSession}
        />
      </div>

      <div className="flex flex-wrap gap-2 mb-6">
        <FileChip label="Keap" present={!!props.keapFile} />
        <FileChip label="Everwebinar" present={!!props.ewFile} />
        <FileChip label="ThriveCart" present={!!props.tcFile} />
        {props.btFile && <FileChip label="Bank Transfer" present />}
        {props.nlow4File && <FileChip label="Tag 4 List" present />}
      </div>

      <button
        onClick={props.onGenerate}
        disabled={!ready}
        data-testid="button-generate"
        className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm transition-all hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <FileText className="w-4 h-4" />
        {props.generating ? "Generating…" : "Generate Report"}
      </button>
    </main>
  );
}

// ============================================================================
// Report view
// ============================================================================
function StatCard({
  value,
  pct,
  label,
  green,
}: {
  value: string | number;
  pct?: string;
  label: string;
  green: boolean;
}) {
  const cls = green
    ? "rounded-xl border p-5 flex flex-col gap-1 border-green-400 bg-green-50 dark:bg-green-950/20"
    : "rounded-xl border p-5 flex flex-col gap-1 border-border bg-card";
  const numCls = green
    ? "text-4xl font-bold tabular-nums text-green-600 dark:text-green-400"
    : "text-4xl font-bold tabular-nums text-foreground";
  return (
    <div className={cls}>
      <p className={numCls}>{value}</p>
      {pct && (
        <p className="text-lg font-bold text-green-600 dark:text-green-400">
          {pct}
        </p>
      )}
      <p className="text-sm text-muted-foreground font-medium">{label}</p>
    </div>
  );
}

function VWStatCard({
  entries,
}: {
  entries: Array<{ label: string; total: number }>;
}) {
  return (
    <div
      className="rounded-xl border p-5 border-green-400 bg-green-50 dark:bg-green-950/20 flex flex-col"
      data-testid="card-vw-signups"
    >
      <p className="text-sm text-muted-foreground font-medium mb-2">
        Total Signups for VW
      </p>
      <div className="space-y-1">
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">No VW dates</p>
        ) : (
          entries.map(({ label, total }) => (
            <div
              key={label}
              className="flex justify-between items-baseline text-sm"
            >
              <span className="font-medium text-foreground">{label}:</span>
              <span className="text-2xl font-bold tabular-nums text-green-600 dark:text-green-400">
                {total}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function CountryTable({
  title,
  data,
}: {
  title: string;
  data: CountryBreakdown;
}) {
  // Only render rows whose count > 0, but always include grand total
  const rows: { key: string; count: number }[] = [];
  if (data.SG > 0) rows.push({ key: "SG", count: data.SG });
  if (data.MY > 0) rows.push({ key: "MY", count: data.MY });
  if (data.USA > 0) rows.push({ key: "USA", count: data.USA });
  if (data.HK > 0) rows.push({ key: "HK", count: data.HK });
  if (data.OTHERS > 0) rows.push({ key: "OTHERS", count: data.OTHERS });
  if (data.INVALID > 0) rows.push({ key: "INVALID", count: data.INVALID });
  if (data.NA > 0) rows.push({ key: "NA", count: data.NA });
  const total =
    data.SG + data.MY + data.USA + data.HK + data.OTHERS + data.INVALID + data.NA;

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <h3 className="font-semibold text-sm text-foreground mb-3">{title}</h3>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-muted-foreground">
            <th className="text-left pb-2">Country</th>
            <th className="text-right pb-2">Count</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-t border-border/50">
              <td className="py-1.5 text-foreground">{r.key}</td>
              <td className="py-1.5 text-right font-medium tabular-nums">
                {r.count}
              </td>
            </tr>
          ))}
          <tr className="border-t border-border font-bold">
            <td className="pt-2 text-foreground">Grand Total</td>
            <td className="pt-2 text-right tabular-nums">{total}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function CountryPill({ value }: { value: string }) {
  return (
    <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-muted text-foreground">
      {value}
    </span>
  );
}

function YesPill() {
  return (
    <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400">
      ✓ Yes
    </span>
  );
}

function SourcePill({ source }: { source: SignUpRow["source"] }) {
  if (source === "BT") {
    return (
      <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400">
        BT
      </span>
    );
  }
  if (source === "TC+BT") {
    return (
      <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-400">
        TC + BT
      </span>
    );
  }
  return (
    <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-400">
      ThriveCart
    </span>
  );
}

function ShowUpTable({ rows }: { rows: ShowUpRow[] }) {
  const signedUpCount = rows.filter((r) => r.signedUp).length;
  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <h3 className="font-semibold text-sm text-foreground">
          Show Up ({rows.length})
        </h3>
        <span className="text-xs text-primary font-medium">
          {signedUpCount} signed up
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-4 py-2.5 text-left font-medium text-muted-foreground whitespace-nowrap">
                #
              </th>
              <th className="px-4 py-2.5 text-left font-medium text-muted-foreground whitespace-nowrap">
                Name
              </th>
              <th className="px-4 py-2.5 text-left font-medium text-muted-foreground whitespace-nowrap">
                Email
              </th>
              <th className="px-4 py-2.5 text-left font-medium text-muted-foreground whitespace-nowrap">
                Phone
              </th>
              <th className="px-4 py-2.5 text-left font-medium text-muted-foreground whitespace-nowrap">
                Country
              </th>
              <th className="px-4 py-2.5 text-left font-medium text-muted-foreground whitespace-nowrap">
                Time in Room
              </th>
              <th className="px-4 py-2.5 text-left font-medium text-muted-foreground whitespace-nowrap">
                Signed Up
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr
                key={`${r.email}-${i}`}
                className={[
                  "border-t border-border/50",
                  r.signedUp ? "bg-green-50/50 dark:bg-green-950/10" : "",
                ].join(" ")}
              >
                <td className="px-4 py-2 text-muted-foreground">{i + 1}</td>
                <td className="px-4 py-2 font-medium text-foreground">
                  {r.fullName}
                </td>
                <td className="px-4 py-2 text-muted-foreground">{r.email}</td>
                <td className="px-4 py-2 tabular-nums">{r.fullPhone}</td>
                <td className="px-4 py-2">
                  <CountryPill value={r.country} />
                </td>
                <td className="px-4 py-2 tabular-nums">{r.timeInRoom}</td>
                <td className="px-4 py-2">{r.signedUp && <YesPill />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SignUpTable({ rows }: { rows: SignUpRow[] }) {
  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-border">
        <h3 className="font-semibold text-sm text-foreground">
          Sign Up ({rows.length})
        </h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-4 py-2.5 text-left font-medium text-muted-foreground whitespace-nowrap">
                #
              </th>
              <th className="px-4 py-2.5 text-left font-medium text-muted-foreground whitespace-nowrap">
                Name
              </th>
              <th className="px-4 py-2.5 text-left font-medium text-muted-foreground whitespace-nowrap">
                Email
              </th>
              <th className="px-4 py-2.5 text-left font-medium text-muted-foreground whitespace-nowrap">
                Phone
              </th>
              <th className="px-4 py-2.5 text-left font-medium text-muted-foreground whitespace-nowrap">
                Country
              </th>
              <th className="px-4 py-2.5 text-left font-medium text-muted-foreground whitespace-nowrap">
                Source
              </th>
              <th className="px-4 py-2.5 text-left font-medium text-muted-foreground whitespace-nowrap">
                Intake
              </th>
              <th className="px-4 py-2.5 text-left font-medium text-muted-foreground whitespace-nowrap">
                Show Up
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr
                key={`${r.email}-${i}`}
                className="border-t border-border/50"
              >
                <td className="px-4 py-2 text-muted-foreground">{i + 1}</td>
                <td className="px-4 py-2 font-medium text-foreground">
                  {r.fullName}
                </td>
                <td className="px-4 py-2 text-muted-foreground">{r.email}</td>
                <td className="px-4 py-2 tabular-nums">{r.fullPhone}</td>
                <td className="px-4 py-2">
                  <CountryPill value={r.country} />
                </td>
                <td className="px-4 py-2">
                  <SourcePill source={r.source} />
                </td>
                <td className="px-4 py-2 text-foreground">{r.intake}</td>
                <td className="px-4 py-2">{r.showedUp && <YesPill />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// (ShowUpsNotInOptInSection removed per user request — internal data still drives Keap tagging)

function WatiSection({ broadcasts }: { broadcasts: ReturnType<typeof buildBroadcasts> }) {
  // Tab keys: "welcome:<index>" for each dynamic welcome, or "no_show".
  const welcomeKeys = broadcasts.welcomes.map((_, i) => `welcome:${i}`);
  const defaultTab = welcomeKeys[0] ?? "no_show";
  const [tab, setTab] = useState<string>(defaultTab);

  // If VW entries change (added/removed/edited) and the current tab no longer
  // exists, fall back to the first available tab.
  useEffect(() => {
    const validKeys = new Set<string>([...welcomeKeys, "no_show"]);
    if (!validKeys.has(tab)) {
      setTab(defaultTab);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [welcomeKeys.join("|")]);

  function titleCase(s: string): string {
    const t = (s || "").trim();
    if (!t) return t;
    return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
  }

  function tabBtn(key: string, label: string, count: number) {
    const active = tab === key;
    return (
      <button
        key={key}
        onClick={() => setTab(key)}
        data-testid={`tab-${key}`}
        className={[
          "flex-1 px-4 py-2.5 rounded-md text-sm font-medium transition-colors flex items-center justify-center gap-2",
          active
            ? "bg-card text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground",
        ].join(" ")}
      >
        <span>{label}</span>
        <span
          className={[
            "px-1.5 py-0.5 rounded text-[10px] font-medium tabular-nums",
            active ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
          ].join(" ")}
        >
          {count}
        </span>
      </button>
    );
  }

  const activeWelcomeIdx = tab.startsWith("welcome:")
    ? Number(tab.split(":")[1])
    : -1;

  return (
    <div className="mt-8">
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center gap-2">
          <Send className="w-4 h-4 text-primary" />
          <h3 className="font-semibold text-sm text-foreground">
            Send WATI Broadcasts
          </h3>
        </div>
        <div className="p-5 space-y-4">
          <div className="flex bg-muted/50 p-1 rounded-lg gap-1">
            {broadcasts.welcomes.map((w, i) =>
              tabBtn(
                `welcome:${i}`,
                `${titleCase(w.vwLabel || "")} Welcome`.trim() || "Welcome",
                w.contacts.length
              )
            )}
            {tabBtn(
              "no_show",
              "No-Show Follow-Up",
              broadcasts.no_show.contacts.length
            )}
          </div>
          {activeWelcomeIdx >= 0 && broadcasts.welcomes[activeWelcomeIdx] && (
            <BroadcastPanel
              key={`welcome:${activeWelcomeIdx}:${broadcasts.welcomes[activeWelcomeIdx].vwLabel ?? ""}`}
              build={broadcasts.welcomes[activeWelcomeIdx]}
            />
          )}
          {tab === "no_show" && (
            <BroadcastPanel key="no_show" build={broadcasts.no_show} />
          )}
        </div>
      </div>
    </div>
  );
}

function ReportView({
  report,
  broadcasts,
}: {
  report: ReportData;
  broadcasts: ReturnType<typeof buildBroadcasts>;
}) {
  const m = report.metrics;
  const session = report.sessionDetails;
  const vwEntries = Object.entries(m.signUpsByIntakeForVW).map(
    ([label, total]) => ({ label, total })
  );
  const showVwCard = session.vwDates.length > 0;

  const revenue = m.revenueTotal.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  // Stat grid: always 5 columns; 7th card (VW) wraps to row 2 alongside Revenue.
  const gridCols = "grid grid-cols-2 md:grid-cols-5 gap-4 mb-8";

  return (
    <main className="max-w-6xl mx-auto px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">NLOW Everwebinar Preview Report</h1>
        <p className="text-base text-muted-foreground">by Bjorn Ng</p>
        <p className="text-sm font-bold text-primary mt-1">
          Program Price: SGD{" "}
          {session.programPrice.toLocaleString("en-US", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
        </p>
        <div className="mt-2 space-y-0.5">
          {session.sessionDate && (
            <p className="text-xs text-primary font-medium">
              Session date: {session.sessionDate}
            </p>
          )}
          {m.attendanceAtPitch > 0 && (
            <p className="text-xs text-primary font-medium">
              Attendance at pitch: {m.attendanceAtPitch}
            </p>
          )}
        </div>
      </div>

      <div className={gridCols}>
        <StatCard value={m.optInCount} label="Opt-In" green={false} />
        <StatCard
          value={m.showUpCount}
          pct={`${m.showUpPct.toFixed(1)}%`}
          label="Show Up"
          green
        />
        <StatCard
          value={m.attendanceAtPitch}
          pct={`${m.attendanceAtPitchPct.toFixed(1)}%`}
          label="Attendance at Pitch"
          green
        />
        <div className="rounded-xl border p-5 flex flex-col gap-1 border-green-400 bg-green-50 dark:bg-green-950/20 md:col-span-2 lg:col-span-2">
          <p className="text-3xl font-bold tabular-nums text-green-600 dark:text-green-400">
            {m.signUpCount}
          </p>
          <div className="mt-1 space-y-2">
            <div>
              <span className="text-xs text-muted-foreground block leading-snug">Speakers’ Conversion (Sales / attendance at Pitch)</span>
              <span className="text-base font-bold tabular-nums text-green-600 dark:text-green-400">
                {m.attendanceAtPitch && m.attendanceAtPitch > 0
                  ? `${((m.signUpCount / m.attendanceAtPitch) * 100).toFixed(1)}%`
                  : "—"}
              </span>
            </div>
            <div>
              <span className="text-xs text-muted-foreground block leading-snug">Preview Conversion (Sales / Show Ups)</span>
              <span className="text-base font-bold tabular-nums text-green-600 dark:text-green-400">
                {m.showUpCount && m.showUpCount > 0
                  ? `${((m.signUpCount / m.showUpCount) * 100).toFixed(1)}%`
                  : "—"}
              </span>
            </div>
          </div>
          <p className="text-sm text-muted-foreground font-medium mt-1">Sign Ups incl. BT</p>
        </div>
        <StatCard
          value={` ${revenue}`}
          label="Total Revenue Generated"
          green
        />
        {showVwCard && <VWStatCard entries={vwEntries} />}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <CountryTable
          title="Opt In by Country"
          data={report.optInByCountry}
        />
        <CountryTable
          title="Show Up by Country"
          data={report.showUpByCountry}
        />
        <CountryTable
          title="Sign Up by Country"
          data={report.signUpByCountry}
        />
      </div>

      <div className="mb-6">
        <ShowUpTable rows={report.showUps} />
      </div>

      <SignUpTable rows={report.signUps} />

      <WatiSection broadcasts={broadcasts} />
    </main>
  );
}

// ============================================================================
// Page wrapper
// ============================================================================
export default function Home() {
  const { toast } = useToast();
  const [keapFile, setKeapFile] = useState<File | null>(null);
  const [ewFile, setEwFile] = useState<File | null>(null);
  const [tcFile, setTcFile] = useState<File | null>(null);
  const [btFile, setBtFile] = useState<File | null>(null);
  const [nlow4File, setNlow4File] = useState<File | null>(null);
  const [session, setSession] = useState<SessionDetails>({
    sessionDate: "",
    attendanceAtPitch: null,
    programPrice: 297,
    vwDates: [],
    speaker: "",
  });
  const [report, setReport] = useState<ReportData | null>(null);
  const [generating, setGenerating] = useState(false);
  const [isDark, setIsDark] = useState(false);

  // Theme toggle
  useEffect(() => {
    const root = document.documentElement;
    if (isDark) root.classList.add("dark");
    else root.classList.remove("dark");
  }, [isDark]);

  // QA hook: allow Playwright tests to inject a synthetic report bypassing the
  // file-upload flow. Safe to leave in production — only invoked when a test
  // page explicitly calls window.__loadSampleReport().
  useEffect(() => {
    (window as any).__loadSampleReport = (r: ReportData) => setReport(r);
    return () => {
      try {
        delete (window as any).__loadSampleReport;
      } catch {}
    };
  }, []);

  const broadcasts = useMemo(
    () => (report ? buildBroadcasts(report, report.sessionDetails?.vwDates) : null),
    [report]
  );

  async function handleGenerate() {
    if (!keapFile || !ewFile || !tcFile) {
      toast({
        title: "Missing files",
        description: "Please upload all 3 required CSVs.",
        variant: "destructive",
      });
      return;
    }
    setGenerating(true);
    try {
      const files: UploadedFiles = {
        keapFile,
        everWebinarFile: ewFile,
        thriveCartFile: tcFile,
        bankTransferFile: btFile,
        nlow4File,
      };
      const r = await generateReport(files, session);
      setReport(r);
      toast({
        title: "Report generated",
        description: `${r.metrics.optInCount} opt-ins · ${r.metrics.showUpCount} show-ups · ${r.metrics.signUpCount} sign-ups`,
      });
    } catch (err: any) {
      console.error(err);
      toast({
        title: "Failed to generate report",
        description: err?.message ?? "Unknown error",
        variant: "destructive",
      });
    } finally {
      setGenerating(false);
    }
  }

  function handleReset() {
    setReport(null);
    setKeapFile(null);
    setEwFile(null);
    setTcFile(null);
    setBtFile(null);
    setNlow4File(null);
    setSession({
      sessionDate: "",
      attendanceAtPitch: null,
      programPrice: 297,
      vwDates: [],
      speaker: "",
    });
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header
        showReportActions={!!report}
        onReset={handleReset}
        onDownload={() => report && downloadExcelReport(report)}
        isDark={isDark}
        onToggleDark={() => setIsDark((d) => !d)}
      />
      {!report && (
        <UploadView
          keapFile={keapFile}
          ewFile={ewFile}
          tcFile={tcFile}
          btFile={btFile}
          nlow4File={nlow4File}
          session={session}
          generating={generating}
          setKeapFile={setKeapFile}
          setEwFile={setEwFile}
          setTcFile={setTcFile}
          setBtFile={setBtFile}
          setNlow4File={setNlow4File}
          setSession={setSession}
          onGenerate={handleGenerate}
        />
      )}
      {report && broadcasts && (
        <ReportView report={report} broadcasts={broadcasts} />
      )}
    </div>
  );
}
