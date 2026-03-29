"use client";

import type { ChannelFlags } from "@/stores/AmpStore";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * Aggregate device-level power state from per-channel flags.
 *
 * Priority (matches original firmware controller logic):
 *  - Device standby active           → 2 (orange, blink)
 *  - Any channel fault/dcp/powerError → 1 (red, blink)
 *  - Any channel open/overload/clip   → 3 (amber, static)
 *  - Any channel temp                 → 4 (amber, static)
 *  - Any channel sleep                → 5 (green, static)
 *  - Any channel standby              → 2 (orange, blink)
 *  - Otherwise                        → 0 (green, static)
 */
function deriveDeviceState(
  channelFlags: ChannelFlags[] | undefined,
  deviceStandby: boolean | undefined
): { state: number; label: string } {
  if (deviceStandby) return { state: 2, label: "Standby" };
  if (!channelFlags?.length) return { state: 0, label: "Normal" };

  let hasWarning = false;
  let hasTemp = false;
  let hasSleep = false;
  let hasChannelStandby = false;

  for (const f of channelFlags) {
    if (f.fault || f.dcp || f.powerError) return { state: 1, label: "Fault" };
    if (f.open || f.overload || f.clip) hasWarning = true;
    if (f.temp) hasTemp = true;
    if (f.sleep) hasSleep = true;
    if (f.standby) hasChannelStandby = true;
  }

  if (hasWarning) return { state: 3, label: "Warning" };
  if (hasTemp) return { state: 4, label: "Temp" };
  if (hasSleep) return { state: 5, label: "Sleep" };
  if (hasChannelStandby) return { state: 2, label: "Standby" };
  return { state: 0, label: "Normal" };
}

const LED_STYLES: Record<number, { bg: string; shadow: string; blink: boolean }> = {
  0: { bg: "bg-emerald-500", shadow: "shadow-[0_0_6px_1px_rgba(16,185,129,0.6)]", blink: false },
  1: { bg: "bg-red-500", shadow: "shadow-[0_0_6px_1px_rgba(239,68,68,0.6)]", blink: true },
  2: { bg: "bg-orange-500", shadow: "shadow-[0_0_6px_1px_rgba(249,115,22,0.6)]", blink: true },
  3: { bg: "bg-amber-500", shadow: "shadow-[0_0_6px_1px_rgba(245,158,11,0.6)]", blink: false },
  4: { bg: "bg-amber-500", shadow: "shadow-[0_0_6px_1px_rgba(245,158,11,0.6)]", blink: false },
  5: { bg: "bg-emerald-500", shadow: "shadow-[0_0_6px_1px_rgba(16,185,129,0.6)]", blink: false }
};

export function StatusLed({ channelFlags, standby }: { channelFlags?: ChannelFlags[]; standby?: boolean }) {
  const { state, label } = deriveDeviceState(channelFlags, standby);
  const style = LED_STYLES[state] ?? LED_STYLES[0];

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex items-center gap-1.5 select-none">
          <span
            className={`block h-3 w-3 rounded-full ${style.bg} ${style.shadow} ${style.blink ? "animate-pulse" : ""}`}
          />
          <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-xs">
        Device status: {label}
      </TooltipContent>
    </Tooltip>
  );
}
