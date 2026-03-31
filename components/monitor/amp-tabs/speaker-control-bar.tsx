"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, FolderOpen, Link2, RotateCcw, SplitSquareVertical, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { ConfirmActionDialog } from "@/components/dialogs/confirm-action-dialog";
import { LoadSpeakerConfigDialog, type LoadWaySelection } from "@/components/dialogs/load-speaker-config-dialog";
import { Button } from "@/components/ui/button";
import { type ApplyWayMapping, type LibraryFileEntry, useLibraryStore } from "@/stores/LibraryStore";
import { type SpeakerOutputAssignment, useSpeakerConfigStore } from "@/stores/SpeakerConfigStore";

type QueuedApplyItem = {
  model: string;
  channels: number[];
  wayMappings: ApplyWayMapping[];
  missingReason?: string;
};

interface SpeakerControlBarProps {
  scope?: string | null;
  channelCount?: number;
}

function formatChannelList(channels: number[]): string {
  return channels.map((channel) => `CH ${channel}`).join(", ");
}

function buildQueuedApplyItems(
  assignments: Record<number, SpeakerOutputAssignment>,
  files: LibraryFileEntry[]
): QueuedApplyItem[] {
  const groupedAssignments = new Map<string, SpeakerOutputAssignment[]>();

  for (const assignment of Object.values(assignments)) {
    const key = assignment.groupId || `channel:${assignment.channel}`;
    const bucket = groupedAssignments.get(key);

    if (bucket) {
      bucket.push(assignment);
    } else {
      groupedAssignments.set(key, [assignment]);
    }
  }

  return [...groupedAssignments.entries()]
    .map(([groupId, grouped]) => {
      const orderedAssignments = [...grouped].sort((left, right) => {
        if (left.channel !== right.channel) return left.channel - right.channel;
        return left.wayIndex - right.wayIndex;
      });
      const firstAssignment = orderedAssignments[0];
      const profile = files.find((file) => file.id === firstAssignment.itemId);
      const channels = orderedAssignments.map((assignment) => assignment.channel);

      if (!profile) {
        return {
          model: firstAssignment.model,
          channels,
          wayMappings: [],
          missingReason: "Missing linked library profile"
        };
      }

      if (firstAssignment.wayCount === 1) {
        const wayData = profile.deviceData?.[0];
        if (!wayData?.hex) {
          return {
            model: firstAssignment.model,
            channels,
            wayMappings: [],
            missingReason: "Missing stored speaker payload"
          };
        }

        return {
          model: firstAssignment.model,
          channels,
          wayMappings: [{ hex: wayData.hex, channels: channels.map((channel) => channel - 1) }]
        };
      }

      const wayMappings: ApplyWayMapping[] = [];

      for (const assignment of [...orderedAssignments].sort((left, right) => left.wayIndex - right.wayIndex)) {
        const wayData = profile.deviceData?.[assignment.wayIndex];
        if (!wayData?.hex) {
          return {
            model: firstAssignment.model,
            channels,
            wayMappings: [],
            missingReason: `Missing stored payload for ${assignment.wayLabel}`
          };
        }

        wayMappings.push({
          hex: wayData.hex,
          channels: [assignment.channel - 1]
        });
      }

      return {
        model: firstAssignment.model,
        channels,
        wayMappings
      };
    })
    .sort((left, right) => left.channels[0] - right.channels[0]);
}

export function SpeakerControlBar({ scope, channelCount = 4 }: SpeakerControlBarProps) {
  const scopeKey = scope?.trim().toUpperCase() || "__global__";
  const selectedOutputChannelsByScope = useSpeakerConfigStore((state) => state.selectedOutputChannelsByScope);
  const outputAssignmentsByScope = useSpeakerConfigStore((state) => state.outputAssignmentsByScope);
  const joinSelected = useSpeakerConfigStore((state) => state.joinSelected);
  const bridgeSelected = useSpeakerConfigStore((state) => state.bridgeSelected);
  const splitReset = useSpeakerConfigStore((state) => state.splitReset);
  const assignItemToOutputs = useSpeakerConfigStore((state) => state.assignItemToOutputs);
  const files = useLibraryStore((state) => state.files);
  const selectedFileId = useLibraryStore((state) => state.selectedFileId);
  const applyToDevice = useLibraryStore((state) => state.applyToDevice);
  const deleteLibraryFile = useLibraryStore((state) => state.deleteLibraryFile);
  const applying = useLibraryStore((state) => state.applying);
  const deleting = useLibraryStore((state) => state.deleting);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [loadDialogOpen, setLoadDialogOpen] = useState(false);

  const selection = [...(selectedOutputChannelsByScope[scopeKey] ?? [])].sort((a, b) => a - b);
  const scopedAssignments = outputAssignmentsByScope[scopeKey] ?? {};
  const selectionCount = selection.length;
  const canJoin =
    selectionCount >= 2 && selection.every((channel, idx) => idx === 0 || channel === selection[idx - 1] + 1);
  const canBridge =
    selectionCount >= 2 &&
    selection.every((channel) => {
      const start = channel % 2 === 1 ? channel : channel - 1;
      return selection.includes(start) && selection.includes(start + 1);
    });
  const canReset = selectionCount > 0;
  const selectedLibraryFile = files.find((file) => (file.id || file.name) === selectedFileId) ?? null;
  const queuedApplyItems = useMemo(() => buildQueuedApplyItems(scopedAssignments, files), [scopedAssignments, files]);
  const readyQueuedApplyItems = queuedApplyItems.filter((item) => item.wayMappings.length > 0);
  const skippedQueuedApplyItems = queuedApplyItems.filter((item) => item.wayMappings.length === 0);
  const canApplyAll = Boolean(scope && !applying && readyQueuedApplyItems.length > 0);

  const handleApplyAll = async () => {
    if (!scope) {
      toast.error("Apply all requires an active device");
      return;
    }

    if (readyQueuedApplyItems.length === 0) {
      toast.error("No queued speaker configs are ready to apply", {
        description:
          skippedQueuedApplyItems[0]?.missingReason ?? "Assign linked speaker profiles before using Apply all"
      });
      return;
    }

    const toastId = `speaker-apply-all-${scope}`;
    let appliedCount = 0;
    let failedCount = 0;
    let totalFragmentRetries = 0;
    let maxFrameAttempts = 1;
    let recoveredItems = 0;
    let firstError: string | null = null;

    toast.loading("Applying queued speaker configs", {
      id: toastId,
      description:
        skippedQueuedApplyItems.length > 0
          ? `Applying ${readyQueuedApplyItems.length} item(s), skipping ${skippedQueuedApplyItems.length} incomplete item(s)`
          : `Applying ${readyQueuedApplyItems.length} queued item(s)`
    });

    for (let index = 0; index < readyQueuedApplyItems.length; index += 1) {
      const item = readyQueuedApplyItems[index];
      toast.loading("Applying queued speaker configs", {
        id: toastId,
        description: `${index + 1}/${readyQueuedApplyItems.length}: ${item.model} -> ${formatChannelList(item.channels)}`
      });

      const outcome = await applyToDevice({
        mac: scope,
        wayMappings: item.wayMappings
      });

      if (!outcome.ok) {
        failedCount += 1;
        firstError ??=
          outcome.results.find((result) => !result.sent)?.error ?? outcome.error ?? "Unknown apply failure";
        continue;
      }

      appliedCount += 1;
      const itemFragmentRetries = outcome.results.reduce((sum, result) => sum + result.fragmentRetries, 0);
      const itemMaxFrameAttempts = outcome.results.reduce((max, result) => Math.max(max, result.frameAttemptsMax), 1);

      totalFragmentRetries += itemFragmentRetries;
      maxFrameAttempts = Math.max(maxFrameAttempts, itemMaxFrameAttempts);
      if (itemFragmentRetries > 0 || itemMaxFrameAttempts > 1) {
        recoveredItems += 1;
      }
    }

    if (failedCount > 0) {
      toast.error("Queued apply completed with errors", {
        id: toastId,
        description: `Applied ${appliedCount}, failed ${failedCount}, skipped ${skippedQueuedApplyItems.length}${firstError ? `. ${firstError}` : ""}`
      });
      return;
    }

    toast.success(
      recoveredItems > 0
        ? "Queued speaker configs applied with transport recovery"
        : "Queued speaker configs applied cleanly",
      {
        id: toastId,
        description:
          recoveredItems > 0
            ? `Applied ${appliedCount}, skipped ${skippedQueuedApplyItems.length}, recovered items ${recoveredItems}, fragment retries ${totalFragmentRetries}, max frame attempts ${maxFrameAttempts}`
            : `Applied ${appliedCount} queued item(s)${skippedQueuedApplyItems.length > 0 ? `, skipped ${skippedQueuedApplyItems.length}` : ""}`
      }
    );
  };

  const handleDeleteSelected = async () => {
    if (!selectedLibraryFile) return;

    const outcome = await deleteLibraryFile(selectedLibraryFile.id || selectedLibraryFile.name);
    if (!outcome.ok) {
      toast.error("Failed to delete library config", {
        description: outcome.error ?? "The selected library config could not be deleted"
      });
      return;
    }

    setDeleteDialogOpen(false);
    toast.success("Library config deleted", {
      description: `${selectedLibraryFile.brand || selectedLibraryFile.model || selectedLibraryFile.name} was removed from the library`
    });
  };

  const handleOpenConfigFolder = async () => {
    if (typeof window === "undefined" || !window.electronWindow?.isDesktop) {
      toast.error("Open config folder is only available in the desktop app");
      return;
    }

    const outcome = await window.electronWindow.openSpeakerLibraryFolder();
    if (!outcome.ok) {
      toast.error("Failed to open config folder", {
        description: outcome.error ?? "The speaker library folder could not be opened"
      });
    }
  };

  return (
    <section className="flex h-full min-h-0 flex-col rounded-md border border-border/50 bg-background/30 p-3">
      <div className="mb-2.5 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Controls</h3>
      </div>

      <div className="flex flex-1 flex-col">
        <Button
          type="button"
          variant="outline"
          className="mb-2 h-8 w-full justify-start gap-2 text-xs"
          disabled={!canJoin}
          onClick={() => joinSelected(scope)}
        >
          <Link2 className="h-3.5 w-3.5" />
          Join
        </Button>

        <Button
          type="button"
          variant="outline"
          className="mb-2 h-8 w-full justify-start gap-2 text-xs"
          disabled={!canBridge}
          onClick={() => bridgeSelected(scope)}
        >
          <SplitSquareVertical className="h-3.5 w-3.5" />
          Bridge
        </Button>

        <Button
          type="button"
          variant="outline"
          className="mb-2 h-8 w-full justify-start gap-2 text-xs"
          disabled={!canReset}
          onClick={() => splitReset(scope)}
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Split/Reset
        </Button>

        <Button
          type="button"
          variant="outline"
          className="h-8 w-full justify-start gap-2 text-xs"
          disabled={!canApplyAll}
          onClick={() => void handleApplyAll()}
        >
          <Upload className="h-3.5 w-3.5" />
          Apply all
        </Button>

        <div className="my-3 border-t border-border/50 pt-3">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Library actions
          </p>

          <Button
            type="button"
            variant="outline"
            className="mb-2 h-8 w-full justify-start gap-2 text-xs"
            disabled={!selectedLibraryFile}
            onClick={() => setLoadDialogOpen(true)}
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Load
          </Button>

          <Button type="button" variant="outline" className="mb-2 h-8 w-full justify-start gap-2 text-xs" disabled>
            <ArrowRight className="h-3.5 w-3.5" />
            Save
          </Button>

          <Button
            type="button"
            variant="outline"
            className="mb-2 h-8 w-full justify-start gap-2 text-xs"
            disabled={!selectedLibraryFile || deleting}
            onClick={() => setDeleteDialogOpen(true)}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete from library
          </Button>

          <Button
            type="button"
            variant="outline"
            className="h-8 w-full justify-start gap-2 text-xs"
            onClick={() => void handleOpenConfigFolder()}
          >
            <FolderOpen className="h-3.5 w-3.5" />
            Open config folder
          </Button>
        </div>
      </div>

      {selectedLibraryFile && (
        <LoadSpeakerConfigDialog
          open={loadDialogOpen}
          onOpenChange={setLoadDialogOpen}
          scope={scope ?? null}
          channelCount={channelCount}
          profile={selectedLibraryFile}
          onLoad={(selections: LoadWaySelection[]) => {
            if (!selectedLibraryFile) return;

            for (const sel of selections) {
              assignItemToOutputs({
                startChannel: sel.channel,
                maxChannels: channelCount,
                item: {
                  id: selectedLibraryFile.id || selectedLibraryFile.name,
                  model:
                    [selectedLibraryFile.brand, selectedLibraryFile.model].filter(Boolean).join(" ").trim() ||
                    selectedLibraryFile.name,
                  ways: sel.wayLabel,
                  wayCount: 1
                },
                scope
              });
            }

            setLoadDialogOpen(false);

            toast.success("Speaker model updated", {
              description: `Loaded ${selections.length} way(s) from ${selectedLibraryFile.brand || selectedLibraryFile.model || selectedLibraryFile.name}`
            });
          }}
        />
      )}

      <ConfirmActionDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Delete selected library config?"
        description={
          selectedLibraryFile
            ? `Remove ${selectedLibraryFile.brand || selectedLibraryFile.model || selectedLibraryFile.name} from the speaker library.`
            : "Remove the selected speaker config from the library."
        }
        confirmLabel="Delete"
        confirmDisabled={!selectedLibraryFile || deleting}
        onConfirm={() => void handleDeleteSelected()}
      />
    </section>
  );
}
