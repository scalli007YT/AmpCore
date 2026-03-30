import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";

const SPEAKER_HEADER_SIZE = 254;

type LibraryFileRecord = {
  name: string;
  byteLength: number;
  brand: string;
  family: string;
  model: string;
  ways: string;
  notes: string;
  tdNum: number;
  payloadByteLength: number;
  hasDeviceFlag: boolean;
  rawBase64: string;
  payloadBase64: string;
  parseError?: string;
};

function getLibraryDir() {
  const base = process.env.APP_USER_DATA ?? process.cwd();
  return path.join(base, "storage", "speaker-library");
}

function decodeAnsiField(bytes: Buffer): string {
  return bytes.toString("latin1").replace(/\0+$/g, "").trim();
}

function parseSpeakerLibraryFile(name: string, raw: Buffer): LibraryFileRecord {
  if (raw.length < SPEAKER_HEADER_SIZE) {
    return {
      name,
      byteLength: raw.length,
      brand: "",
      family: "",
      model: "",
      ways: "",
      notes: "",
      tdNum: 0,
      payloadByteLength: 0,
      hasDeviceFlag: false,
      rawBase64: raw.toString("base64"),
      payloadBase64: "",
      parseError: "File shorter than Speaker_data header (254 bytes)"
    };
  }

  const brand = decodeAnsiField(raw.subarray(0, 40));
  const family = decodeAnsiField(raw.subarray(40, 80));
  const model = decodeAnsiField(raw.subarray(80, 120));
  const ways = decodeAnsiField(raw.subarray(120, 170));
  const notes = decodeAnsiField(raw.subarray(170, 250));
  const tdNum = raw.readInt32LE(250);

  let payload = raw.subarray(SPEAKER_HEADER_SIZE);
  let hasDeviceFlag = false;

  if (payload.length >= 16) {
    const suffix = payload.subarray(payload.length - 16);
    if (suffix.toString("latin1").startsWith("Uesr=")) {
      hasDeviceFlag = true;
      payload = payload.subarray(0, payload.length - 16);
    }
  }

  return {
    name,
    byteLength: raw.length,
    brand,
    family,
    model,
    ways,
    notes,
    tdNum,
    payloadByteLength: payload.length,
    hasDeviceFlag,
    rawBase64: raw.toString("base64"),
    payloadBase64: payload.toString("base64")
  };
}

export async function GET() {
  try {
    const libraryDir = getLibraryDir();
    await fs.mkdir(libraryDir, { recursive: true });

    const entries = await fs.readdir(libraryDir, { withFileTypes: true });
    const libraryFiles = entries
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".sl"))
      .sort((a, b) => a.name.localeCompare(b.name));

    const files: LibraryFileRecord[] = [];

    for (const entry of libraryFiles) {
      const raw = await fs.readFile(path.join(libraryDir, entry.name));
      files.push(parseSpeakerLibraryFile(entry.name, raw));
    }

    return NextResponse.json({ success: true, files });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Failed to read speaker library"
      },
      { status: 500 }
    );
  }
}
