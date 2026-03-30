import { create } from "zustand";

export interface LibraryFileEntry {
  name: string;
  byteLength: number;
  brand: string;
  family: string;
  model: string;
  ways: string;
  notes: string;
  tdNum: number;
  payloadByteLength: number;
  hasDeviceFlag: boolean;
  rawBase64: string;
  payloadBase64: string;
  parseError?: string;
}

interface LibraryStore {
  files: LibraryFileEntry[];
  loading: boolean;
  error: string | null;
  hasLoaded: boolean;
  loadLibrary: () => Promise<void>;
}

export const useLibraryStore = create<LibraryStore>((set) => ({
  files: [],
  loading: false,
  error: null,
  hasLoaded: false,

  loadLibrary: async () => {
    set({ loading: true, error: null });

    try {
      const response = await fetch("/api/library", { cache: "no-store" });
      const data = (await response.json()) as {
        success: boolean;
        files?: LibraryFileEntry[];
        error?: string;
      };

      if (!response.ok || !data.success) {
        throw new Error(data.error ?? `HTTP ${response.status}`);
      }

      set({
        files: data.files ?? [],
        loading: false,
        error: null,
        hasLoaded: true
      });
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : "Failed to load library",
        hasLoaded: true
      });
    }
  }
}));
