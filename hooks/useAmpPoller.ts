"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { pollAllAmpsOnce } from "@/lib/amp-polling-controller";
import { usePollingStore } from "@/stores/PollingStore";
import { useAmpStore } from "@/stores/AmpStore";

interface UseAmpPollerReturn {
  isPolling: boolean;
  lastUpdated: Record<string, number>;
  errors: Record<string, string>;
}

/**
 * React hook for polling amps from AmpStore
 * - Starts polling automatically on mount
 * - Stops and cleans up on unmount
 * - Calls server action to fetch device info
 * - Updates AmpStore with results
 * - Returns current polling state
 *
 * Usage:
 * const { isPolling, lastUpdated, errors } = useAmpPoller();
 */
export function useAmpPoller(): UseAmpPollerReturn {
  const pollingStore = usePollingStore();
  const ampStore = useAmpStore();
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const interruptTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Stable ref — always holds the latest amps without being an effect dep.
  // Assigned synchronously on every render so pollFunction always sees fresh data.
  const ampsRef = useRef(ampStore.amps);
  ampsRef.current = ampStore.amps;

  useEffect(() => {
    const pollFunction = async () => {
      const currentAmps = ampsRef.current;

      // Don't poll if no amps
      if (!currentAmps || currentAmps.length === 0) {
        usePollingStore.getState().setIsPolling(false);
        return;
      }

      usePollingStore.getState().setIsPolling(true);

      try {
        // Call server action to poll amps
        const { succeeded, failed } = await pollAllAmpsOnce(currentAmps);

        let reachabilityChanged = false;

        // Update AmpStore with succeeded results only if values changed
        succeeded.forEach((amp) => {
          const existing = ampsRef.current.find((a) => a.mac === amp.mac);

          // Check if reachability changed
          const wasUnreachable = existing?.reachable === false;
          const isNowReachable = amp.reachable === true;

          if (
            !existing ||
            existing.name !== amp.name ||
            existing.version !== amp.version ||
            existing.id !== amp.id ||
            existing.run_time !== amp.run_time ||
            existing.reachable !== amp.reachable
          ) {
            useAmpStore.getState().updateAmpStatus(amp.mac, {
              ip: amp.ip,
              name: amp.name,
              version: amp.version,
              run_time: amp.run_time,
              reachable: true,
            });
            usePollingStore.getState().setLastUpdated(amp.mac, Date.now());

            // Notify if reachability changed
            if (wasUnreachable && isNowReachable) {
              toast.success(`${amp.name || amp.mac} is now reachable`);
              reachabilityChanged = true;
            }
          }
          usePollingStore.getState().setError(amp.mac, null);
        });

        // Mark failed amps as unreachable only if not already marked
        failed.forEach((mac) => {
          const existing = ampsRef.current.find((a) => a.mac === mac);
          if (existing && existing.reachable !== false) {
            useAmpStore.getState().updateAmpStatus(mac, { reachable: false });

            // Notify that amp became unreachable
            toast.error(`${existing.name || mac} is now unreachable`);
            reachabilityChanged = true;
          }
          usePollingStore.getState().setError(mac, "Failed to poll");
        });

        // Trigger interrupt if reachability changed (quick re-poll in 50ms)
        if (reachabilityChanged) {
          usePollingStore.getState().triggerInterrupt();
          if (interruptTimeoutRef.current) {
            clearTimeout(interruptTimeoutRef.current);
          }
          interruptTimeoutRef.current = setTimeout(() => {
            void pollFunction();
            usePollingStore.getState().clearInterrupt();
          }, 50);
        }
      } catch {
        // Silent fail - don't log errors to console
        ampsRef.current.forEach((amp) => {
          usePollingStore.getState().setError(amp.mac, "Polling failed");
        });
      }
    };

    // Run first poll immediately
    void pollFunction();

    // Then set up interval for subsequent polls
    intervalRef.current = setInterval(
      pollFunction,
      pollingStore.updateInterval,
    );

    // Cleanup on unmount or when interval duration changes
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (interruptTimeoutRef.current) {
        clearTimeout(interruptTimeoutRef.current);
        interruptTimeoutRef.current = null;
      }
      usePollingStore.getState().setIsPolling(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pollingStore.updateInterval]);

  return {
    isPolling: pollingStore.isPolling,
    lastUpdated: pollingStore.lastUpdated,
    errors: pollingStore.errors,
  };
}
