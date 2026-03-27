import { ampController } from "@/lib/amp-controller";
import { NextResponse } from "next/server";

/**
 * POST /api/amp-advanced/probe-ip
 *
 * Seeds a specific IP into the AmpController's rememberedIps map and
 * immediately triggers a discovery probe to that IP.
 * Used for cross-subnet first-time discovery when the user knows the amp's IP.
 */
export async function POST(req: Request) {
  try {
    const { ip, mac } = (await req.json()) as { ip: string; mac?: string };
    console.log(`[probe-ip] Received request: ip=${ip}, mac=${mac}`);

    if (typeof ip !== "string" || !/^\d+\.\d+\.\d+\.\d+$/.test(ip.trim())) {
      console.error(`[probe-ip] Invalid IP format: ${ip}`);
      return NextResponse.json({ success: false, error: "Invalid IP address" }, { status: 400 });
    }

    const trimmedIp = ip.trim();
    console.log(`[probe-ip] Starting controller and probing IP: ${trimmedIp}`);
    ampController.start();
    ampController.probeIp(trimmedIp);

    // If MAC is provided, only report success once this specific amp is mapped to the new IP.
    if (typeof mac === "string" && mac.trim().length > 0) {
      const targetMac = mac.trim().toUpperCase();
      console.log(`[probe-ip] Waiting for MAC ${targetMac} to be discovered at ${trimmedIp}`);
      const deadline = Date.now() + 5000;
      while (Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 200));
        const knownIp = ampController.getIpForMac(targetMac);
        if (knownIp === trimmedIp) {
          console.log(`[probe-ip] Success: MAC ${targetMac} found at ${trimmedIp}`);
          return NextResponse.json({ success: true });
        }
      }
      console.warn(`[probe-ip] Timeout waiting for MAC ${targetMac} at ${trimmedIp}`);
      return NextResponse.json({ success: false, error: "Probe timed out" }, { status: 404 });
    }

    console.log(`[probe-ip] Probe sent to ${trimmedIp} (no MAC verification)`);
    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[probe-ip] Error: ${msg}`);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
