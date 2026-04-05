import { NextRequest, NextResponse } from "next/server";
import { CvrAmpDevice, FuncCode } from "@/lib/amp-device";
import { isSimulatedMac } from "@/lib/simulated-amps";

/**
 * POST /api/amp-presets/import-sd
 * Body: { mac: string; ip: string; fileBase64: string; outputChannels?: number }
 *
 * Restores device state from a .sd file produced by the original CVR software
 * ("On PC → Store"). The binary layout is:
 *
 *   [Sync struct bytes] [FIR ch0: name[32]+float32[512]=2080B] [...] [16-byte FIR marker]
 *
 * Modern format (V_num >= 117):
 *   last 16 bytes = "FIR==2080\0..." (ASCII, null-padded)
 *   FIR blocks: per-channel, 2080 bytes each (name[32] + float32[512])
 *   syncLen = totalLen - outputChannels × 2080 - 16
 *
 * Legacy format (no marker):
 *   2048-byte blocks (float32[512] only, no name)
 *   syncLen = totalLen % 2048; channels = floor(totalLen / 2048)
 *
 * Confirmed from DemoData.cs:
 *   ExportData()  → StructToBytes(syncStruct) ++ getDemoAllFIR(OutputTD) [appended marker]
 *   Importdata()  → ParseFIR_lenth() → setSync(FC27) + each FIR block restored
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { ip, mac, fileBase64, outputChannels } = body as {
      ip?: string;
      mac?: string;
      fileBase64?: string;
      outputChannels?: number;
    };

    if (!ip || !mac || !fileBase64) {
      return NextResponse.json({ success: false, error: "Missing ip, mac or fileBase64" }, { status: 400 });
    }

    if (isSimulatedMac(mac)) {
      // Simulated amps don't have binary state to restore; accept silently.
      return NextResponse.json({ success: true, mac, simulated: true });
    }

    const fileBuf = Buffer.from(fileBase64, "base64");
    if (fileBuf.length < 100) {
      return NextResponse.json({ success: false, error: "File too small to be a valid .sd file" }, { status: 400 });
    }

    const { syncBytes, firBlocks } = parseSdFile(fileBuf, outputChannels ?? 4);

    const device = new CvrAmpDevice(ip);
    try {
      // 1. Restore full device state via FC=27 SYNC_DATA.
      await device.sendControl(FuncCode.SYNC_DATA, 0, syncBytes, 0 /* input/global */);

      // Brief pause to allow the device to process sync data before FIR writes.
      await delay(200);

      // 2. Restore FIR filters channel-by-channel via FC=43 FIR_DATA.
      for (let ch = 0; ch < firBlocks.length; ch++) {
        await device.sendControl(FuncCode.FIR_DATA, ch, firBlocks[ch], 1 /* Output */);
        if (ch < firBlocks.length - 1) {
          await delay(100);
        }
      }
    } finally {
      device.close();
    }

    return NextResponse.json({
      success: true,
      mac,
      syncBytes: syncBytes.length,
      firChannels: firBlocks.length
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// Binary parser
// ---------------------------------------------------------------------------

interface SdParsed {
  syncBytes: Buffer;
  firBlocks: Buffer[]; // each block: name[32] + float32[512] = 2080 bytes
}

function parseSdFile(buf: Buffer, outputChannels: number): SdParsed {
  const total = buf.length;

  // Modern format: last 16 bytes are an ASCII string like "FIR==2080\0...".
  const markerSlice = buf.slice(total - 16);
  const markerText = markerSlice.toString("ascii").replace(/\0/g, "").trim();

  if (markerText.startsWith("FIR==")) {
    const firBlockSize = parseInt(markerText.slice(5), 10);
    if (firBlockSize !== 2080 && firBlockSize !== 2048) {
      throw new Error(`Unknown FIR block size in marker: ${firBlockSize}. Expected 2080 or 2048.`);
    }

    // Determine channel count: prefer caller-supplied value, but validate.
    // Try supplied outputChannels first, fall back to 4, then 2.
    const candidates = [outputChannels, 4, 2, 1].filter((n) => n > 0);
    let syncLen = -1;
    let usedChannels = 0;
    for (const ch of candidates) {
      const candidate = total - ch * firBlockSize - 16;
      if (candidate > 0) {
        syncLen = candidate;
        usedChannels = ch;
        break;
      }
    }

    if (syncLen <= 0) {
      throw new Error(
        `Cannot determine sync struct length. File size: ${total}B, FIR block: ${firBlockSize}B, channels tried: ${candidates.join(", ")}`
      );
    }

    const syncBytes = buf.slice(0, syncLen);
    const firBlocks: Buffer[] = [];

    for (let i = 0; i < usedChannels; i++) {
      const start = syncLen + i * firBlockSize;
      const block = buf.slice(start, start + firBlockSize);

      if (firBlockSize === 2080) {
        // Already has name[32] + float32[512] — send as-is.
        firBlocks.push(block);
      } else {
        // 2048-byte legacy block has no name — prepend 32 zero bytes.
        firBlocks.push(Buffer.concat([Buffer.alloc(32, 0), block]));
      }
    }

    return { syncBytes, firBlocks };
  }

  // Legacy format: no marker. Block size is 2048 (float32[512] only, no names).
  // syncLen = totalLen % 2048; channels = floor(totalLen / 2048).
  const syncLen = total % 2048;
  const firCount = Math.floor(total / 2048);

  if (firCount === 0) {
    // Entire file is sync data — no FIR blocks.
    return { syncBytes: buf, firBlocks: [] };
  }

  const syncBytes = buf.slice(0, syncLen);
  const firBlocks: Buffer[] = [];

  for (let i = 0; i < firCount; i++) {
    const start = syncLen + i * 2048;
    const data2048 = buf.slice(start, start + 2048);
    // Prepend 32-byte zero name field to match FC43 FIR_DATA wire format.
    firBlocks.push(Buffer.concat([Buffer.alloc(32, 0), data2048]));
  }

  return { syncBytes, firBlocks };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
