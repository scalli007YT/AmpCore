"use client";

import { useMemo, useRef } from "react";
import { cn } from "@/lib/utils";
import { useSpeakerConfigStore } from "@/stores/SpeakerConfigStore";

const EMPTY_SELECTION: number[] = [];

interface SpeakerDeviceDraftProps {
  channelCount?: number;
  scope?: string | null;
}

export function SpeakerModelDraft({ channelCount = 4, scope }: SpeakerDeviceDraftProps) {
  const rowCount = Math.max(1, Math.min(channelCount, 8));
  const scopeKey = scope?.trim().toUpperCase() || "__global__";
  const lastClickedChannelRef = useRef<number | null>(null);

  const selectedOutputChannelsByScope = useSpeakerConfigStore((state) => state.selectedOutputChannelsByScope);
  const setOutputChannels = useSpeakerConfigStore((state) => state.setOutputChannels);
  const selectedOutputChannels = selectedOutputChannelsByScope[scopeKey] ?? EMPTY_SELECTION;

  const rows = useMemo(() => {
    return Array.from({ length: rowCount }, (_, index) => index + 1);
  }, [rowCount]);

  const buildRangeSelection = (from: number, to: number): number[] => {
    const min = Math.min(from, to);
    const max = Math.max(from, to);
    return Array.from({ length: max - min + 1 }, (_, index) => min + index);
  };

  return (
    <section className="h-full rounded-md border border-border/50 bg-background/30 p-4">
      <div className="mb-3 flex items-center">
        <h3 className="text-sm font-semibold">Speaker Model</h3>
      </div>

      <div className="rounded-md border border-border/50 bg-muted/10 p-3">
        <div className="grid grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)_minmax(0,0.9fr)] gap-0">
          <div className="pr-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Speaker Model
            </p>
            <div className="space-y-2">
              {rows.map((row) => (
                <div
                  key={`model-${row}`}
                  className="flex h-10 items-center rounded-md border border-border/40 bg-muted/10 px-3"
                >
                  <span className="truncate text-sm text-foreground/90">Speaker Model</span>
                </div>
              ))}
            </div>
          </div>

          <div className="border-l border-border/35 px-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Ways Description
            </p>
            <div className="space-y-2">
              {rows.map((row) => (
                <div
                  key={`ways-${row}`}
                  className="flex h-10 items-center rounded-md border border-border/40 bg-muted/10 px-3"
                >
                  <span className="text-sm text-muted-foreground">-</span>
                </div>
              ))}
            </div>
          </div>

          <div className="border-l border-border/35 pl-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Physical Outputs
            </p>

            <div className="space-y-2">
              {rows.map((row) => {
                const selected = selectedOutputChannels.includes(row);

                return (
                  <button
                    key={`out-${row}`}
                    type="button"
                    onClick={(event) => {
                      const ctrlOrMeta = event.ctrlKey || event.metaKey;

                      if (event.shiftKey) {
                        const anchor =
                          lastClickedChannelRef.current ??
                          selectedOutputChannels[selectedOutputChannels.length - 1] ??
                          row;
                        setOutputChannels(buildRangeSelection(anchor, row), scope);
                        lastClickedChannelRef.current = row;
                        return;
                      }

                      if (ctrlOrMeta) {
                        if (!selectedOutputChannels.includes(row)) {
                          setOutputChannels([...selectedOutputChannels, row], scope);
                        }
                        lastClickedChannelRef.current = row;
                        return;
                      }

                      setOutputChannels([row], scope);
                      lastClickedChannelRef.current = row;
                    }}
                    className={cn(
                      "flex h-10 w-full items-center justify-center rounded-md border border-dashed px-2 transition-colors duration-200",
                      selected
                        ? "border-sky-400/70 bg-sky-500/15 text-sky-300"
                        : "border-border/50 bg-background/30 text-muted-foreground hover:border-sky-400/40 hover:text-foreground"
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
                        selected
                          ? "border-sky-300/70 bg-sky-400/20 text-sky-200"
                          : "border-border/60 text-muted-foreground"
                      )}
                    >
                      <span className="pointer-events-none absolute inset-0 grid place-items-center translate-y-[0.5px] text-[11px] font-semibold leading-none tabular-nums">
                        {row}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
