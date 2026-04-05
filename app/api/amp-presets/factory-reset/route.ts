import { NextRequest, NextResponse } from "next/server";
import { CvrAmpDevice } from "@/lib/amp-device";
import { isSimulatedMac, factoryResetSimulated } from "@/lib/simulated-amps";

/**
 * POST /api/amp-presets/factory-reset
 * Body: { mac: string; ip: string }
 *
 * Sends FC=16 (RESET) with payload=1.
 * Confirmed from original C# source: PresetPage.xaml.cs → PreRestore_default()
 *   UDP.SendStruct(Gongneng.RESET, 0, 1)
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { ip, mac } = body as { ip?: string; mac?: string };

    if (!ip || !mac) {
      return NextResponse.json({ success: false, error: "Missing ip or mac" }, { status: 400 });
    }

    if (isSimulatedMac(mac)) {
      const ok = factoryResetSimulated(mac);
      return NextResponse.json(
        ok ? { success: true, mac } : { success: false, error: "Simulated factory reset failed" },
        { status: ok ? 200 : 500 }
      );
    }

    const device = new CvrAmpDevice(ip);
    try {
      await device.factoryReset();
    } finally {
      device.close();
    }

    return NextResponse.json({ success: true, mac });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
