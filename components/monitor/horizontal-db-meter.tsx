"use client";

import type { CSSProperties } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function HorizontalDbMeter({
  value,
  dbTop,
  dbBottom,
  limit: clip,
  width = 220,
  height = 24,
  fillDirection = "left-to-right",
  thresholdLines
}: {
  value: number | null;
  dbTop: number;
  dbBottom: number;
  limit?: boolean;
  width?: number;
  height?: number;
  fillDirection?: "left-to-right" | "right-to-left";
  thresholdLines?: { db: number; color: string; label?: string }[];
}) {
  const fill = value === null || value < dbBottom ? 0 : Math.min(1, (value - dbBottom) / (dbTop - dbBottom));

  const dbRange = dbTop - dbBottom;
  const fillAnchor = fillDirection === "right-to-left" ? "right-0" : "left-0";

  return (
    <div
      className="relative rounded-[min(var(--radius),8px)] overflow-hidden bg-muted/30 border border-border/60 flex-shrink-0"
      style={{ width, height }}
    >
      <div
        className={`absolute ${fillAnchor} top-0 bottom-0 ${clip ? "bg-destructive" : "bg-primary"}`}
        style={{ width: `${fill * 100}%` }}
      />

      {thresholdLines?.map(({ db, color, label }, idx) => {
        const pct = Math.min(1, Math.max(0, (db - dbBottom) / dbRange));
        if (db < dbBottom || db > dbTop) return null;

        const lineStyle: CSSProperties = {
          left: `calc(${pct * 100}% - 1px)`,
          width: 3,
          backgroundColor: color,
          opacity: 0.85
        };

        if (!label) {
          return <div key={idx} className="absolute top-0 bottom-0 pointer-events-none" style={lineStyle} />;
        }

        return (
          <Tooltip key={idx}>
            <TooltipTrigger asChild>
              <div
                className="absolute top-0 bottom-0 cursor-default"
                style={{
                  left: `calc(${pct * 100}% - 5px)`,
                  width: 10
                }}
              >
                <div
                  className="absolute top-0 bottom-0"
                  style={{
                    left: 3.5,
                    width: 3,
                    backgroundColor: color,
                    opacity: 0.85
                  }}
                />
              </div>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              {label}
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}
