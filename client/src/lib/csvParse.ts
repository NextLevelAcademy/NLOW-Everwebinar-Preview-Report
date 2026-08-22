import Papa from "papaparse";

export async function parseCsv<T = Record<string, string>>(
  file: File
): Promise<T[]> {
  return new Promise((resolve, reject) => {
    Papa.parse<T>(file, {
      header: true,
      skipEmptyLines: "greedy",
      transformHeader: (h) => h.trim(),
      complete: (results) => {
        if (results.errors && results.errors.length > 0) {
          // Continue anyway — Papa often has minor quoting issues that don't break data
          console.warn("CSV parse warnings:", results.errors.slice(0, 3));
        }
        resolve(results.data as T[]);
      },
      error: (err) => reject(err),
    });
  });
}

export function findCol(
  row: Record<string, any>,
  candidates: string[]
): string | undefined {
  const keys = Object.keys(row);
  for (const c of candidates) {
    const norm = c.toLowerCase().replace(/[\s_]+/g, "");
    const match = keys.find(
      (k) => k.toLowerCase().replace(/[\s_]+/g, "") === norm
    );
    if (match) return match;
  }
  return undefined;
}

export function getVal(
  row: Record<string, any>,
  candidates: string[]
): string {
  const k = findCol(row, candidates);
  if (!k) return "";
  const v = row[k];
  return v == null ? "" : String(v).trim();
}
