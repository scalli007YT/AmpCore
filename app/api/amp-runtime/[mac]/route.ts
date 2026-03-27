import { ampController } from "@/lib/amp-controller";
import { FuncCode } from "@/lib/amp-device";
import { getSimulatedRuntimeMinutes, isSimulatedMac } from "@/lib/simulated-amps";
import { NextResponse } from "next/server";

/**
 * GET /api/amp-runtime/[mac]
 *
 * Fetches runtime minutes for a specific amp by MAC address.
 * Issues a SN_TABLE (FC=71) query via the persistent controller socket
 * so that Dante amps (which respond only to port 45454) are supported.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ mac: string }> }) {
  const { mac } = await params;

  if (isSimulatedMac(mac)) {
    const minutes = getSimulatedRuntimeMinutes(mac);
    if (minutes === null) {
      return NextResponse.json({ success: false, error: "Simulated device not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true, minutes, simulated: true });
  }

  if (!ampController.getIpForMac(mac)) {
    return NextResponse.json({ success: false, error: "Device not yet discovered" }, { status: 404 });
  }

  try {
    // SN_TABLE body: stripped of NetworkData(10) + StructHeader(10) + checksum(3)
    // Runtime minutes are at body offset 74 (= raw offset 94 - 20 header bytes).
    const body = await ampController.requestFC(mac, FuncCode.SN_TABLE);

    if (body.length < 78) {
      return NextResponse.json({ success: false, error: "Could not read runtime" }, { status: 500 });
    }

    const minutes = body.readUInt32LE(74);
    return NextResponse.json({ success: true, minutes });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
