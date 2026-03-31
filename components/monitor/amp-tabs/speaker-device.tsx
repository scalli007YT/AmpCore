"use client";

import { type DragEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link2, SplitSquareVertical, Upload } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  type LibraryFileEntry,
  useLibraryStore,
  type SaveWayMapping,
  type ApplyWayMapping,
  type SaveProgress,
  type ApplyProgress
} from "@/stores/LibraryStore";
import { type SpeakerProfileDraft, SpeakerConfigEditorDialog } from "@/components/dialogs/speaker-config-editor-dialog";
import {
  type ChannelGroup,
  type SpeakerDragItem,
  type SpeakerOutputAssignment,
  findGroupForChannel,
  useSpeakerConfigStore
} from "@/stores/SpeakerConfigStore";
import { SPEAKER_DRAG_MIME } from "@/lib/constants";

const EMPTY_SELECTION: number[] = [];
const EMPTY_ASSIGNMENTS: Record<number, { model: string; wayLabel: string }> = {};
const EMPTY_GROUPS: ChannelGroup[] = [];

interface SpeakerDeviceDraftProps {
  channelCount?: number;
  scope?: string | null;
}

type RowSegment = {
  channels: number[];
  group: ChannelGroup | null;
  type: "single" | "join" | "bridge";
};

function formatChannelList(channels: number[]): string {
  return channels.map((channel) => `CH ${channel + 1}`).join(", ");
}

function buildSaveProgressMessage(progress: SaveProgress): { title: string; description?: string } {
  if (progress.stage === "reading-way") {
    return {
      title: `Saving speaker profile ${progress.current}/${progress.total}`,
      description: `Reading ${progress.label || `Way ${progress.current}`} from CH ${(progress.channel ?? 0) + 1}`
    };
  }

  if (progress.stage === "writing-library") {
    return {
      title: "Saving speaker profile",
      description: "Writing captured FC=57 data into the library"
    };
  }

  return {
    title: "Saving speaker profile",
    description: "Refreshing library entries"
  };
}

function buildApplyProgressMessage(progress: ApplyProgress): { title: string; description?: string } {
  const channelText = formatChannelList(progress.channels);

  if (progress.stage === "sending-way") {
    return {
      title: `Applying speaker config ${progress.current}/${progress.total}`,
      description: `Sending to ${channelText}`
    };
  }

  const result = progress.result;
  if (!result) {
    return {
      title: `Applying speaker config ${progress.current}/${progress.total}`,
      description: `Finished ${channelText}`
    };
  }

  if (!result.sent) {
    return {
      title: `Applying speaker config ${progress.current}/${progress.total}`,
      description: `Failed on ${channelText}`
    };
  }

  const recoveryUsed = result.frameAttemptsMax > 1 || result.fragmentRetries > 0;
  return {
    title: `Applying speaker config ${progress.current}/${progress.total}`,
    description: recoveryUsed
      ? `Applied to ${channelText} after automatic retry recovery`
      : `Applied to ${channelText} cleanly`
  };
}

/** Build a list of visual row segments from channel groups. */
function buildRowSegments(rowCount: number, groups: ChannelGroup[]) {
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

export function SpeakerModelDraft({ channelCount = 4, scope }: SpeakerDeviceDraftProps) {
  const rowCount = Math.max(1, Math.min(channelCount, 8));
  const scopeKey = scope?.trim().toUpperCase() || "__global__";
  const lastClickedChannelRef = useRef<number | null>(null);
  const [previewChannels, setPreviewChannels] = useState<number[]>([]);
  const [previewValid, setPreviewValid] = useState(true);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorDraft, setEditorDraft] = useState<SpeakerProfileDraft>({
    brand: "",
    family: "",
    model: "",
    application: "",
    notes: "",
    ways: [{ id: "way-1", label: "Way 1", role: "custom" }]
  });
  const [editorTargetChannel, setEditorTargetChannel] = useState(1);
  const [editorSegmentKey, setEditorSegmentKey] = useState<string | null>(null);
  const [editorDraftBySegment, setEditorDraftBySegment] = useState<Record<string, SpeakerProfileDraft>>({});

  const libraryFiles = useLibraryStore((state) => state.files);
  const libraryHasLoaded = useLibraryStore((state) => state.hasLoaded);
  const loadLibrary = useLibraryStore((state) => state.loadLibrary);
  const saving = useLibraryStore((state) => state.saving);
  const saveToLibrary = useLibraryStore((state) => state.saveToLibrary);
  const applying = useLibraryStore((state) => state.applying);
  const applyToDevice = useLibraryStore((state) => state.applyToDevice);

  const selectedOutputChannelsByScope = useSpeakerConfigStore((state) => state.selectedOutputChannelsByScope);
  const outputAssignmentsByScope = useSpeakerConfigStore((state) => state.outputAssignmentsByScope);
  const channelGroupsByScope = useSpeakerConfigStore((state) => state.channelGroupsByScope);
  const activeDraggedItem = useSpeakerConfigStore((state) => state.activeDraggedItem);
  const dragHoverChannel = useSpeakerConfigStore((state) => state.dragHoverChannel);
  const setActiveDraggedItem = useSpeakerConfigStore((state) => state.setActiveDraggedItem);
  const setOutputChannels = useSpeakerConfigStore((state) => state.setOutputChannels);
  const clearOutputChannels = useSpeakerConfigStore((state) => state.clearOutputChannels);
  const assignItemToOutputs = useSpeakerConfigStore((state) => state.assignItemToOutputs);
  const hydrateScopeFromGlobalStore = useSpeakerConfigStore((state) => state.hydrateScopeFromGlobalStore);
  const persistScopeToGlobalStore = useSpeakerConfigStore((state) => state.persistScopeToGlobalStore);
  const selectedOutputChannels = selectedOutputChannelsByScope[scopeKey] ?? EMPTY_SELECTION;
  const outputAssignments = outputAssignmentsByScope[scopeKey] ?? EMPTY_ASSIGNMENTS;
  const channelGroups = channelGroupsByScope[scopeKey] ?? EMPTY_GROUPS;
  const [hydratedScopeKey, setHydratedScopeKey] = useState<string | null>(null);

  const segments = useMemo(() => buildRowSegments(rowCount, channelGroups), [rowCount, channelGroups]);

  useEffect(() => {
    if (libraryHasLoaded) return;
    void loadLibrary();
  }, [libraryHasLoaded, loadLibrary]);

  useEffect(() => {
    if (!scope) {
      setHydratedScopeKey(null);
      return;
    }

    const key = scope.trim().toUpperCase();
    let cancelled = false;

    void (async () => {
      await hydrateScopeFromGlobalStore(scope);
      if (!cancelled) {
        setHydratedScopeKey(key);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [scope, hydrateScopeFromGlobalStore]);

  useEffect(() => {
    if (!scope || hydratedScopeKey !== scopeKey) return;

    const timer = setTimeout(() => {
      void persistScopeToGlobalStore(scope);
    }, 250);

    return () => clearTimeout(timer);
  }, [
    scope,
    scopeKey,
    hydratedScopeKey,
    selectedOutputChannels,
    channelGroups,
    outputAssignments,
    persistScopeToGlobalStore
  ]);

  const buildRangeSelection = (from: number, to: number): number[] => {
    const min = Math.min(from, to);
    const max = Math.max(from, to);
    return Array.from({ length: max - min + 1 }, (_, index) => min + index);
  };

  const deriveDraftFromProfile = (profile: LibraryFileEntry): SpeakerProfileDraft => {
    const ways =
      profile.ways.length > 0
        ? profile.ways.map((way) => ({ id: way.id, label: way.label, role: way.role }))
        : [{ id: "way-1", label: "Way 1", role: "custom" }];

    return {
      id: profile.id,
      brand: profile.brand,
      family: profile.family,
      model: profile.model,
      application: profile.application,
      notes: profile.notes,
      ways
    };
  };

  const deriveDraftForSegment = (segment: RowSegment): SpeakerProfileDraft => {
    const firstAssignment = outputAssignments[segment.channels[0]] as SpeakerOutputAssignment | undefined;

    if (!firstAssignment) {
      const defaultWays =
        segment.type === "join"
          ? segment.channels.map((_, index) => ({ id: `way-${index + 1}`, label: `Way ${index + 1}`, role: "custom" }))
          : [{ id: "way-1", label: "Way 1", role: "custom" }];

      return {
        brand: "",
        family: "",
        model: "",
        application: "",
        notes: "",
        ways: defaultWays
      };
    }

    const fromLibrary = libraryFiles.find((file) => file.id === firstAssignment.itemId);
    if (fromLibrary) {
      return deriveDraftFromProfile(fromLibrary);
    }

    const groupAssignments = segment.channels
      .map((ch) => outputAssignments[ch] as SpeakerOutputAssignment | undefined)
      .filter((entry): entry is SpeakerOutputAssignment => Boolean(entry))
      .sort((left, right) => left.wayIndex - right.wayIndex);

    const derivedWays =
      groupAssignments.length > 0
        ? groupAssignments.map((entry, index) => ({
            id: `way-${entry.wayIndex + 1}`,
            label: entry.wayLabel || `Way ${index + 1}`,
            role: "custom"
          }))
        : [{ id: "way-1", label: "Way 1", role: "custom" }];

    return {
      id: firstAssignment.itemId,
      brand: "",
      family: "",
      model: firstAssignment.model,
      application: "",
      notes: "",
      ways: derivedWays
    };
  };

  const getSegmentKey = (segment: RowSegment): string => `${scopeKey}:${segment.channels.join("-")}`;

  const openEditorForSegment = (segment: RowSegment) => {
    const segmentKey = getSegmentKey(segment);
    const cachedDraft = editorDraftBySegment[segmentKey];
    setEditorTargetChannel(segment.channels[0]);
    setEditorSegmentKey(segmentKey);
    setEditorDraft(cachedDraft ?? deriveDraftForSegment(segment));
    setEditorOpen(true);
  };

  const parseDragItem = (event: DragEvent<HTMLElement>): SpeakerDragItem | null => {
    const payload = event.dataTransfer.getData(SPEAKER_DRAG_MIME);
    if (!payload) return null;

    try {
      const parsed = JSON.parse(payload) as SpeakerDragItem;
      if (!parsed || typeof parsed !== "object") return null;
      if (typeof parsed.id !== "string" || typeof parsed.model !== "string" || typeof parsed.ways !== "string") {
        return null;
      }
      if (typeof parsed.wayCount !== "number" || parsed.wayCount <= 0) return null;
      return parsed;
    } catch {
      return null;
    }
  };

  const resolveDraggedItem = (event: DragEvent<HTMLElement>): SpeakerDragItem | null => {
    return activeDraggedItem ?? parseDragItem(event);
  };

  const buildDropSpan = (startChannel: number, wayCount: number) => {
    const count = Math.max(1, Math.round(wayCount));
    // Bridge-aware: if dropping a 1-way config on a bridged channel, expand to the full bridge pair
    if (count === 1) {
      const bridge = channelGroups.find((g) => g.type === "bridge" && g.channels.includes(startChannel));
      if (bridge) {
        return { channels: [...bridge.channels].sort((a, b) => a - b), valid: true };
      }
    }
    const end = startChannel + count - 1;
    const channels = Array.from({ length: count }, (_, index) => startChannel + index);
    return { channels, valid: end <= rowCount };
  };

  useEffect(() => {
    if (!activeDraggedItem || dragHoverChannel === null) {
      setPreviewChannels([]);
      setPreviewValid(true);
      return;
    }

    const span = buildDropSpan(dragHoverChannel, activeDraggedItem.wayCount);
    setPreviewChannels(span.channels);
    setPreviewValid(span.valid);
  }, [activeDraggedItem, dragHoverChannel, channelGroups, rowCount]);

  // Set of channels that are valid starting positions for the current drag item.
  // Used to highlight/dim channels before the user hovers a specific target.
  const possibleStartChannels = useMemo<Set<number>>(() => {
    if (!activeDraggedItem) return new Set();
    const wayCount = Math.max(1, Math.round(activeDraggedItem.wayCount));
    const result = new Set<number>();
    for (let ch = 1; ch <= rowCount; ch++) {
      // 1-way configs fit anywhere; multi-way need enough consecutive channels
      if (wayCount === 1 || ch + wayCount - 1 <= rowCount) {
        result.add(ch);
      }
    }
    return result;
  }, [activeDraggedItem, rowCount]);

  /** Expand a channel click to include all linked (joined/bridged) group members. */
  const expandToGroup = (channel: number): number[] => {
    const group = findGroupForChannel(channelGroups, channel);
    return group ? group.channels : [channel];
  };

  const handleChannelClick = (row: number, event: React.MouseEvent) => {
    const ctrlOrMeta = event.ctrlKey || event.metaKey;
    const grouped = expandToGroup(row);

    if (event.shiftKey) {
      const anchor = lastClickedChannelRef.current ?? selectedOutputChannels[selectedOutputChannels.length - 1] ?? row;
      setOutputChannels(buildRangeSelection(anchor, row), scope);
      lastClickedChannelRef.current = row;
      return;
    }

    if (ctrlOrMeta) {
      const alreadySelected = grouped.every((ch) => selectedOutputChannels.includes(ch));
      const next = alreadySelected
        ? selectedOutputChannels.filter((ch) => !grouped.includes(ch))
        : [...new Set([...selectedOutputChannels, ...grouped])].sort((a, b) => a - b);
      setOutputChannels(next, scope);
      lastClickedChannelRef.current = row;
      return;
    }

    setOutputChannels(grouped, scope);
    lastClickedChannelRef.current = row;
  };

  /** Render a single physical output button */
  const renderOutputButton = (row: number) => {
    const selected = selectedOutputChannels.includes(row);
    const inPreview = previewChannels.includes(row);
    const isDragging = activeDraggedItem !== null;
    const isPossibleTarget = isDragging && possibleStartChannels.has(row);

    return (
      <button
        key={`out-${row}`}
        data-output-selector="true"
        data-output-drop-target="true"
        data-output-channel={row}
        data-output-max={rowCount}
        data-output-scope={scope ?? ""}
        type="button"
        onClick={(e) => handleChannelClick(row, e)}
        className={cn(
          "flex h-10 w-full items-center justify-center rounded-md border border-dashed px-2 transition-colors duration-200",
          inPreview && previewValid
            ? "border-amber-400/80 bg-amber-500/20 text-amber-200"
            : inPreview && !previewValid
              ? "border-destructive/80 bg-destructive/10 text-destructive"
              : isDragging && isPossibleTarget
                ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-400"
                : isDragging && !isPossibleTarget
                  ? "border-border/25 bg-background/10 text-muted-foreground/30"
                  : selected
                    ? "border-primary/70 bg-primary/15 text-primary"
                    : "border-border/50 bg-background/30 text-muted-foreground hover:border-primary/50 hover:text-foreground"
        )}
        aria-pressed={selected}
        title={
          selected
            ? `CH ${row} selected (Ctrl+Click add, Shift+Click range, Click single)`
            : `Select CH ${row} (Ctrl+Click add, Shift+Click range)`
        }
      >
        <span
          className={cn(
            "relative grid size-6 place-items-center rounded-full border transition-colors duration-200",
            inPreview && !previewValid
              ? "border-destructive/80 bg-destructive/15 text-destructive"
              : isDragging && isPossibleTarget
                ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-400"
                : isDragging && !isPossibleTarget
                  ? "border-border/20 text-muted-foreground/30"
                  : selected
                    ? "border-primary/70 bg-primary/20 text-primary"
                    : "border-border/60 text-muted-foreground"
          )}
        >
          <span className="pointer-events-none absolute inset-0 grid place-items-center translate-y-[0.5px] text-[11px] font-semibold leading-none tabular-nums">
            {row}
          </span>
        </span>
      </button>
    );
  };

  return (
    <section
      className="flex h-full min-h-0 flex-col rounded-md border border-border/50 bg-background/30 p-4"
      onMouseDownCapture={(event) => {
        const target = event.target as HTMLElement;
        if (target.closest('[data-output-selector="true"]') || target.closest('[data-speaker-editor-trigger="true"]')) {
          return;
        }

        if (selectedOutputChannels.length > 0) {
          clearOutputChannels(scope);
          lastClickedChannelRef.current = null;
        }
      }}
    >
      <div className="mb-3 flex items-center">
        <h3 className="text-sm font-semibold">Speaker Model</h3>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="rounded-md border border-border/50 bg-muted/10 p-3">
          <div className="grid grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)_minmax(0,0.9fr)] gap-0">
            {/* Column headers */}
            <div className="pr-3">
              <p className="mb-2 text-xs font-semibold tracking-[0.14em] text-muted-foreground">Speaker Model</p>
            </div>
            <div className="border-l border-border/35 px-3">
              <p className="mb-2 text-xs font-semibold tracking-[0.14em] text-muted-foreground">Ways Description</p>
            </div>
            <div className="border-l border-border/35 pl-3">
              <p className="mb-2 text-xs font-semibold tracking-[0.14em] text-muted-foreground">Physical Outputs</p>
            </div>

            {/* Rows rendered per segment */}
            {segments.map((segment) => {
              const firstCh = segment.channels[0];
              const channelCount = segment.channels.length;
              const assignment = outputAssignments[firstCh];
              const wayCount = segment.type === "join" ? channelCount : segment.type === "bridge" ? 1 : 1;
              const linkIcon =
                segment.type === "join" ? (
                  <Link2 className="h-3 w-3 text-primary/60" />
                ) : segment.type === "bridge" ? (
                  <SplitSquareVertical className="h-3 w-3 text-primary/60" />
                ) : null;

              // Resolve the library profile to check for injectable deviceData
              const firstAssignment = assignment as SpeakerOutputAssignment | undefined;
              const linkedProfile = firstAssignment
                ? libraryFiles.find((f) => f.id === firstAssignment.itemId)
                : undefined;
              const hasDeviceData = linkedProfile?.deviceData?.some((d) => d?.hex) ?? false;

              const handleApply = () => {
                if (!scope || !linkedProfile || applying) return;

                // Build per-way apply mappings from the library profile.
                // For bridges: all bridge channels receive the single way's data.
                // For joins: each way maps to its corresponding channel.
                // For singles: way 0 → the single channel.
                const wayMappings: ApplyWayMapping[] = [];

                if (segment.type === "bridge") {
                  // 1-way config applied to the full bridge pair
                  const wayData = linkedProfile.deviceData?.[0];
                  if (wayData?.hex) {
                    wayMappings.push({
                      hex: wayData.hex,
                      channels: segment.channels.map((ch) => ch - 1) // 1-based → 0-based
                    });
                  }
                } else {
                  // Join or single: one way per channel
                  for (let idx = 0; idx < wayCount; idx++) {
                    const wayData = linkedProfile.deviceData?.[idx];
                    const ch = segment.channels[idx];
                    if (wayData?.hex && ch !== undefined) {
                      wayMappings.push({
                        hex: wayData.hex,
                        channels: [ch - 1] // 1-based → 0-based
                      });
                    }
                  }
                }

                if (wayMappings.length === 0) {
                  toast.error("No speaker payload found for this profile");
                  return;
                }

                void (async () => {
                  const toastId = `speaker-apply-${scope}-${segment.channels.join("-")}`;
                  toast.loading("Applying speaker config", {
                    id: toastId,
                    description: `Preparing ${wayMappings.length} way${wayMappings.length === 1 ? "" : "s"}`
                  });

                  const outcome = await applyToDevice({
                    mac: scope,
                    wayMappings,
                    onProgress: (progress) => {
                      const next = buildApplyProgressMessage(progress);
                      toast.loading(next.title, { id: toastId, description: next.description });
                    }
                  });

                  if (!outcome.ok) {
                    const firstError = outcome.results.find((r) => !r.sent)?.error;
                    toast.error("Speaker config apply failed", {
                      id: toastId,
                      description: firstError ?? outcome.error ?? "The amp did not accept the speaker payload"
                    });
                    return;
                  }

                  const totalFragmentRetries = outcome.results.reduce((sum, r) => sum + r.fragmentRetries, 0);
                  const retriedWays = outcome.results.filter((r) => r.retriedChannels > 0).length;
                  const maxFrameAttempts = outcome.results.reduce((max, r) => Math.max(max, r.frameAttemptsMax), 1);
                  const totalTargets = outcome.results.reduce((sum, r) => sum + r.channels.length, 0);
                  const recovered = retriedWays > 0 || totalFragmentRetries > 0 || maxFrameAttempts > 1;

                  toast.success(
                    recovered
                      ? "Speaker config applied after automatic transport recovery"
                      : "Speaker config applied cleanly",
                    {
                      id: toastId,
                      description: recovered
                        ? `Targets=${totalTargets}, retried ways=${retriedWays}, fragment retries=${totalFragmentRetries}, max frame attempts=${maxFrameAttempts}`
                        : `Applied to ${totalTargets} output${totalTargets === 1 ? "" : "s"} with no transport retries`
                    }
                  );
                })();
              };

              return (
                <div key={`seg-${firstCh}`} className="col-span-3 grid grid-cols-subgrid">
                  {/* Speaker Model column — 1 row spanning the whole group */}
                  <div className="pr-3">
                    <div
                      className="flex w-full items-center gap-1"
                      style={{ height: `${channelCount * 2.5 + (channelCount - 1) * 0.5}rem` }}
                    >
                      <button
                        type="button"
                        data-speaker-editor-trigger="true"
                        onClick={() => openEditorForSegment(segment)}
                        className="flex h-full min-w-0 flex-1 items-center rounded-md border border-border/40 bg-muted/10 px-3 text-left transition-colors hover:border-primary/40 hover:bg-muted/20"
                      >
                        <span className="truncate text-sm text-foreground/90">{assignment?.model || "-"}</span>
                      </button>
                      {hasDeviceData && (
                        <button
                          type="button"
                          onClick={handleApply}
                          disabled={applying}
                          className={cn(
                            "flex h-full w-8 shrink-0 items-center justify-center rounded-md border transition-colors",
                            applying
                              ? "cursor-wait border-border/30 bg-muted/5 text-muted-foreground/40"
                              : "border-primary/30 bg-primary/5 text-primary hover:border-primary/60 hover:bg-primary/15"
                          )}
                          title="Apply speaker config to device"
                        >
                          <Upload className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                    {/* spacer matching the gap between segments */}
                    <div className="h-2" />
                  </div>

                  {/* Ways Description column */}
                  <div className="border-l border-border/35 px-3">
                    {segment.type === "bridge" ? (
                      <>
                        {/* Bridge: 1 way row spanning entire height */}
                        <button
                          type="button"
                          data-speaker-editor-trigger="true"
                          onClick={() => openEditorForSegment(segment)}
                          className="flex w-full items-center rounded-md border border-border/40 bg-muted/10 px-3 text-left transition-colors hover:border-primary/40 hover:bg-muted/20"
                          style={{ height: `${channelCount * 2.5 + (channelCount - 1) * 0.5}rem` }}
                        >
                          <span className="text-sm text-muted-foreground">
                            {assignment?.wayLabel || `${wayCount}-way`}
                          </span>
                        </button>
                        <div className="h-2" />
                      </>
                    ) : segment.type === "join" ? (
                      <>
                        {/* Join: one row per way */}
                        <div className="space-y-2">
                          {segment.channels.map((ch, idx) => {
                            const chAssignment = outputAssignments[ch];
                            return (
                              <button
                                key={`ways-${ch}`}
                                type="button"
                                data-speaker-editor-trigger="true"
                                onClick={() => openEditorForSegment(segment)}
                                className="flex h-10 w-full items-center rounded-md border border-border/40 bg-muted/10 px-3 text-left transition-colors hover:border-primary/40 hover:bg-muted/20"
                              >
                                <span className="text-sm text-muted-foreground">
                                  {chAssignment?.wayLabel || `Way ${idx + 1}`}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                        <div className="h-2" />
                      </>
                    ) : (
                      <>
                        {/* Single channel: 1 way row */}
                        <button
                          type="button"
                          data-speaker-editor-trigger="true"
                          onClick={() => openEditorForSegment(segment)}
                          className="flex h-10 w-full items-center rounded-md border border-border/40 bg-muted/10 px-3 text-left transition-colors hover:border-primary/40 hover:bg-muted/20"
                        >
                          <span className="text-sm text-muted-foreground">{assignment?.wayLabel || "-"}</span>
                        </button>
                        <div className="h-2" />
                      </>
                    )}
                  </div>

                  {/* Physical Outputs column */}
                  <div className="border-l border-border/35 pl-3">
                    <div className="space-y-0">
                      {segment.channels.map((ch, idx) => (
                        <div key={`outgrp-${ch}`}>
                          {renderOutputButton(ch)}
                          {/* Link indicator between grouped channels */}
                          {idx < segment.channels.length - 1 && linkIcon && (
                            <div className="flex justify-center py-0.5">{linkIcon}</div>
                          )}
                          {/* Spacer after last channel in group */}
                          {idx === segment.channels.length - 1 && <div className="h-2" />}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <SpeakerConfigEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        initialDraft={editorDraft}
        saving={saving}
        onChange={(draft) => {
          setEditorDraft(draft);
          if (editorSegmentKey) {
            setEditorDraftBySegment((prev) => ({ ...prev, [editorSegmentKey]: draft }));
          }
          const displayModel = [draft.brand, draft.model].filter(Boolean).join(" ").trim() || draft.id || "Speaker";
          assignItemToOutputs({
            startChannel: editorTargetChannel,
            maxChannels: rowCount,
            item: {
              id: draft.id || displayModel,
              model: displayModel,
              ways: draft.ways.map((w) => w.label).join(" & "),
              wayCount: Math.max(1, draft.ways.length)
            },
            scope
          });
        }}
        onSave={(draft) => {
          if (!scope) return;

          // Map each way to its physical output channel (0-based for the API)
          const wayMappings: SaveWayMapping[] = draft.ways.map((way, idx) => ({
            label: way.label || `Way ${idx + 1}`,
            role: way.role || "custom",
            physicalChannel: editorTargetChannel - 1 + idx // 1-based → 0-based
          }));

          void (async () => {
            const toastId = `speaker-save-${scope}-${editorTargetChannel}`;
            toast.loading("Saving speaker profile", {
              id: toastId,
              description: `Preparing ${wayMappings.length} way${wayMappings.length === 1 ? "" : "s"} for capture`
            });

            const outcome = await saveToLibrary({
              mac: scope,
              id: draft.id,
              brand: draft.brand,
              family: draft.family,
              model: draft.model,
              application: draft.application,
              notes: draft.notes,
              wayMappings,
              onProgress: (progress) => {
                const next = buildSaveProgressMessage(progress);
                toast.loading(next.title, { id: toastId, description: next.description });
              }
            });

            if (!outcome.ok) {
              toast.error("Speaker profile save failed", {
                id: toastId,
                description: outcome.error ?? "Failed to save speaker profile to library"
              });
              return;
            }

            toast.success("Speaker profile saved to library", {
              id: toastId,
              description: `Captured ${wayMappings.length} way${wayMappings.length === 1 ? "" : "s"} and refreshed the library`
            });
          })();
        }}
      />
    </section>
  );
}
