/**
 * amp-logger.ts — server-side per-amp activity logger.
 *
 * Appends one line per event to storage/logs/{mac}.txt.
 * No redaction — all fields are written as-is.
 *
 * Line format:
 *   [ISO_TIMESTAMP] [CATEGORY  ] key=value key=value ...
 *
 * Categories:
 *   UI_ACTION   — amp command received at the API route (pre-processing)
 *   API_OK      — amp command completed successfully
 *   API_ERR     — amp command failed (includes error message)
 *   DISCOVERY   — amp announced itself via FC=0 BASIC_INFO
 *   OFFLINE     — amp declared offline (discovery timeout or heartbeat watchdog)
 */

import fs from "fs";
import path from "path";

const LOG_DIR = path.join(process.cwd(), "storage", "logs");

let logDirReady = false;

function ensureLogDir(): void {
  if (logDirReady) return;
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    logDirReady = true;
  } catch {
    // ignore — will retry next call
  }
}

/** Replace `:` with `-` so the MAC is a valid filename component. */
function macToFilename(mac: string): string {
  return mac.replace(/:/g, "-") + ".txt";
}

function serializeValue(v: unknown): string {
  if (v === null || v === undefined) return "null";
  if (typeof v === "string") {
    // Quote strings that contain spaces or special chars
    return /[\s=[\]{}]/.test(v) ? `"${v.replace(/"/g, '\\"')}"` : v;
  }
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function buildLine(category: string, fields: Record<string, unknown>): string {
  const ts = new Date().toISOString();
  const cat = category.padEnd(10);
  const fieldStr = Object.entries(fields)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}=${serializeValue(v)}`)
    .join(" ");
  return `[${ts}] [${cat}] ${fieldStr}\n`;
}

/**
 * Append one log line for the given amp MAC.
 * Never throws — logging failures are silently swallowed.
 */
export function ampLog(mac: string, category: string, fields: Record<string, unknown> = {}): void {
  try {
    ensureLogDir();
    const filepath = path.join(LOG_DIR, macToFilename(mac));
    fs.appendFileSync(filepath, buildLine(category, fields), "utf8");
  } catch {
    // Non-critical — never crash the application due to a logging failure.
  }
}
