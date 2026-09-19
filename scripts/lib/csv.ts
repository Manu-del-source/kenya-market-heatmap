/**
 * Minimal CSV reader/writer for ingestion scripts.
 *
 * Deliberately dependency-free: ingestion runs in CI and in cron, where a
 * small, predictable footprint matters more than feature completeness.
 * Supports RFC 4180 quoting and both LF and CRLF line endings.
 */

export function parseCsv(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < input.length; i++) {
    const char = input[i];

    if (inQuotes) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      continue;
    }
    if (char === ",") {
      row.push(field);
      field = "";
      continue;
    }
    if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      continue;
    }
    if (char === "\r") continue;

    field += char;
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((entry) => entry.some((cell) => cell.trim().length > 0));
}

export type CsvRecord = Record<string, string>;

/** Parse a CSV with a header row into key/value records. */
export function parseCsvRecords(input: string): CsvRecord[] {
  const rows = parseCsv(input);
  if (rows.length === 0) return [];
  const header = rows[0].map((cell) => normaliseHeader(cell));
  return rows.slice(1).map((row) => {
    const record: CsvRecord = {};
    header.forEach((key, index) => {
      record[key] = (row[index] ?? "").trim();
    });
    return record;
  });
}

function normaliseHeader(cell: string): string {
  return cell
    .trim()
    .toLowerCase()
    .replace(/^﻿/, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

/** Resolve a column by any of several aliases (NSE/vendor exports vary). */
export function pickColumn(record: CsvRecord, aliases: string[]): string | undefined {
  for (const alias of aliases) {
    const value = record[alias];
    if (value !== undefined && value !== "") return value;
  }
  return undefined;
}

/** Parse a number, tolerating thousands separators, currency codes and blanks. */
export function parseNumeric(value: string | undefined): number | null {
  if (value === undefined) return null;
  const cleaned = value.replace(/[,\s]/g, "").replace(/[KESKshUSD$%]/g, "");
  if (cleaned === "" || cleaned === "-" || cleaned === "n/a") return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Normalise a date into ISO `YYYY-MM-DD`.
 * Accepts YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY and DD-MMM-YYYY.
 */
export function parseDate(value: string | undefined): string | null {
  if (!value) return null;
  const raw = value.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const months: Record<string, string> = {
    jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
    jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
  };

  const dmy = /^(\d{1,2})[/-]([A-Za-z]{3}|\d{1,2})[/-](\d{2,4})/.exec(raw);
  if (dmy) {
    const day = dmy[1].padStart(2, "0");
    const month = months[dmy[2].toLowerCase()] ?? dmy[2].padStart(2, "0");
    const year = dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3];
    return `${year}-${month}-${day}`;
  }
  return null;
}
