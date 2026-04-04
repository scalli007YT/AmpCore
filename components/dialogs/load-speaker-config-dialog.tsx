"use client";

import { useEffect, useMemo, useState } from "react";
import { Link2, SplitSquareVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { type ChannelGroup, type SpeakerOutputAssignment, useSpeakerConfigStore } from "@/stores/SpeakerConfigStore";
import { buildRowSegments, toScopeKey, type RowSegment } from "@/lib/speaker-config";
import { type LibraryFileEntry } from "@/stores/LibraryStore";
import { useI18n } from "@/components/layout/i18n-provider";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LoadWaySelection {
  channel: number;
  wayId: string;
  wayIndex: number;
  wayLabel: string;
}

interface LoadSpeakerConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scope: string | null;
  channelCount: number;
  /** The pre-selected library profile to load ways from. */
  profile: LibraryFileEntry;
  onLoad: (selections: LoadWaySelection[]) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const NO_CHANGES = "__no_changes__";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function LoadSpeakerConfigDialog({
  open,
  onOpenChange,
  scope,
  channelCount,
  profile,
  onLoad
}: LoadSpeakerConfigDialogProps) {
  const i18n = useI18n();
  const dict = i18n.dialogs.speakerConfig.loadDialog;
  const scopeKey = toScopeKey(scope);
  const channelGroupsByScope = useSpeakerConfigStore((s) => s.channelGroupsByScope);
  const outputAssignmentsByScope = useSpeakerConfigStore((s) => s.outputAssignmentsByScope);

  const rowCount = Math.max(1, Math.min(channelCount, 8));
  const groups = channelGroupsByScope[scopeKey] ?? [];
  const assignments = outputAssignmentsByScope[scopeKey] ?? {};
  const segments = useMemo(() => buildRowSegments(rowCount, groups), [rowCount, groups]);

  // Available ways from the selected library profile (only those with actual device data)
  const wayOptions = useMemo(
    () =>
      (profile.ways ?? [])
        .map((way, idx) => ({
          id: way.id,
          label: way.label || `Way ${idx + 1}`,
          hasData: Boolean(profile.deviceData?.[idx]?.hex)
        }))
        .filter((w) => w.hasData),
    [profile]
  );

  // Per-channel selection: which way id from the profile to apply (null = no changes)
  const [selections, setSelections] = useState<Record<number, string | null>>({});

  // Reset when dialog opens or profile changes
  useEffect(() => {
    if (open) {
      setSelections({});
    }
  }, [open, profile.id]);

  const setChannelWay = (channel: number, wayId: string | null) => {
    setSelections((prev) => ({ ...prev, [channel]: wayId }));
  };

  const setSegmentWay = (segment: RowSegment, wayId: string | null) => {
    setSelections((prev) => {
      const next = { ...prev };
      for (const ch of segment.channels) {
        next[ch] = wayId;
      }
      return next;
    });
  };

  // Build way mappings from selections
  const hasAnySelection = Object.values(selections).some((v) => v !== null && v !== undefined);

  const handleLoad = () => {
    const result: LoadWaySelection[] = [];
    const profileWays = profile.ways ?? [];

    for (const segment of segments) {
      // For bridge segments emit only the first channel — assignItemToOutputs
      // is bridge-aware and will expand the single assignment to both channels.
      const channelsToEmit = segment.type === "bridge" ? [segment.channels[0]] : segment.channels;

      for (const ch of channelsToEmit) {
        const selectedWayId = selections[ch];
        if (!selectedWayId) continue;

        const wayIdx = profileWays.findIndex((w) => w.id === selectedWayId);
        if (wayIdx < 0) continue;

        const way = profileWays[wayIdx];
        result.push({
          channel: ch,
          wayId: way.id,
          wayIndex: wayIdx,
          wayLabel: way.label || `Way ${wayIdx + 1}`
        });
      }
    }

    if (result.length > 0) {
      onLoad(result);
    }
  };

  // Render helpers
  const renderWaySelect = (channel: number) => {
    const selectedValue = selections[channel] ?? NO_CHANGES;
    return (
      <Select value={selectedValue} onValueChange={(v) => setChannelWay(channel, v === NO_CHANGES ? null : v)}>
        <SelectTrigger className="h-8 w-full text-xs" size="sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NO_CHANGES}>{dict.noChanges}</SelectItem>
          {wayOptions.map((way) => (
            <SelectItem key={way.id} value={way.id}>
              {way.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  };

  const renderSegmentWaySelect = (segment: RowSegment) => {
    const selectedValue = selections[segment.channels[0]] ?? NO_CHANGES;
    return (
      <Select value={selectedValue} onValueChange={(v) => setSegmentWay(segment, v === NO_CHANGES ? null : v)}>
        <SelectTrigger className="h-8 w-full text-xs" size="sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NO_CHANGES}>{dict.noChanges}</SelectItem>
          {wayOptions.map((way) => (
            <SelectItem key={way.id} value={way.id}>
              {way.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  };

  // Track segment index for speaker labels
  let segmentIdx = 0;

  const profileDisplayName = [profile.brand, profile.model].filter(Boolean).join(" ") || profile.name;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{dict.title}</DialogTitle>
          <DialogDescription>
            {dict.description.split("{profileName}")[0]}
            <span className="font-medium text-foreground">{profileDisplayName}</span>
            {dict.description.split("{profileName}")[1]}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-[minmax(0,1fr)_260px] gap-6">
          {/* Left side: speaker/way table */}
          <div className="min-w-0">
            {/* Column headers */}
            <div className="mb-2 grid grid-cols-[56px_48px_minmax(0,1fr)_minmax(0,1.2fr)] gap-2 border-b border-border/50 pb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              <span>{dict.colSpeaker}</span>
              <span>{dict.colWay}</span>
              <span>{dict.colCurrent}</span>
              <span>{dict.colPresetToLoad}</span>
            </div>

            {/* Rows */}
            <div className="space-y-1">
              {segments.map((segment) => {
                const speakerLabel = String.fromCharCode(65 + segmentIdx);
                segmentIdx++;

                const linkIcon =
                  segment.type === "join" ? (
                    <Link2 className="h-3 w-3 text-primary/60" />
                  ) : segment.type === "bridge" ? (
                    <SplitSquareVertical className="h-3 w-3 text-primary/60" />
                  ) : null;

                if (segment.type === "bridge") {
                  const firstAssignment = assignments[segment.channels[0]] as SpeakerOutputAssignment | undefined;
                  const currentModel = firstAssignment?.model || "-";

                  return (
                    <div
                      key={`seg-${segment.channels[0]}`}
                      className="rounded-md border border-border/30 bg-muted/5 p-2"
                    >
                      <div className="grid grid-cols-[56px_48px_minmax(0,1fr)_minmax(0,1.2fr)] items-center gap-2">
                        <div className="flex items-center gap-1">
                          <div className="flex h-8 w-8 items-center justify-center rounded-md border border-primary/30 text-xs font-bold text-primary">
                            {speakerLabel}
                          </div>
                          {linkIcon && <span>{linkIcon}</span>}
                        </div>
                        <div className="text-center">
                          {segment.channels.map((ch) => (
                            <div key={ch} className="text-xs text-muted-foreground">
                              {ch}
                            </div>
                          ))}
                        </div>
                        <div className="truncate text-xs text-muted-foreground">{currentModel}</div>
                        {renderSegmentWaySelect(segment)}
                      </div>
                    </div>
                  );
                }

                if (segment.type === "join") {
                  return (
                    <div
                      key={`seg-${segment.channels[0]}`}
                      className="rounded-md border border-border/30 bg-muted/5 p-2"
                    >
                      {segment.channels.map((ch, wayIdx) => {
                        const chAssignment = assignments[ch] as SpeakerOutputAssignment | undefined;
                        const currentLabel = chAssignment?.model || "-";

                        return (
                          <div
                            key={ch}
                            className={`grid grid-cols-[56px_48px_minmax(0,1fr)_minmax(0,1.2fr)] items-center gap-2 ${wayIdx > 0 ? "mt-1.5" : ""}`}
                          >
                            {wayIdx === 0 ? (
                              <div className="flex items-center gap-1">
                                <div className="flex h-8 w-8 items-center justify-center rounded-md border border-primary/30 text-xs font-bold text-primary">
                                  {speakerLabel}
                                </div>
                                {linkIcon && <span>{linkIcon}</span>}
                              </div>
                            ) : (
                              <div className="flex items-center justify-center">
                                {linkIcon && <span className="opacity-40">{linkIcon}</span>}
                              </div>
                            )}
                            <div className="text-center text-xs text-muted-foreground">{ch}</div>
                            <div className="truncate text-xs text-muted-foreground">{currentLabel}</div>
                            {renderWaySelect(ch)}
                          </div>
                        );
                      })}
                    </div>
                  );
                }

                // Single channel
                const firstAssignment = assignments[segment.channels[0]] as SpeakerOutputAssignment | undefined;
                const currentModel = firstAssignment?.model || "-";

                return (
                  <div
                    key={`seg-${segment.channels[0]}`}
                    className="grid grid-cols-[56px_48px_minmax(0,1fr)_minmax(0,1.2fr)] items-center gap-2 rounded-md border border-border/30 bg-muted/5 p-2"
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-md border border-primary/30 text-xs font-bold text-primary">
                      {speakerLabel}
                    </div>
                    <div className="text-center text-xs text-muted-foreground">{segment.channels[0]}</div>
                    <div className="truncate text-xs text-muted-foreground">{currentModel}</div>
                    {renderWaySelect(segment.channels[0])}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right side: Selected preset details (always visible, static) */}
          <div className="min-w-0 rounded-md border border-border/30 bg-muted/5 p-3">
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {dict.presetDetails}
            </p>

            <div className="space-y-1.5">
              {profile.brand && (
                <div className="rounded-md bg-muted/30 px-3 py-1.5 text-center text-xs text-foreground/80">
                  {profile.brand}
                </div>
              )}
              {profile.application && (
                <div className="rounded-md bg-muted/30 px-3 py-1.5 text-center text-xs text-foreground/80">
                  {profile.application}
                </div>
              )}
              {profile.family && (
                <div className="rounded-md bg-muted/30 px-3 py-1.5 text-center text-xs text-foreground/80">
                  {profile.family}
                </div>
              )}
              {profile.model && (
                <div className="rounded-md bg-muted/30 px-3 py-1.5 text-center text-xs text-foreground/80">
                  {profile.model}
                </div>
              )}
              {profile.wayLabelsText && (
                <div className="rounded-md bg-muted/30 px-3 py-1.5 text-center text-xs text-foreground/80">
                  {profile.wayLabelsText}
                </div>
              )}
              {profile.notes && (
                <div className="mt-2 rounded-md bg-muted/20 px-3 py-1.5 text-xs italic text-muted-foreground">
                  {profile.notes}
                </div>
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {i18n.dialogs.common.cancel}
          </Button>
          <Button disabled={!hasAnySelection} onClick={handleLoad}>
            {dict.load}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
