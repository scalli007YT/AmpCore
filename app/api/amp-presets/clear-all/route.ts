import { NextRequest, NextResponse } from "next/server";
import { CvrAmpDevice } from "@/lib/amp-device";
import { isSimulatedMac, clearAllSimulatedPresets } from "@/lib/simulated-amps";

/**
 * POST /api/amp-presets/clear-all
 * Body: { mac: string; ip: string }
 *
 * Sends FC=59 clear-all command using Save_Recall_data { mode=3, ch_x=0, buffers=[32x0] }.
 * Confirmed from original C# source: Save_Recall_Window.xaml.cs → Button_Click (Clear All).
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { ip, mac } = body as { ip?: string; mac?: string };

    if (!ip || !mac) {
      return NextResponse.json({ success: false, error: "Missing ip or mac" }, { status: 400 });
    }

    if (isSimulatedMac(mac)) {
      const ok = clearAllSimulatedPresets(mac);
      return NextResponse.json(
        ok ? { success: true, mac } : { success: false, error: "Failed to clear simulated presets" },
        { status: ok ? 200 : 500 }
      );
    }

    const device = new CvrAmpDevice(ip);
    try {
      await device.clearAllPresets();
    } finally {
      device.close();
    }

    return NextResponse.json({ success: true, mac });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
