import { ampController } from "@/lib/amp-controller";
import { NextResponse } from "next/server";

/**
 * POST /api/amp-advanced/probe-ip
 *
 * Probes a specific IP to discover what amp is there.
 * Returns the MAC and name of whatever amp responds.
 * Used for cross-subnet discovery when the user knows the amp's IP.
 */
export async function POST(req: Request) {
  try {
    const { ip } = (await req.json()) as { ip: string };

    if (typeof ip !== "string" || !/^\d+\.\d+\.\d+\.\d+$/.test(ip.trim())) {
      return NextResponse.json({ success: false, error: "Invalid IP address" }, { status: 400 });
    }

    const trimmedIp = ip.trim();
    ampController.start();
    ampController.probeIp(trimmedIp);

    // Wait for any amp to respond from this IP
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 150));
      const found = ampController.getMacForIp(trimmedIp);
      if (found) {
        return NextResponse.json({
          success: true,
          mac: found.mac,
          name: found.name,
          ip: trimmedIp
        });
      }
    }

    return NextResponse.json({ success: false, error: "No amp responded at this IP" }, { status: 404 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
