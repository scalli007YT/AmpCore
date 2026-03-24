/**
 * GET /api/amp-fir-data?mac=XX:XX:XX:XX:XX:XX&channel=0
 *
 * Request FIR filter data (FC=43, statusCode=2) for a specific output channel.
 * Returns the current FIR name and coefficients stored on the device.
 */

import { ampController } from "@/lib/amp-controller";
import { CvrAmpDevice } from "@/lib/amp-device";
import { isSimulatedMac } from "@/lib/simulated-amps";
import { FIR_MAX_TAPS } from "@/lib/fir";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const mac = url.searchParams.get("mac");
  const channelStr = url.searchParams.get("channel");

  if (!mac) {
    return Response.json({ error: "Missing mac parameter" }, { status: 400 });
  }
  if (channelStr === null) {
    return Response.json({ error: "Missing channel parameter" }, { status: 400 });
  }

  const channel = parseInt(channelStr, 10);
  if (isNaN(channel) || channel < 0 || channel > 3) {
    return Response.json({ error: "Invalid channel (0-3)" }, { status: 400 });
  }

  // Simulated amps — return default passthrough
  if (isSimulatedMac(mac)) {
    const coefficients = new Array<number>(FIR_MAX_TAPS).fill(0);
    coefficients[0] = 1;
    return Response.json({
      success: true,
      mac,
      channel,
      name: "",
      coefficients,
      simulated: true
    });
  }

  try {
    ampController.start();

    const ip = ampController.getIpForMac(mac);
    if (!ip) {
      return Response.json({ error: `Amp ${mac} not yet discovered` }, { status: 404 });
    }

    const device = new CvrAmpDevice(ip);
    const result = await device.queryFirData(channel);

    if (!result) {
      return Response.json({ error: "No FIR data response from device" }, { status: 504 });
    }

    return Response.json({
      success: true,
      mac,
      channel,
      name: result.name,
      coefficients: result.coefficients
    });
  } catch (err) {
    console.error("[amp-fir-data] Error:", err);
    return Response.json(
      { error: `FIR query failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 502 }
    );
  }
}
