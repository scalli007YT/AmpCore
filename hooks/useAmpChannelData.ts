"use client";

import { useEffect } from "react";
import { useAmpStore } from "@/stores/AmpStore";
import { parseFC27Channels, parseFC27RotaryLock } from "@/lib/parse-channel-data";

const CHANNEL_DATA_POLL_MS = 250;
const LOCK_POLL_MS = 2000;
let channelDataTimer: ReturnType<typeof setInterval> | null = null;
let channelDataSubscribers = 0;
const inFlightMacs = new Set<string>();
const inFlightLockMacs = new Set<string>();
const lastLockPollAtByMac = new Map<string, number>();
const forceLockPollMacs = new Set<string>();

export function triggerImmediateLockPoll(mac: string): void {
  if (!mac) return;
  forceLockPollMacs.add(mac);
}

/**
 * useAmpChannelData — Polls channel data for all reachable amps
 *
 * Every 250ms, fetches the latest channel data from all reachable amps,
 * parses the FC=27 response into 4 channel configurations, and stores in AmpStore.
 * This is separate from the heartbeat poller.
 */
export function useAmpChannelData(): void {
  useEffect(() => {
    channelDataSubscribers++;

    if (!channelDataTimer) {
      channelDataTimer = setInterval(() => {
        const amps = useAmpStore.getState().amps;
        const reachableAmps = amps.filter((amp) => amp.reachable);

        reachableAmps.forEach((amp) => {
          if (inFlightMacs.has(amp.mac)) return;
          inFlightMacs.add(amp.mac);

          fetch(`/api/amp-channel-data?mac=${encodeURIComponent(amp.mac)}`)
            .then((r) => r.json())
            .then((response) => {
              if (response.success && response.hex) {
                const { syncChannelParams, updateAmpStatus } = useAmpStore.getState();

                // Parse the raw hex into 4 channel configurations
                const channels = parseFC27Channels(response.hex);
                const locked = parseFC27RotaryLock(response.hex);

                // Sync into ChannelParams for structured access
                syncChannelParams(amp.mac, channels);
                if (locked !== undefined) {
                  updateAmpStatus(amp.mac, { locked });
                }
              }
            })
            .catch((err) => {
              console.error(`[useAmpChannelData] Error fetching data for ${amp.mac}:`, err);
            })
            .finally(() => {
              inFlightMacs.delete(amp.mac);
            });

          const now = Date.now();
          const lastLockPollAt = lastLockPollAtByMac.get(amp.mac) ?? 0;
          const shouldForceLockPoll = forceLockPollMacs.has(amp.mac);
          if (!inFlightLockMacs.has(amp.mac) && (shouldForceLockPoll || now - lastLockPollAt >= LOCK_POLL_MS)) {
            inFlightLockMacs.add(amp.mac);
            forceLockPollMacs.delete(amp.mac);
            lastLockPollAtByMac.set(amp.mac, now);

            fetch(`/api/amp-lock/${encodeURIComponent(amp.mac)}`)
              .then((r) => r.json())
              .then((response) => {
                if (response.success && typeof response.locked === "boolean") {
                  useAmpStore.getState().updateAmpStatus(amp.mac, { locked: response.locked });
                }
              })
              .catch((err) => {
                console.warn(`[useAmpChannelData] Error fetching lock state for ${amp.mac}:`, err);
              })
              .finally(() => {
                inFlightLockMacs.delete(amp.mac);
              });
          }
        });
      }, CHANNEL_DATA_POLL_MS);
    }

    return () => {
      channelDataSubscribers = Math.max(0, channelDataSubscribers - 1);
      if (channelDataSubscribers === 0 && channelDataTimer) {
        clearInterval(channelDataTimer);
        channelDataTimer = null;
        inFlightMacs.clear();
        inFlightLockMacs.clear();
        lastLockPollAtByMac.clear();
        forceLockPollMacs.clear();
      }
    };
  }, []);
}
