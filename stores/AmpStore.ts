import { create } from "zustand";

// ---------------------------------------------------------------------------
// Types — three clearly separated concerns
// ---------------------------------------------------------------------------

/** Configured identity: comes from the project file, never overwritten by polling. */
export interface AmpConfig {
  mac: string;
  /** Assignment ID from the project (uuid). */
  id: string;
  /** User-given name stored in the project (optional). */
  customName?: string;
}

/** Live status: written exclusively by the polling layer. */
export interface AmpStatus {
  reachable: boolean;
  /** Last discovered IP address. */
  ip?: string;
  /** Device-reported name (from BASIC_INFO broadcast). */
  name?: string;
  /** Last known device name — kept when device goes offline. */
  lastKnownName?: string;
  /** Firmware version string. */
  version?: string;
  /** Total runtime in minutes (from SN_TABLE, fetched once). */
  run_time?: number;
}

/** On-demand preset list: written exclusively by the presets hook. */
export interface AmpPreset {
  slot: number;
  name: string;
}

export interface AmpPresets {
  /** undefined = never fetched, [] = fetched but empty */
  slots?: AmpPreset[];
}

// ---------------------------------------------------------------------------
// Composed view — what components read
// ---------------------------------------------------------------------------

/** Full amp record as seen by the UI. */
export interface Amp extends AmpConfig, AmpStatus {
  presets?: AmpPreset[];
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

interface AmpStore {
  amps: Amp[];

  // — Seeding (from ProjectStore) —
  /** Replace the full list with project-config amps (status reset to unreachable). */
  seedAmps: (configs: AmpConfig[]) => void;
  /** Add or replace a single config entry (status reset). */
  seedAmp: (config: AmpConfig) => void;
  /** Remove an amp by MAC. */
  removeAmp: (mac: string) => void;
  /** Clear all amps. */
  clearAmps: () => void;

  // — Status (from polling layer) —
  /** Merge live status fields into an existing amp. */
  updateAmpStatus: (mac: string, status: Partial<AmpStatus>) => void;

  // — Presets (from presets hook) —
  /** Set the fetched preset list for an amp. */
  setPresets: (mac: string, presets: AmpPreset[]) => void;

  // — Selectors —
  getDisplayName: (amp: Amp) => string;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

function makeAmp(config: AmpConfig): Amp {
  return { ...config, reachable: false };
}

export const useAmpStore = create<AmpStore>((set) => ({
  amps: [],

  seedAmps: (configs) => set({ amps: configs.map(makeAmp) }),

  seedAmp: (config) =>
    set((state) => ({
      amps: [
        ...state.amps.filter((a) => a.mac !== config.mac),
        makeAmp(config),
      ],
    })),

  removeAmp: (mac) =>
    set((state) => ({ amps: state.amps.filter((a) => a.mac !== mac) })),

  clearAmps: () => set({ amps: [] }),

  updateAmpStatus: (mac, status) =>
    set((state) => ({
      amps: state.amps.map((amp) => {
        if (amp.mac !== mac) return amp;
        const updated: Amp = { ...amp, ...status };
        // Persist last known name when device is reachable and has a name
        if (status.name && status.reachable !== false) {
          updated.lastKnownName = status.name;
        }
        return updated;
      }),
    })),

  setPresets: (mac, presets) =>
    set((state) => ({
      amps: state.amps.map((amp) =>
        amp.mac === mac ? { ...amp, presets } : amp,
      ),
    })),

  getDisplayName: (amp) =>
    amp.name ?? amp.lastKnownName ?? amp.customName ?? "Unknown Amp",
}));
