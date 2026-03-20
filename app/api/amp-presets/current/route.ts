import { NextRequest, NextResponse } from "next/server";
import { CvrAmpDevice } from "@/lib/amp-device";

/**
 * POST /api/amp-presets/current
 * Body: { mac: string; ip: string }
 *
 * Queries FC=59 mode=4 and returns the current scenario/preset name.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { ip, mac } = body as { ip?: string; mac?: string };

    if (!ip || !mac) {
      return NextResponse.json({ success: false, error: "Missing ip or mac" }, { status: 400 });
    }

    const device = new CvrAmpDevice(ip);
    let currentPreset: string | undefined;
    try {
      currentPreset = await device.queryCurrentPresetName();
    } finally {
      device.close();
    }

    return NextResponse.json({ success: true, mac, currentPreset: currentPreset ?? null });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
