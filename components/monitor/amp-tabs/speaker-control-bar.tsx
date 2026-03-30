"use client";

import { Link2, RotateCcw, SplitSquareVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSpeakerConfigStore } from "@/stores/SpeakerConfigStore";

interface SpeakerControlBarProps {
  scope?: string | null;
}

export function SpeakerControlBar({ scope }: SpeakerControlBarProps) {
  const scopeKey = scope?.trim().toUpperCase() || "__global__";
  const selectedOutputChannelsByScope = useSpeakerConfigStore((state) => state.selectedOutputChannelsByScope);
  const joinSelected = useSpeakerConfigStore((state) => state.joinSelected);
  const bridgeSelected = useSpeakerConfigStore((state) => state.bridgeSelected);
  const splitReset = useSpeakerConfigStore((state) => state.splitReset);

  const selection = [...(selectedOutputChannelsByScope[scopeKey] ?? [])].sort((a, b) => a - b);
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

  return (
    <section className="h-full rounded-md border border-border/50 bg-background/30 p-3">
      <div className="mb-2.5 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Controls</h3>
      </div>

      <div className="rounded-md border border-border/50 bg-muted/10 p-3">
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
          className="h-8 w-full justify-start gap-2 text-xs"
          disabled={!canReset}
          onClick={() => splitReset(scope)}
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Split/Reset
        </Button>
      </div>
    </section>
  );
}
