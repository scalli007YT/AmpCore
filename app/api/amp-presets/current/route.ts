import { NextRequest, NextResponse } from "next/server";
import { ampController } from "@/lib/amp-controller";
import { FuncCode } from "@/lib/amp-device";

/**
 * POST /api/amp-presets/current
 * Body: { mac: string; ip: string }
 *
 * Queries FC=59 mode=4 via the persistent controller socket and returns
 * the current scenario/preset name.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { mac } = body as { ip?: string; mac?: string };

    if (!mac) {
      return NextResponse.json({ success: false, error: "Missing mac" }, { status: 400 });
    }

    // Save_Recall_data: mode(1)=4 + ch_x(1)=0 + buffers(32)=zeros = 34 bytes
    const reqBody = Buffer.alloc(34, 0);
    reqBody.writeUInt8(4, 0);

    const responseBody = await ampController.requestFC(mac, FuncCode.SAVE_RECALL, 0, reqBody);

    let currentPreset: string | undefined;
    if (responseBody.length >= 34 && responseBody.readUInt8(0) === 4) {
      const nameBuf = responseBody.slice(2, 34);
      const nullIdx = nameBuf.indexOf(0);
      const parsed = nameBuf
        .slice(0, nullIdx === -1 ? nameBuf.length : nullIdx)
        .toString("ascii")
        .trim();
      if (parsed.length > 0) currentPreset = parsed;
    }

    return NextResponse.json({ success: true, mac, currentPreset: currentPreset ?? null });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
