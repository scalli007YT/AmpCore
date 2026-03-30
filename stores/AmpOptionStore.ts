import { create } from "zustand";
import { z } from "zod";

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
  hydratedByMac: Record<string, boolean>;

  /** Get resolved options for a given MAC (falls back to defaults). */
  getOptions: (mac: string) => AmpOptions;

  /** Update one option field for a given MAC and persist to global-store. */
  setOption: <K extends keyof AmpOptions>(mac: string, key: K, value: AmpOptions[K]) => void;

  /** Load options for one amp from global-store if not loaded yet. */
  ensureHydrated: (mac: string) => Promise<void>;

  /** Force options reload for one amp from global-store. */
  refresh: (mac: string) => Promise<void>;

  /** Persist one amp options entry to global-store. */
  persist: (mac: string) => Promise<void>;

  /** Clear in-memory cache only (does not modify persisted global-store). */
  clear: () => void;
}

function normalizeMac(mac: string): string {
  return mac.trim().toUpperCase();
}

function sanitizeAmpOptions(input: unknown): AmpOptions {
  const candidate = input && typeof input === "object" ? (input as Partial<AmpOptions>) : {};

  const debugMode = candidate.debugMode === true;
  const parsedOffset = limiterLineVoltageOffsetSchema.safeParse(candidate.limiterLineVoltageOffset);

  return {
    debugMode,
    limiterLineVoltageOffset: parsedOffset.success ? parsedOffset.data : DEFAULT_AMP_OPTIONS.limiterLineVoltageOffset
  };
}

export const useAmpOptionStore = create<AmpOptionStore>()((set, get) => ({
  options: {},
  hydratedByMac: {},

  getOptions: (mac) => {
    const key = normalizeMac(mac);
    return { ...DEFAULT_AMP_OPTIONS, ...get().options[key] };
  },

  setOption: (mac, key, value) => {
    const normalizedMac = normalizeMac(mac);
    const current = get().options[normalizedMac] ?? { ...DEFAULT_AMP_OPTIONS };

    let safeValue = value;
    if (key === "limiterLineVoltageOffset") {
      const parsed = limiterLineVoltageOffsetSchema.safeParse(value);
      safeValue = (parsed.success ? parsed.data : current.limiterLineVoltageOffset) as typeof value;
    }

    const updated = { ...current, [key]: safeValue };

    set((state) => ({
      options: { ...state.options, [normalizedMac]: updated },
      hydratedByMac: { ...state.hydratedByMac, [normalizedMac]: true }
    }));

    void get().persist(normalizedMac);
  },

  ensureHydrated: async (mac) => {
    const normalizedMac = normalizeMac(mac);
    if (!normalizedMac) return;
    if (get().hydratedByMac[normalizedMac]) return;
    await get().refresh(normalizedMac);
  },

  refresh: async (mac) => {
    const normalizedMac = normalizeMac(mac);
    if (!normalizedMac) return;

    try {
      const response = await fetch(
        `/api/global-store/${encodeURIComponent(normalizedMac)}?section=${encodeURIComponent("ampOptions")}`
      );
      if (!response.ok) return;

      const payload = (await response.json()) as { data?: unknown };
      const options = sanitizeAmpOptions(payload.data);

      set((state) => ({
        options: { ...state.options, [normalizedMac]: options },
        hydratedByMac: { ...state.hydratedByMac, [normalizedMac]: true }
      }));
    } catch {
      // Keep defaults on failures.
    }
  },

  persist: async (mac) => {
    const normalizedMac = normalizeMac(mac);
    if (!normalizedMac) return;

    try {
      const options = get().options[normalizedMac] ?? { ...DEFAULT_AMP_OPTIONS };
      await fetch(`/api/global-store/${encodeURIComponent(normalizedMac)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          section: "ampOptions",
          value: options
        })
      });
    } catch {
      // Keep in-memory state; retry on next edit.
    }
  },

  clear: () => set({ options: {}, hydratedByMac: {} })
}));
