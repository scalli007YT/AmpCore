import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";

type LibrarySpeakerWayRecord = {
  id: string;
  label: string;
  role: string;
};

type LibrarySpeakerProcessingRecord = {
  fir?: Record<string, unknown>;
  eq?: Record<string, unknown>;
  trim?: Record<string, unknown>;
  delay?: Record<string, unknown>;
  polarity?: Record<string, unknown>;
  limiter?: Record<string, unknown>;
  mode?: Record<string, unknown>;
};

type LibrarySpeakerProfileRecord = {
  schemaVersion: number;
  id: string;
  kind: string;
  name: string;
  brand: string;
  family: string;
  model: string;
  application: string;
  notes: string;
  wayLabelsText: string;
  wayCount: number;
  ways: LibrarySpeakerWayRecord[];
  processing: LibrarySpeakerProcessingRecord[];
  deviceData: (StoredWayDeviceData | null)[];
  parseError?: string;
};

type StoredSpeakerWay = {
  id: string;
  label: string;
  role: string;
  processing?: LibrarySpeakerProcessingRecord;
  deviceData?: StoredWayDeviceData | null;
};

type StoredWayDeviceData = {
  physicalChannel: number;
  variant: string;
  hex: string;
  byteLength: number;
  parsed: Record<string, unknown>;
};

type StoredSpeakerProfile = {
  schemaVersion: number;
  id: string;
  kind: string;
  speaker: {
    brand: string;
    family: string;
    model: string;
    application: string;
    notes: string;
    wayLabelsText: string;
    ways: StoredSpeakerWay[];
  };
};

function getLibraryDir() {
  const base = process.env.APP_USER_DATA ?? process.cwd();
  return path.join(base, "storage", "speaker-library");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toSpeakerWayRecord(value: unknown, index: number): LibrarySpeakerWayRecord {
  const candidate = isRecord(value) ? value : {};
  const label =
    typeof candidate.label === "string" && candidate.label.trim() ? candidate.label.trim() : `Way ${index + 1}`;
  const role = typeof candidate.role === "string" && candidate.role.trim() ? candidate.role.trim() : "custom";
  const id =
    typeof candidate.id === "string" && candidate.id.trim()
      ? candidate.id.trim()
      : label.toLowerCase().replace(/[^a-z0-9]+/g, "-");

  return { id, label, role };
}

function toSpeakerProcessingRecord(value: unknown): LibrarySpeakerProcessingRecord {
  const candidate = isRecord(value) ? value : {};

  return {
    fir: isRecord(candidate.fir) ? candidate.fir : {},
    eq: isRecord(candidate.eq) ? candidate.eq : {},
    trim: isRecord(candidate.trim) ? candidate.trim : {},
    delay: isRecord(candidate.delay) ? candidate.delay : {},
    polarity: isRecord(candidate.polarity) ? candidate.polarity : {},
    limiter: isRecord(candidate.limiter) ? candidate.limiter : {},
    mode: isRecord(candidate.mode) ? candidate.mode : {}
  };
}

function toWayDeviceData(value: unknown): StoredWayDeviceData | null {
  if (!isRecord(value)) return null;

  const hex = typeof value.hex === "string" ? value.hex : "";
  if (hex.length === 0) return null;

  return {
    physicalChannel: typeof value.physicalChannel === "number" ? value.physicalChannel : 0,
    variant: typeof value.variant === "string" ? value.variant : "unknown",
    hex,
    byteLength: typeof value.byteLength === "number" ? value.byteLength : hex.length / 2,
    parsed: isRecord(value.parsed) ? value.parsed : {}
  };
}

function parseSpeakerLibraryFile(name: string, raw: string): LibrarySpeakerProfileRecord {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed)) {
      throw new Error("Root JSON value must be an object");
    }

    const speaker = isRecord(parsed.speaker) ? parsed.speaker : null;
    if (!speaker) {
      throw new Error("Missing speaker object");
    }

    const waysRaw = Array.isArray(speaker.ways) ? speaker.ways : [];
    const ways = waysRaw.map((way, index) => toSpeakerWayRecord(way, index));
    const processing = waysRaw.map((way) => toSpeakerProcessingRecord(isRecord(way) ? way.processing : null));
    const deviceData = waysRaw.map((way) => toWayDeviceData(isRecord(way) ? way.deviceData : null));

    const wayLabelsText =
      typeof speaker.wayLabelsText === "string" && speaker.wayLabelsText.trim().length > 0
        ? speaker.wayLabelsText.trim()
        : ways.map((way) => way.label).join(" & ");

    return {
      schemaVersion: typeof parsed.schemaVersion === "number" ? parsed.schemaVersion : 1,
      id: typeof parsed.id === "string" && parsed.id.trim().length > 0 ? parsed.id.trim() : path.parse(name).name,
      kind: typeof parsed.kind === "string" && parsed.kind.trim().length > 0 ? parsed.kind.trim() : "speaker",
      name,
      brand: typeof speaker.brand === "string" ? speaker.brand.trim() : "",
      family: typeof speaker.family === "string" ? speaker.family.trim() : "",
      model: typeof speaker.model === "string" ? speaker.model.trim() : "",
      application: typeof speaker.application === "string" ? speaker.application.trim() : "",
      notes: typeof speaker.notes === "string" ? speaker.notes.trim() : "",
      wayLabelsText,
      wayCount: ways.length,
      ways,
      processing,
      deviceData
    };
  } catch (error) {
    return {
      schemaVersion: 1,
      id: path.parse(name).name,
      kind: "speaker",
      name,
      brand: "",
      family: "",
      model: "",
      application: "",
      notes: "",
      wayLabelsText: "",
      wayCount: 0,
      ways: [],
      processing: [],
      deviceData: [],
      parseError: error instanceof Error ? error.message : "Invalid speaker profile JSON"
    };
  }
}

function sanitizeId(raw: string): string {
  const next = raw
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  return next.length > 0 ? next : "speaker-profile";
}

function normalizeRequestedId(raw: string): string {
  return sanitizeId(raw.replace(/\.json$/i, ""));
}

function toStoredSpeakerProfile(input: unknown): StoredSpeakerProfile {
  if (!isRecord(input)) {
    throw new Error("Profile payload must be an object");
  }

  const speaker = isRecord(input.speaker) ? input.speaker : null;
  if (!speaker) {
    throw new Error("Missing speaker object");
  }

  const waysRaw = Array.isArray(speaker.ways) ? speaker.ways : [];
  if (waysRaw.length < 1) {
    throw new Error("At least one speaker way is required");
  }

  const ways = waysRaw.map((way, index) => {
    const normalizedWay = toSpeakerWayRecord(way, index);
    const deviceData = toWayDeviceData(isRecord(way) ? way.deviceData : null);
    return {
      id: normalizedWay.id,
      label: normalizedWay.label,
      role: normalizedWay.role,
      deviceData
    };
  });

  const wayLabelsText =
    typeof speaker.wayLabelsText === "string" && speaker.wayLabelsText.trim().length > 0
      ? speaker.wayLabelsText.trim()
      : ways.map((way) => way.label).join(" & ");

  return {
    schemaVersion: typeof input.schemaVersion === "number" ? input.schemaVersion : 1,
    id: sanitizeId(typeof input.id === "string" ? input.id : ""),
    kind: typeof input.kind === "string" && input.kind.trim().length > 0 ? input.kind.trim() : "speaker",
    speaker: {
      brand: typeof speaker.brand === "string" ? speaker.brand.trim() : "",
      family: typeof speaker.family === "string" ? speaker.family.trim() : "",
      model: typeof speaker.model === "string" ? speaker.model.trim() : "",
      application: typeof speaker.application === "string" ? speaker.application.trim() : "",
      notes: typeof speaker.notes === "string" ? speaker.notes.trim() : "",
      wayLabelsText,
      ways
    }
  };
}

export async function GET() {
  try {
    const libraryDir = getLibraryDir();
    await fs.mkdir(libraryDir, { recursive: true });

    const entries = await fs.readdir(libraryDir, { withFileTypes: true });
    const libraryFiles = entries
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".json"))
      .sort((a, b) => a.name.localeCompare(b.name));

    const files: LibrarySpeakerProfileRecord[] = [];

    for (const entry of libraryFiles) {
      const raw = await fs.readFile(path.join(libraryDir, entry.name), "utf-8");
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

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { profile?: unknown };
    const profile = toStoredSpeakerProfile(body?.profile);

    const libraryDir = getLibraryDir();
    await fs.mkdir(libraryDir, { recursive: true });

    const fileName = `${profile.id}.json`;
    const filePath = path.join(libraryDir, fileName);
    await fs.writeFile(filePath, JSON.stringify(profile, null, 2), "utf-8");

    const normalized = parseSpeakerLibraryFile(fileName, JSON.stringify(profile));
    return NextResponse.json({ success: true, file: normalized });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Failed to write speaker profile"
      },
      { status: 400 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const requestedId = searchParams.get("id");

    if (!requestedId || !requestedId.trim()) {
      return NextResponse.json({ success: false, error: "Missing library profile id" }, { status: 400 });
    }

    const profileId = normalizeRequestedId(requestedId);
    const libraryDir = getLibraryDir();
    await fs.mkdir(libraryDir, { recursive: true });

    try {
      await fs.unlink(path.join(libraryDir, `${profileId}.json`));
    } catch (err) {
      const code = err && typeof err === "object" && "code" in err ? String(err.code) : "";
      if (code === "ENOENT") {
        return NextResponse.json({ success: false, error: "Library profile not found" }, { status: 404 });
      }
      throw err;
    }

    return NextResponse.json({ success: true, id: profileId });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Failed to delete speaker profile"
      },
      { status: 400 }
    );
  }
}
