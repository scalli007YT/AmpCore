import { NextRequest, NextResponse } from "next/server";
import { ampController } from "@/lib/amp-controller";
import { FuncCode } from "@/lib/amp-device";
import { isSimulatedMac } from "@/lib/simulated-amps";

/**
 * POST /api/amp-presets/export-sd
 * Body: { mac: string; ip: string; outputChannels?: number }
 *
 * Builds a .sd binary file from the device's live state:
 *   1. Requests a fresh FC=27 sync snapshot from the device.
 *   2. Requests FIR data for each output channel via FC=43.
 *   3. Appends a 16-byte "FIR==2080\0..." marker.
 *
 * Returns the binary as an application/octet-stream download.
 * This matches the format produced by the original CVR software "On PC → Store".
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { mac, ip, outputChannels } = body as {
      mac?: string;
      ip?: string;
      outputChannels?: number;
    };

    if (!mac || !ip) {
      return NextResponse.json({ success: false, error: "Missing mac or ip" }, { status: 400 });
    }

    if (isSimulatedMac(mac)) {
      return NextResponse.json({ success: false, error: "Cannot export .sd from a simulated amp" }, { status: 400 });
    }

    ampController.start();

    // 1. Request a fresh FC=27 sync snapshot directly from the device.
    let syncBytes: Buffer;
    try {
      syncBytes = await ampController.requestFC27(mac, 0);
      if (syncBytes.length === 0) throw new Error("Empty response");
    } catch {
      return NextResponse.json(
        { success: false, error: "Could not read device state (FC=27). Make sure the device is reachable." },
        { status: 503 }
      );
    }
    const chCount = Math.max(1, Math.min(4, outputChannels ?? 4));

    // 2. Request FIR data per channel via FC=43.
    const firBlocks: Buffer[] = [];
    for (let ch = 0; ch < chCount; ch++) {
      try {
        const firBody = await ampController.requestFC(mac, FuncCode.FIR_DATA, ch, Buffer.alloc(0), 1, 2000);
        // FIR_DATA response: name[32] + float32[512] = 2080 bytes
        if (firBody.length >= 2080) {
          firBlocks.push(firBody.slice(0, 2080));
        } else {
          // Pad to 2080 if shorter
          const padded = Buffer.alloc(2080, 0);
          firBody.copy(padded, 0);
          firBlocks.push(padded);
        }
      } catch {
        // If a channel fails, push a passthrough FIR (impulse at index 0)
        const passthrough = Buffer.alloc(2080, 0);
        passthrough.writeFloatLE(1.0, 32); // float32[0] = 1.0 after 32-byte name
        firBlocks.push(passthrough);
      }
    }

    // 3. Build the 16-byte FIR marker: "FIR==2080\0..." (null-padded to 16 bytes)
    const markerStr = `FIR==2080`;
    const marker = Buffer.alloc(16, 0);
    Buffer.from(markerStr, "ascii").copy(marker, 0);

    // 4. Concatenate: sync + FIR blocks + marker
    const combined = Buffer.concat([syncBytes, ...firBlocks, marker]);

    return new NextResponse(combined, {
      status: 200,
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="amp-backup.sd"`,
        "Content-Length": String(combined.length)
      }
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
