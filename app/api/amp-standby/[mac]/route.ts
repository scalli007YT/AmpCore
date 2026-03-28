import { ampController } from "@/lib/amp-controller";
import { FuncCode } from "@/lib/amp-device";
import { isSimulatedMac } from "@/lib/simulated-amps";
import { NextResponse } from "next/server";

/**
 * GET /api/amp-standby/[mac]
 *
 * Reads standby state via FC=15 (STANDBY_DATA) response through the persistent
 * controller socket so Dante amps are supported.
 *
 * FC=15 STANDBY_DATA returns a Standby_data struct with the Standby field.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ mac: string }> }) {
  const { mac } = await params;

  if (isSimulatedMac(mac)) {
    return NextResponse.json({ success: true, standby: false, simulated: true });
  }

  if (!ampController.getIpForMac(mac)) {
    return NextResponse.json({ success: false, error: "Device not yet discovered" }, { status: 404 });
  }

  try {
    const body = await ampController.requestFC(mac, FuncCode.STANDBY_DATA);

    if (body.length < 1) {
      return NextResponse.json({ success: false, error: "Could not read standby state" }, { status: 502 });
    }

    // FC=15 STANDBY_DATA response: body[0] contains the standby flag
    // Matches original C# parsing: body[0] == 1 means standby, 0 means normal
    const standby = body[0] === 1;
    return NextResponse.json({ success: true, standby });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
