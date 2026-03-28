import { NextRequest, NextResponse } from "next/server";
import { ampController } from "@/lib/amp-controller";
import { FuncCode } from "@/lib/amp-device";
import { getSimulatedPresets, isSimulatedMac } from "@/lib/simulated-amps";

const SLOT_SIZE = 32;

/**
 * Parse preset slot names from a raw FC=59 mode=0 response body.
 */
function parsePresetBody(body: Buffer): { slot: number; name: string }[] {
  if (body.length === 0 || body.length % SLOT_SIZE !== 0) return [];

  const slotCount = Math.min(body.length / SLOT_SIZE, 40);
  const presets: { slot: number; name: string }[] = [];

  for (let i = 0; i < slotCount; i++) {
    const slotBuf = body.slice(i * SLOT_SIZE, (i + 1) * SLOT_SIZE);
    const nullIdx = slotBuf.indexOf(0);
    const name = slotBuf
      .slice(0, nullIdx === -1 ? SLOT_SIZE : nullIdx)
      .toString("ascii")
      .trim();
    if (name.length > 0 && name.toLowerCase() !== "null") {
      presets.push({ slot: i + 1, name });
    }
  }

  return presets;
}

/**
 * POST /api/amp-presets
 * Body: { mac: string; ip: string }
 *
 * Sends FC=59 mode=0 via the persistent controller socket and returns the
 * list of preset slot names parsed from the response.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { mac } = body as { ip?: string; mac?: string };

    if (!mac) {
      return NextResponse.json({ success: false, error: "Missing mac" }, { status: 400 });
    }

    if (isSimulatedMac(mac)) {
      return NextResponse.json({ success: true, mac, presets: getSimulatedPresets(mac) ?? [] });
    }

    // Save_Recall_data: mode(1)=0 + ch_x(1)=0 + buffers(32)=zeros = 34 bytes
    const reqBody = Buffer.alloc(34, 0);
    const responseBody = await ampController.requestFC(mac, FuncCode.SAVE_RECALL, 0, reqBody);
    const presets = parsePresetBody(responseBody);

    return NextResponse.json({ success: true, mac, presets });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
