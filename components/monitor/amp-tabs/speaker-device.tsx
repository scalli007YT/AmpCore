"use client";

import { type DragEvent, useMemo, useRef, useState } from "react";
import { Link2, SplitSquareVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  type ChannelGroup,
  type SpeakerDragItem,
  findGroupForChannel,
  useSpeakerConfigStore
} from "@/stores/SpeakerConfigStore";

const EMPTY_SELECTION: number[] = [];
const EMPTY_ASSIGNMENTS: Record<number, { model: string; wayLabel: string }> = {};
const EMPTY_GROUPS: ChannelGroup[] = [];
const SPEAKER_DRAG_MIME = "application/x-ampcore-speaker-item";

interface SpeakerDeviceDraftProps {
  channelCount?: number;
  scope?: string | null;
}

/** Build a list of visual row segments from channel groups. */
function buildRowSegments(rowCount: number, groups: ChannelGroup[]) {
  const segments: Array<{
    channels: number[];
    group: ChannelGroup | null;
    type: "single" | "join" | "bridge";
  }> = [];

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

  const selectedOutputChannelsByScope = useSpeakerConfigStore((state) => state.selectedOutputChannelsByScope);
  const outputAssignmentsByScope = useSpeakerConfigStore((state) => state.outputAssignmentsByScope);
  const channelGroupsByScope = useSpeakerConfigStore((state) => state.channelGroupsByScope);
  const activeDraggedItem = useSpeakerConfigStore((state) => state.activeDraggedItem);
  const setActiveDraggedItem = useSpeakerConfigStore((state) => state.setActiveDraggedItem);
  const setOutputChannels = useSpeakerConfigStore((state) => state.setOutputChannels);
  const clearOutputChannels = useSpeakerConfigStore((state) => state.clearOutputChannels);
  const assignItemToOutputs = useSpeakerConfigStore((state) => state.assignItemToOutputs);
  const selectedOutputChannels = selectedOutputChannelsByScope[scopeKey] ?? EMPTY_SELECTION;
  const outputAssignments = outputAssignmentsByScope[scopeKey] ?? EMPTY_ASSIGNMENTS;
  const channelGroups = channelGroupsByScope[scopeKey] ?? EMPTY_GROUPS;

  const segments = useMemo(() => buildRowSegments(rowCount, channelGroups), [rowCount, channelGroups]);

  const buildRangeSelection = (from: number, to: number): number[] => {
    const min = Math.min(from, to);
    const max = Math.max(from, to);
    return Array.from({ length: max - min + 1 }, (_, index) => min + index);
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
    const end = startChannel + count - 1;
    const channels = Array.from({ length: count }, (_, index) => startChannel + index);
    return { channels, valid: end <= rowCount };
  };

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

    return (
      <button
        key={`out-${row}`}
        data-output-selector="true"
        type="button"
        onDragOver={(event) => {
          const item = resolveDraggedItem(event);
          if (!item) return;
          event.preventDefault();
          const span = buildDropSpan(row, item.wayCount);
          setPreviewChannels(span.channels);
          setPreviewValid(span.valid);
          event.dataTransfer.dropEffect = span.valid ? "copy" : "none";
        }}
        onDrop={(event) => {
          const item = resolveDraggedItem(event);
          if (!item) return;
          event.preventDefault();
          const result = assignItemToOutputs({
            startChannel: row,
            maxChannels: rowCount,
            item,
            scope
          });
          if (result.ok) {
            setPreviewChannels([]);
            setPreviewValid(true);
          }
          setActiveDraggedItem(null);
        }}
        onClick={(e) => handleChannelClick(row, e)}
        className={cn(
          "flex h-10 w-full items-center justify-center rounded-md border border-dashed px-2 transition-colors duration-200",
          inPreview && previewValid
            ? "border-amber-400/80 bg-amber-500/20 text-amber-200"
            : inPreview && !previewValid
              ? "border-destructive/80 bg-destructive/10 text-destructive"
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
      className="h-full rounded-md border border-border/50 bg-background/30 p-4"
      onMouseDownCapture={(event) => {
        const target = event.target as HTMLElement;
        if (target.closest('[data-output-selector="true"]')) {
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

            return (
              <div key={`seg-${firstCh}`} className="col-span-3 grid grid-cols-subgrid">
                {/* Speaker Model column — 1 row spanning the whole group */}
                <div className="pr-3">
                  <div
                    className="flex items-center rounded-md border border-border/40 bg-muted/10 px-3"
                    style={{ height: `${channelCount * 2.5 + (channelCount - 1) * 0.5}rem` }}
                  >
                    <span className="truncate text-sm text-foreground/90">{assignment?.model || "-"}</span>
                  </div>
                  {/* spacer matching the gap between segments */}
                  <div className="h-2" />
                </div>

                {/* Ways Description column */}
                <div className="border-l border-border/35 px-3">
                  {segment.type === "bridge" ? (
                    <>
                      {/* Bridge: 1 way row spanning entire height */}
                      <div
                        className="flex items-center rounded-md border border-border/40 bg-muted/10 px-3"
                        style={{ height: `${channelCount * 2.5 + (channelCount - 1) * 0.5}rem` }}
                      >
                        <span className="text-sm text-muted-foreground">
                          {assignment?.wayLabel || `${wayCount}-way`}
                        </span>
                      </div>
                      <div className="h-2" />
                    </>
                  ) : segment.type === "join" ? (
                    <>
                      {/* Join: one row per way */}
                      <div className="space-y-2">
                        {segment.channels.map((ch, idx) => {
                          const chAssignment = outputAssignments[ch];
                          return (
                            <div
                              key={`ways-${ch}`}
                              className="flex h-10 items-center rounded-md border border-border/40 bg-muted/10 px-3"
                            >
                              <span className="text-sm text-muted-foreground">
                                {chAssignment?.wayLabel || `Way ${idx + 1}`}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                      <div className="h-2" />
                    </>
                  ) : (
                    <>
                      {/* Single channel: 1 way row */}
                      <div className="flex h-10 items-center rounded-md border border-border/40 bg-muted/10 px-3">
                        <span className="text-sm text-muted-foreground">{assignment?.wayLabel || "-"}</span>
                      </div>
                      <div className="h-2" />
                    </>
                  )}
                </div>

                {/* Physical Outputs column */}
                <div
                  className="border-l border-border/35 pl-3"
                  onDragLeave={(event) => {
                    const related = event.relatedTarget as Node | null;
                    if (!related || !event.currentTarget.contains(related)) {
                      setPreviewChannels([]);
                      setPreviewValid(true);
                    }
                  }}
                >
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
    </section>
  );
}
