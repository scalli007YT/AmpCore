import { create } from "zustand";

const GLOBAL_SCOPE = "__global__";

interface SpeakerConfigStore {
  selectedOutputChannelsByScope: Record<string, number[]>;
  toggleOutputChannel: (channel: number, scope?: string | null) => void;
  setOutputChannels: (channels: number[], scope?: string | null) => void;
  clearOutputChannels: (scope?: string | null) => void;
}

function toScopeKey(scope?: string | null): string {
  const normalized = scope?.trim().toUpperCase();
  return normalized && normalized.length > 0 ? normalized : GLOBAL_SCOPE;
}

function sanitizeChannels(channels: number[]): number[] {
  return Array.from(new Set(channels.filter((v) => Number.isInteger(v) && v > 0))).sort((a, b) => a - b);
}

export const useSpeakerConfigStore = create<SpeakerConfigStore>((set) => ({
  selectedOutputChannelsByScope: {},

  toggleOutputChannel: (channel, scope) => {
    if (!Number.isInteger(channel) || channel <= 0) return;

    const scopeKey = toScopeKey(scope);

    set((state) => {
      const current = state.selectedOutputChannelsByScope[scopeKey] ?? [];
      const exists = current.includes(channel);
      const next = exists ? current.filter((v) => v !== channel) : [...current, channel].sort((a, b) => a - b);

      return {
        selectedOutputChannelsByScope: {
          ...state.selectedOutputChannelsByScope,
          [scopeKey]: next
        }
      };
    });
  },

  setOutputChannels: (channels, scope) => {
    const scopeKey = toScopeKey(scope);
    const next = sanitizeChannels(channels);

    set((state) => ({
      selectedOutputChannelsByScope: {
        ...state.selectedOutputChannelsByScope,
        [scopeKey]: next
      }
    }));
  },

  clearOutputChannels: (scope) => {
    const scopeKey = toScopeKey(scope);

    set((state) => ({
      selectedOutputChannelsByScope: {
        ...state.selectedOutputChannelsByScope,
        [scopeKey]: []
      }
    }));
  }
}));
