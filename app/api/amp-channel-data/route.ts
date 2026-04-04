/**
 * GET /api/amp-channel-data?mac=XX:XX:XX:XX:XX:XX
 *
 * Request FC=27 (Synchronous_data) from a specific amp.
 * Returns channel data for that amp.
 */

import { ampController } from "@/lib/amp-controller";
import { parseFC27RotaryLock } from "@/lib/parse-channel-data";
import { buildSimulatedFc27Hex, isSimulatedMac } from "@/lib/simulated-amps";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const mac = url.searchParams.get("mac");

  if (!mac) {
    return Response.json({ error: "Missing mac parameter" }, { status: 400 });
  }

  if (isSimulatedMac(mac)) {
    const hex = buildSimulatedFc27Hex(mac);
    if (!hex) {
      return Response.json({ success: false, error: `No simulated channel data for ${mac}` }, { status: 404 });
    }

    const locked = parseFC27RotaryLock(hex);

    return Response.json({
      success: true,
      mac,
      length: hex.length / 2,
      hex,
      simulated: true,
      locked
    });
  }

  try {
    // Ensure controller is started
    ampController.start();

    // Request FC=27 from this amp (returns ALL channel data in multi-packet response)
    const data = await ampController.requestFC27(mac, 0);
    const hex = data.toString("hex");
    const locked = parseFC27RotaryLock(hex);

    const response = {
      success: true,
      mac,
      length: data.length,
      hex,
      locked
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const cached = ampController.getLastFC27(mac);
    if (cached) {
      const hex = cached.body.toString("hex");
      const locked = parseFC27RotaryLock(hex);
      const ageMs = Math.max(0, Date.now() - cached.at);

      return Response.json({
        success: true,
        mac,
        length: cached.body.length,
        hex,
        locked,
        stale: true,
        staleAgeMs: ageMs,
        warning: `Live FC=27 failed: ${message}`
      });
    }

    return Response.json({ success: false, error: message }, { status: 500 });
  }
}
