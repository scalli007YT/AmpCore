import { ampController } from "@/lib/amp-controller";
import { FuncCode } from "@/lib/amp-device";
import { isSimulatedMac } from "@/lib/simulated-amps";
import { NextResponse } from "next/server";

/**
 * GET /api/amp-lock/[mac]
 *
 * Reads lock state via FC=17 (ROTARY_LOCK) response through the persistent
 * controller socket so Dante amps are supported.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ mac: string }> }) {
  const { mac } = await params;

  if (isSimulatedMac(mac)) {
    return NextResponse.json({ success: true, locked: false, simulated: true });
  }

  if (!ampController.getIpForMac(mac)) {
    return NextResponse.json({ success: false, error: "Device not yet discovered" }, { status: 404 });
  }

  try {
    const body = await ampController.requestFC(mac, FuncCode.ROTARY_LOCK);

    if (body.length < 1) {
      return NextResponse.json({ success: false, error: "Could not read lock state" }, { status: 502 });
    }

    const locked = body[0] === 1;
    return NextResponse.json({ success: true, locked });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
