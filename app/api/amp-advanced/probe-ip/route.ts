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

    if (typeof ip !== "string" || !/^\d+\.\d+\.\d+\.\d+$/.test(ip.trim())) {
      return NextResponse.json({ success: false, error: "Invalid IP address" }, { status: 400 });
    }

    const trimmedIp = ip.trim();
    ampController.start();
    ampController.probeIp(trimmedIp);

    // If MAC is provided, only report success once this specific amp is mapped to the new IP.
    if (typeof mac === "string" && mac.trim().length > 0) {
      const targetMac = mac.trim().toUpperCase();
      const deadline = Date.now() + 5000;
      while (Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 200));
        const knownIp = ampController.getIpForMac(targetMac);
        if (knownIp === trimmedIp) {
          return NextResponse.json({ success: true });
        }
      }
      return NextResponse.json({ success: false, error: "Probe timed out" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
