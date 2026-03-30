import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";

interface RouteParams {
  params: Promise<{ ampMacAddress: string }>;
}

interface PersistedGlobalStoreFile {
  ampMacAddress: string;
  updatedAt: string;
  data: Record<string, unknown>;
}

function getGlobalStoreDir() {
  const base = process.env.APP_USER_DATA ?? process.cwd();
  return path.join(base, "storage", "global-store");
}

function normalizeAmpKey(rawAmpKey: string): string {
  return rawAmpKey.trim().toUpperCase();
}

function toSafeFileName(ampKey: string): string {
  return ampKey.replace(/[^A-Z0-9._-]/g, "-");
}

function toFilePath(ampMacAddress: string): { ampKey: string; filePath: string } {
  const ampKey = normalizeAmpKey(ampMacAddress);
  const fileName = `${toSafeFileName(ampKey)}.json`;
  return {
    ampKey,
    filePath: path.join(getGlobalStoreDir(), fileName)
  };
}

function normalizeStoreFile(raw: unknown, ampKey: string): PersistedGlobalStoreFile {
  const now = new Date().toISOString();

  if (raw && typeof raw === "object") {
    const candidate = raw as Partial<PersistedGlobalStoreFile>;
    if (candidate.data && typeof candidate.data === "object" && !Array.isArray(candidate.data)) {
      return {
        ampMacAddress: ampKey,
        updatedAt: typeof candidate.updatedAt === "string" ? candidate.updatedAt : now,
        data: candidate.data as Record<string, unknown>
      };
    }

    // Legacy payload compatibility: previous writer stored raw state directly as `data`.
    return {
      ampMacAddress: ampKey,
      updatedAt: now,
      data: { speakerConfig: raw }
    };
  }

  return {
    ampMacAddress: ampKey,
    updatedAt: now,
    data: {}
  };
}

async function readStoreFile(filePath: string, ampKey: string): Promise<PersistedGlobalStoreFile> {
  try {
    const content = await fs.readFile(filePath, "utf-8");
    const parsed = JSON.parse(content) as unknown;
    return normalizeStoreFile(parsed, ampKey);
  } catch (error) {
    const isNotFound =
      typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "ENOENT";

    if (isNotFound) {
      return normalizeStoreFile(null, ampKey);
    }

    throw error;
  }
}

async function writeStoreFile(filePath: string, persisted: PersistedGlobalStoreFile) {
  await fs.writeFile(filePath, JSON.stringify(persisted, null, 2), "utf-8");
}

export async function GET(request: Request, context: RouteParams) {
  try {
    const { ampMacAddress } = await context.params;
    if (!ampMacAddress?.trim()) {
      return NextResponse.json({ success: false, error: "Amp address is required" }, { status: 400 });
    }

    const { ampKey, filePath } = toFilePath(ampMacAddress);
    await fs.mkdir(getGlobalStoreDir(), { recursive: true });
    const persisted = await readStoreFile(filePath, ampKey);

    const section = new URL(request.url).searchParams.get("section")?.trim();
    if (section) {
      return NextResponse.json({
        success: true,
        ampMacAddress: ampKey,
        section,
        data: persisted.data[section] ?? null
      });
    }

    return NextResponse.json({ success: true, ampMacAddress: ampKey, data: persisted });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to read global store"
      },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request, context: RouteParams) {
  try {
    const { ampMacAddress } = await context.params;
    if (!ampMacAddress?.trim()) {
      return NextResponse.json({ success: false, error: "Amp address is required" }, { status: 400 });
    }

    const body = (await request.json()) as unknown;
    const { ampKey, filePath } = toFilePath(ampMacAddress);
    await fs.mkdir(getGlobalStoreDir(), { recursive: true });

    const persisted: PersistedGlobalStoreFile = {
      ampMacAddress: ampKey,
      updatedAt: new Date().toISOString(),
      data: body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {}
    };

    await writeStoreFile(filePath, persisted);

    return NextResponse.json({ success: true, ampMacAddress: ampKey });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to write global store"
      },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request, context: RouteParams) {
  try {
    const { ampMacAddress } = await context.params;
    if (!ampMacAddress?.trim()) {
      return NextResponse.json({ success: false, error: "Amp address is required" }, { status: 400 });
    }

    const body = (await request.json()) as { section?: string; value?: unknown };
    const section = body.section?.trim();
    if (!section) {
      return NextResponse.json({ success: false, error: "Section is required" }, { status: 400 });
    }

    const { ampKey, filePath } = toFilePath(ampMacAddress);
    await fs.mkdir(getGlobalStoreDir(), { recursive: true });

    const current = await readStoreFile(filePath, ampKey);
    const next: PersistedGlobalStoreFile = {
      ...current,
      ampMacAddress: ampKey,
      updatedAt: new Date().toISOString(),
      data: {
        ...current.data,
        [section]: body.value ?? null
      }
    };

    await writeStoreFile(filePath, next);

    return NextResponse.json({ success: true, ampMacAddress: ampKey, section });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to patch global store"
      },
      { status: 500 }
    );
  }
}
