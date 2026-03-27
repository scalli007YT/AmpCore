"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { getChannelLabels } from "@/lib/channel-labels";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

type ChannelButtonGroupSize = "sm" | "default" | "lg";

interface ChannelButtonGroupProps {
  /** Number of channels to render (e.g., 4, 8). */
  channelCount: number;
  /** Currently selected channel index (0-based). */
  value: number;
  /** Callback when channel selection changes. */
  onValueChange: (channel: number) => void;
  /** Orientation of the button group. */
  orientation?: "horizontal" | "vertical";
  /** Size variant. */
  size?: ChannelButtonGroupSize;
  /** Custom labels for channels (defaults to A, B, C, D...). */
  labels?: string[];
  /** Additional className for the container. */
  className?: string;
  /** Whether the group is disabled. */
  disabled?: boolean;
  /** Gap between buttons (in spacing units). */
  spacing?: number;
}

const sizeClasses: Record<ChannelButtonGroupSize, string> = {
  sm: "h-7 w-7 text-xs",
  default: "h-9 w-9 text-sm",
  lg: "h-11 w-11 text-base"
};

/**
 * A versatile channel button group component for switching between amp channels.
 *
 * @example
 * // 4-channel horizontal (default)
 * <ChannelButtonGroup channelCount={4} value={0} onValueChange={setChannel} />
 *
 * @example
 * // 8-channel vertical
 * <ChannelButtonGroup channelCount={8} value={2} onValueChange={setChannel} orientation="vertical" />
 *
 * @example
 * // Custom labels
 * <ChannelButtonGroup channelCount={4} value={0} onValueChange={setChannel} labels={["IN1", "IN2", "IN3", "IN4"]} />
 */
export function ChannelButtonGroup({
  channelCount,
  value,
  onValueChange,
  orientation = "horizontal",
  size = "default",
  labels,
  className,
  disabled = false,
  spacing = 0
}: ChannelButtonGroupProps) {
  const channelLabels = labels ?? getChannelLabels(channelCount);

  const handleValueChange = (newValue: string) => {
    if (newValue === "") return; // Prevent deselection
    const channelIndex = parseInt(newValue, 10);
    if (!isNaN(channelIndex) && channelIndex !== value) {
      onValueChange(channelIndex);
    }
  };

  return (
    <ToggleGroup
      type="single"
      value={String(value)}
      onValueChange={handleValueChange}
      orientation={orientation}
      variant="outline"
      spacing={spacing}
      className={cn("shrink-0", orientation === "vertical" ? "flex-col" : "flex-row", className)}
    >
      {channelLabels.slice(0, channelCount).map((label, index) => (
        <ToggleGroupItem
          key={index}
          value={String(index)}
          disabled={disabled}
          aria-label={`Channel ${label}`}
          className={cn(
            sizeClasses[size],
            "font-semibold transition-colors",
            "data-[state=on]:bg-primary data-[state=on]:text-primary-foreground",
            "data-[state=off]:hover:bg-muted/60"
          )}
        >
          {label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

export type { ChannelButtonGroupProps, ChannelButtonGroupSize };
