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
    const { ip } = (await req.json()) as { ip: string };

    if (typeof ip !== "string" || !/^\d+\.\d+\.\d+\.\d+$/.test(ip.trim())) {
      return NextResponse.json({ success: false, error: "Invalid IP address" }, { status: 400 });
    }

    ampController.probeIp(ip.trim());
    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
