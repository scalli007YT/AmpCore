"use server";

import { CvrAmpDevice } from "./amp-device";
import { broadcastDiscovery } from "./amp-scan";
import type { Amp } from "@/stores/AmpStore";

/**
 * Poll all amps via a single broadcast.
 * - Sends one BASIC_INFO broadcast to 255.255.255.255:45455
 * - Each amp replies with its full identity (name, version, MAC) in one packet
 * - On first discovery (run_time === undefined), fetches SN_TABLE once for runtime
 * - Total time = 200ms broadcast window + optional ~200ms SN_TABLE per new amp
 */
export async function pollAllAmpsOnce(ampsToQuery: Amp[]): Promise<{
  succeeded: Amp[];
  failed: string[];
}> {
  const amps = ampsToQuery || [];

  if (amps.length === 0) {
    return { succeeded: [], failed: [] };
  }

  let discovered: Map<
    string,
    { ip: string; mac: string; name: string; version: string }
  >;
  try {
    const devices = await broadcastDiscovery();
    discovered = new Map(devices.map((d) => [d.mac, d]));
  } catch (err) {
    console.error("Broadcast discovery failed:", err);
    return { succeeded: [], failed: amps.map((a) => a.mac) };
  }

  const succeeded: Amp[] = [];
  const failed: string[] = [];

  for (const amp of amps) {
    const device = discovered.get(amp.mac);
    if (!device) {
      failed.push(amp.mac);
      continue;
    }

    // Fetch runtime once on first discovery (SN_TABLE FC=71)
    let run_time = amp.run_time;
    if (run_time === undefined) {
      try {
        const dev = new CvrAmpDevice(device.ip);
        run_time = await dev.queryRuntime();
        dev.close();
      } catch {
        // Silent fail — will retry next poll cycle
      }
    }

    succeeded.push({
      ...amp,
      name: device.name || amp.name,
      version: device.version || amp.version,
      run_time,
      reachable: true,
    });
  }

  return { succeeded, failed };
}
