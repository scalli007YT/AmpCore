/**
 * Shared utilities for the speaker config subsystem.
 * Used by speaker-device, load-speaker-config-dialog, speaker-control-bar,
 * and speaker-library-browser so these primitives are defined exactly once.
 */

import { findGroupForChannel, type ChannelGroup } from "@/stores/SpeakerConfigStore";
import { type LibraryFileEntry } from "@/stores/LibraryStore";

// ---------------------------------------------------------------------------
// Scope key
// ---------------------------------------------------------------------------

const GLOBAL_SCOPE = "__global__";

/** Normalise a MAC-address scope to a consistent upper-cased key. */
export function toScopeKey(scope?: string | null): string {
  const normalized = scope?.trim().toUpperCase();
  return normalized && normalized.length > 0 ? normalized : GLOBAL_SCOPE;
}

// ---------------------------------------------------------------------------
// File identity
// ---------------------------------------------------------------------------

/** Stable, unique key for a library file. Always prefer `id`; fall back to `name`. */
export function fileKey(file: LibraryFileEntry): string {
  return file.id || file.name;
}

// ---------------------------------------------------------------------------
// Row segments
// ---------------------------------------------------------------------------

export type RowSegment = {
  channels: number[];
  group: ChannelGroup | null;
  type: "single" | "join" | "bridge";
};

/** Build the list of visual row segments from the current channel groups. */
export function buildRowSegments(rowCount: number, groups: ChannelGroup[]): RowSegment[] {
  const segments: RowSegment[] = [];
  const visited = new Set<number>();

  for (let ch = 1; ch <= rowCount; ch++) {
    if (visited.has(ch)) continue;

    const group = findGroupForChannel(groups, ch);
    if (group) {
      for (const gch of group.channels) visited.add(gch);
      segments.push({ channels: group.channels, group, type: group.type });
    } else {
      visited.add(ch);
      segments.push({ channels: [ch], group: null, type: "single" });
    }
  }

  return segments;
}

// ---------------------------------------------------------------------------
// Channel list formatting
// ---------------------------------------------------------------------------

/**
 * Format a list of 1-based channel numbers for display.
 * e.g. [1, 2] → "CH 1, CH 2"
 */
export function formatChannelList(channels: number[]): string {
  return channels.map((ch) => `CH ${ch}`).join(", ");
}
