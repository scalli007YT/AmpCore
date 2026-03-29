import { create } from "zustand";
import { z } from "zod";
import { useProjectStore } from "./ProjectStore";

const limiterLineVoltageOffsetSchema = z.number().min(0).max(1.5);

export interface AmpOptions {
  debugMode: boolean;
  limiterLineVoltageOffset: number;
}

export const DEFAULT_AMP_OPTIONS: AmpOptions = {
  debugMode: false,
  limiterLineVoltageOffset: 0
};

interface AmpOptionStore {
  /** Per-amp options keyed by MAC address (upper-case). */
  options: Record<string, AmpOptions>;

  /** Get resolved options for a given MAC (falls back to defaults). */
  getOptions: (mac: string) => AmpOptions;

  /** Update one or more option fields for a given MAC and persist to project. */
  setOption: <K extends keyof AmpOptions>(mac: string, key: K, value: AmpOptions[K]) => void;

  /** Bulk-hydrate options from a project file (called on project load). */
  hydrate: (entries: Array<{ mac: string; options?: Partial<AmpOptions> }>) => void;

  /** Clear all options (called on project deselect). */
  clear: () => void;
}

export const useAmpOptionStore = create<AmpOptionStore>()((set, get) => ({
  options: {},

  getOptions: (mac) => {
    const key = mac.toUpperCase();
    return { ...DEFAULT_AMP_OPTIONS, ...get().options[key] };
  },

  setOption: (mac, key, value) => {
    const normalizedMac = mac.toUpperCase();
    const current = get().options[normalizedMac] ?? { ...DEFAULT_AMP_OPTIONS };

    let safeValue = value;
    if (key === "limiterLineVoltageOffset") {
      const parsed = limiterLineVoltageOffsetSchema.safeParse(value);
      safeValue = (parsed.success ? parsed.data : current.limiterLineVoltageOffset) as typeof value;
    }

    const updated = { ...current, [key]: safeValue };

    set((state) => ({
      options: { ...state.options, [normalizedMac]: updated }
    }));

    // Persist to project file via ProjectStore
    useProjectStore.getState().updateAmpOptions(normalizedMac, updated);
  },

  hydrate: (entries) => {
    const next: Record<string, AmpOptions> = {};
    for (const entry of entries) {
      next[entry.mac.toUpperCase()] = { ...DEFAULT_AMP_OPTIONS, ...entry.options };
    }
    set({ options: next });
  },

  clear: () => set({ options: {} })
}));
