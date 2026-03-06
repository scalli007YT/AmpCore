"use client";

import { useState, useCallback } from "react";
import { useAmpStore } from "@/stores/AmpStore";
import type { AmpPreset } from "@/stores/AmpStore";

interface UseAmpPresetsReturn {
  /** Fetch preset names from the device and write them into AmpStore. */
  fetchPresets: (mac: string) => Promise<void>;
  /** True while a fetch is in flight. */
  fetching: boolean;
  /** Last error message, or null if none. */
  error: string | null;
  /** Clear the last error. */
  clearError: () => void;
}

/**
 * Hook for on-demand preset fetching.
 *
 * Responsibility boundary:
 *   - Owns the fetch lifecycle (loading / error state)
 *   - Reads `ip` from AmpStore (set by the polling layer)
 *   - Writes fetched presets back to AmpStore via `setPresets`
 *   - Never touches polling concerns
 *
 * Usage:
 *   const { fetchPresets, fetching, error } = useAmpPresets();
 *   await fetchPresets(amp.mac);
 */
export function useAmpPresets(): UseAmpPresetsReturn {
  const { amps, setPresets } = useAmpStore();
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPresets = useCallback(
    async (mac: string) => {
      const amp = amps.find((a) => a.mac === mac);

      if (!amp?.ip) {
        setError(
          "No IP address known for this amp yet. Wait for a poll cycle.",
        );
        return;
      }

      setFetching(true);
      setError(null);

      try {
        const res = await fetch("/api/amp-presets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ip: amp.ip, mac }),
        });

        const data = (await res.json()) as {
          success: boolean;
          presets?: AmpPreset[];
          error?: string;
        };

        if (data.success && data.presets) {
          setPresets(mac, data.presets);
        } else {
          setError(data.error ?? "Unknown error from server");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Fetch failed");
      } finally {
        setFetching(false);
      }
    },
    [amps, setPresets],
  );

  const clearError = useCallback(() => setError(null), []);

  return { fetchPresets, fetching, error, clearError };
}
