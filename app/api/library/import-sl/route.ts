/**
 * POST /api/library/import-sl
 *
 * Parse a binary .sl speaker library file (original AMP Controller format) and
 * return a structured preview that the frontend uses to populate the speaker-config
 * editor dialog. This endpoint does NOT write anything to disk — the user confirms
 * the metadata in the dialog and the save goes through the main POST /api/library.
 *
 * .sl binary layout (reverse-engineered from WPF Speaker_data.cs):
 *   Offset   0 –  39  Brand      (40 bytes, null-terminated ASCII)
 *   Offset  40 –  79  Family     (40 bytes, null-terminated ASCII)
 *   Offset  80 – 119  Model      (40 bytes, null-terminated ASCII)
 *   Offset 120 – 169  Ways text  (50 bytes, null-terminated ASCII, '|'-separated labels)
 *   Offset 170 – 249  Notes      (80 bytes, null-terminated ASCII)
 *   Offset 250 – 253  TDNum      (int32LE — number of TD outputs / speaker ways)
 *   Offset 254 +      TDNum × raw FC=57 calibration blobs (all same byte size)
 */

import { NextResponse } from "next/server";
import { parseSpeakerData, detectSpeakerVariant } from "@/lib/parse-speaker-data";
import { toSlug } from "@/lib/constants";

export const dynamic = "force-dynamic";

const SL_HEADER_SIZE = 254;
// Generous ceiling: 8-way × largest known variant (Tecnare 2415 B) + header.
const MAX_SL_BYTES = SL_HEADER_SIZE + 8 * 2415;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readAscii(buf: Buffer, offset: number, maxLen: number): string {
  const slice = buf.subarray(offset, offset + maxLen);
  const nullIdx = slice.indexOf(0);
  return (nullIdx === -1 ? slice : slice.subarray(0, nullIdx)).toString("ascii").trim();
}

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------

export async function POST(request: Request): Promise<Response> {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ success: false, error: "Expected multipart/form-data" }, { status: 400 });
  }

  const fileEntry = formData.get("file");
  if (!fileEntry || typeof fileEntry === "string") {
    return NextResponse.json({ success: false, error: "Missing file field in form data" }, { status: 400 });
  }

  const arrayBuf = await fileEntry.arrayBuffer();
  const buf = Buffer.from(arrayBuf);

  if (buf.length < SL_HEADER_SIZE + 4) {
    return NextResponse.json({ success: false, error: "File is too small to be a valid .sl file" }, { status: 400 });
  }
  if (buf.length > MAX_SL_BYTES) {
    return NextResponse.json({ success: false, error: "File exceeds the maximum allowed .sl size" }, { status: 400 });
  }

  // --- Parse the 254-byte header ---
  const brand = readAscii(buf, 0, 40);
  const family = readAscii(buf, 40, 40);
  const model = readAscii(buf, 80, 40);
  const waysText = readAscii(buf, 120, 50);
  const notes = readAscii(buf, 170, 80);
  const tdNum = buf.readInt32LE(250);

  if (!Number.isInteger(tdNum) || tdNum < 1 || tdNum > 8) {
    return NextResponse.json(
      { success: false, error: `Invalid way count in .sl header: ${String(tdNum)}` },
      { status: 400 }
    );
  }

  const payloadTotal = buf.length - SL_HEADER_SIZE;
  if (payloadTotal <= 0 || payloadTotal % tdNum !== 0) {
    return NextResponse.json(
      {
        success: false,
        error: `Payload size ${String(payloadTotal)} B is not evenly divisible by way count ${String(tdNum)}`
      },
      { status: 400 }
    );
  }

  const payloadSize = payloadTotal / tdNum;

  // --- Build per-way label list ---
  const rawLabels =
    waysText.length > 0
      ? waysText
          .split("|")
          .map((s) => s.trim())
          .filter(Boolean)
      : [];
  const wayLabels: string[] = [];
  for (let i = 0; i < tdNum; i++) {
    wayLabels.push(rawLabels[i] ?? `Way ${i + 1}`);
  }

  // --- Parse each way payload ---
  const variant = detectSpeakerVariant(payloadSize);

  const ways: {
    id: string;
    label: string;
    role: string;
    deviceData: {
      physicalChannel: number;
      variant: string;
      hex: string;
      byteLength: number;
      parsed: Record<string, unknown>;
    };
  }[] = [];

  for (let i = 0; i < tdNum; i++) {
    const wayBuf = buf.subarray(SL_HEADER_SIZE + i * payloadSize, SL_HEADER_SIZE + (i + 1) * payloadSize);
    const parsed = parseSpeakerData(wayBuf);
    const label = wayLabels[i];
    const id = toSlug(label) || `way-${i + 1}`;

    ways.push({
      id,
      label,
      role: "custom",
      deviceData: {
        physicalChannel: i,
        variant,
        hex: wayBuf.toString("hex"),
        byteLength: payloadSize,
        parsed: (parsed ?? {}) as Record<string, unknown>
      }
    });
  }

  // --- Derive a default profile id from the header metadata ---
  const idSlug =
    [brand, family, model]
      .map((s) => toSlug(s))
      .filter(Boolean)
      .join("-") || "speaker-profile";

  const wayLabelsText = wayLabels.join(" & ");

  return NextResponse.json({
    success: true,
    id: idSlug,
    brand,
    family,
    model,
    notes,
    wayLabelsText,
    wayCount: tdNum,
    ways
  });
}
