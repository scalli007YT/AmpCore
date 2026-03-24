import { ampController } from "@/lib/amp-controller";
import { CvrAmpDevice } from "@/lib/amp-device";
import { isSimulatedMac } from "@/lib/simulated-amps";
import { NextResponse } from "next/server";

/**
 * GET /api/amp-lock/[mac]
 *
 * Reads lock state via FC=17 (ROTARY_LOCK) response.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ mac: string }> }) {
  const { mac } = await params;

  if (isSimulatedMac(mac)) {
    // Simulated devices do not currently expose lock-state readback.
    return NextResponse.json({ success: true, locked: false, simulated: true });
  }

  const ip = ampController.getIpForMac(mac);
  if (!ip) {
    return NextResponse.json({ success: false, error: "Device not yet discovered" }, { status: 404 });
  }

  try {
    const device = new CvrAmpDevice(ip);
    const locked = await device.queryRotaryLock();
    device.close();

    if (locked === undefined) {
      return NextResponse.json({ success: false, error: "Could not read lock state" }, { status: 502 });
    }

    return NextResponse.json({ success: true, locked });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
