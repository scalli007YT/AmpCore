"use client";

import { useEffect } from "react";
import { useAmpStore } from "@/stores/AmpStore";
import { parseFC27Channels } from "@/lib/parse-channel-data";

/**
 * useAmpChannelData — Polls channel data for all reachable amps
 *
 * Every 250ms, fetches the latest channel data from all reachable amps,
 * parses the FC=27 response into 4 channel configurations, and stores in AmpStore.
 * This is separate from the heartbeat poller.
 */
export function useAmpChannelData(): void {
  useEffect(() => {
    const channelDataTimer = setInterval(() => {
      const amps = useAmpStore.getState().amps;
      const reachableAmps = amps.filter((amp) => amp.reachable);

      reachableAmps.forEach((amp) => {
        fetch(`/api/amp-channel-data?mac=${encodeURIComponent(amp.mac)}`)
          .then((r) => r.json())
          .then((response) => {
            if (response.success && response.hex) {
              const { syncChannelParams } = useAmpStore.getState();

              // Parse the raw hex into 4 channel configurations
              const channels = parseFC27Channels(response.hex);

              // Sync into ChannelParams for structured access
              syncChannelParams(amp.mac, channels);
            }
          })
          .catch((err) => {
            console.error(
              `[useAmpChannelData] Error fetching data for ${amp.mac}:`,
              err,
            );
          });
      });
    }, 250);

    return () => {
      clearInterval(channelDataTimer);
    };
  }, []);
}
