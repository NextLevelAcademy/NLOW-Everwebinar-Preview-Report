import type { CountryBreakdown } from "../../../shared/schema";

const COUNTRY_OPTIONS: (keyof CountryBreakdown)[] = [
  "SG", "MY", "USA", "HK", "OTHERS", "INVALID", "NA",
];

/** Inline-editable text cell — click to edit, blur/Enter to commit. */
export function EditableText({
  value,
  onCommit,
  className,
  placeholder,
  testId,
}: {
  value: string;
  onCommit: (next: string) => void;
  className?: string;
  placeholder?: string;
  testId?: string;
}) {
  return (
    <input
      type="text"
      defaultValue={value}
      key={value}
      placeholder={placeholder}
      data-testid={testId}
      onBlur={(e) => {
        if (e.target.value !== value) onCommit(e.target.value);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
      className={[
        "w-full bg-transparent border border-transparent rounded px-1 py-0.5 -mx-1 hover:border-border focus:border-primary focus:outline-none focus:bg-background transition-colors",
        className || "",
      ].join(" ")}
    />
  );
}

/** Inline-editable number cell. */
export function EditableNumber({
  value,
  onCommit,
  className,
  testId,
}: {
  value: number;
  onCommit: (next: number) => void;
  className?: string;
  testId?: string;
}) {
  return (
    <input
      type="number"
      defaultValue={value}
      key={value}
      data-testid={testId}
      onBlur={(e) => {
        const next = Number(e.target.value) || 0;
        if (next !== value) onCommit(next);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
      className={[
        "w-full bg-transparent border border-transparent rounded px-1 py-0.5 -mx-1 hover:border-border focus:border-primary focus:outline-none focus:bg-background transition-colors tabular-nums",
        className || "",
      ].join(" ")}
    />
  );
}

/** Inline country dropdown — the primary way to correct/override a valid vs. INVALID classification. */
export function CountrySelect({
  value,
  onCommit,
  testId,
}: {
  value: string;
  onCommit: (next: keyof CountryBreakdown) => void;
  testId?: string;
}) {
  return (
    <select
      value={value}
      data-testid={testId}
      onChange={(e) => onCommit(e.target.value as keyof CountryBreakdown)}
      className={[
        "text-[10px] font-medium rounded px-1 py-0.5 border focus:outline-none focus:ring-1 focus:ring-primary/50",
        value === "INVALID"
          ? "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400 border-red-300 dark:border-red-800"
          : "bg-muted text-foreground border-transparent hover:border-border",
      ].join(" ")}
    >
      {COUNTRY_OPTIONS.map((c) => (
        <option key={c} value={c}>
          {c}
        </option>
      ))}
    </select>
  );
}

/** Inline boolean toggle rendered as a small checkbox. */
export function EditableBool({
  checked,
  onCommit,
  testId,
}: {
  checked: boolean;
  onCommit: (next: boolean) => void;
  testId?: string;
}) {
  return (
    <input
      type="checkbox"
      checked={checked}
      data-testid={testId}
      onChange={(e) => onCommit(e.target.checked)}
      className="w-3.5 h-3.5 accent-primary cursor-pointer"
    />
  );
}

export function DeleteRowButton({ onClick, testId }: { onClick: () => void; testId?: string }) {
  return (
    <button
      onClick={onClick}
      data-testid={testId}
      title="Remove row"
      className="text-muted-foreground hover:text-red-600 dark:hover:text-red-400 transition-colors px-1"
    >
      ×
    </button>
  );
}
