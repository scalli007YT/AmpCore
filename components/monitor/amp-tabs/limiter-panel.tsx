"use client";

import { useEffect, useMemo, useState } from "react";
import type { BridgeReadback, ChannelParams } from "@/stores/AmpStore";
import { Card, CardContent } from "@/components/ui/card";
import { useVuMeters } from "@/hooks/useVuMeters";
import { useAmpActions } from "@/hooks/useAmpActions";
import { useProjectStore } from "@/stores/ProjectStore";
import { LimiterDetailsDialog } from "@/components/dialogs/limiter-details-dialog";
import type { HeartbeatData } from "@/stores/AmpStore";
import {
  bridgeVoltageMultiplier,
  limiterPowerFromDisplayVoltage,
  normalizeLimiterLoadOhm,
  toLimiterDisplayVoltage
} from "@/lib/generic";
import { getChannelLabels } from "@/lib/channel-labels";

export function LimiterBlock({
  mac,
  ratedRmsV,
  limiterLineVoltageOffset = 0,
  channelOhms,
  bridgePairs,
  heartbeat,
  channels,
  limiters,
  showTitle = true
}: {
  mac: string;
  ratedRmsV?: number;
  limiterLineVoltageOffset?: number;
  channelOhms: number[];
  bridgePairs?: BridgeReadback[];
  heartbeat?: HeartbeatData;
  channels: ChannelParams["channels"];
  limiters: number[];
  showTitle?: boolean;
}) {
  const channelLabels = getChannelLabels(channels.length);
  const vu = useVuMeters(mac);
  const {
    rmsLimiterOut,
    peakLimiterOut,
    setRmsLimiterAttack,
    setRmsLimiterReleaseMultiplier,
    setRmsLimiterThreshold,
    setPeakLimiterHold,
    setPeakLimiterRelease,
    setPeakLimiterThreshold
  } = useAmpActions();
  const { updateAmpChannelOhms } = useProjectStore();
  const vuOutputDbu = vu?.outputDbu ?? heartbeat?.outputDbu?.map(() => null) ?? channels.map(() => null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [activeChannel, setActiveChannel] = useState(0);
  const limiterGridColsClass =
    channels.length <= 1
      ? "grid-cols-1"
      : channels.length === 2
        ? "grid-cols-2"
        : channels.length === 3
          ? "grid-cols-3"
          : "grid-cols-4";

  const isChannelDisabledByBridge = (channelIndex: number) => {
    const pairIndex = Math.floor(channelIndex / 2);
    const pairBridged = bridgePairs?.[pairIndex]?.bridged === true;
    const isSecondInPair = channelIndex % 2 === 1;
    return pairBridged && isSecondInPair;
  };

  const firstEnabledChannel = useMemo(() => {
    for (let i = 0; i < channels.length; i += 1) {
      if (!isChannelDisabledByBridge(i)) return i;
    }
    return 0;
  }, [channels.length, bridgePairs]);

  useEffect(() => {
    if (activeChannel >= channels.length || isChannelDisabledByBridge(activeChannel)) {
      setActiveChannel(firstEnabledChannel);
    }
  }, [activeChannel, channels.length, bridgePairs, firstEnabledChannel]);

  const effectiveActiveChannel =
    activeChannel < channels.length && !isChannelDisabledByBridge(activeChannel) ? activeChannel : firstEnabledChannel;

  const active = channels[effectiveActiveChannel];
  const activePairIndex = Math.floor(effectiveActiveChannel / 2);
  const activePairBridged = bridgePairs?.[activePairIndex]?.bridged === true;
  const activeIsSecondInPair = effectiveActiveChannel % 2 === 1;
  const activeBridgeMaster = activePairBridged && !activeIsSecondInPair;
  const activePairLabel = `${channelLabels[activePairIndex * 2] ?? activePairIndex * 2}+${channelLabels[activePairIndex * 2 + 1] ?? activePairIndex * 2 + 1}`;
  const activeChannelName = activeBridgeMaster
    ? activePairLabel
    : `Out${channelLabels[effectiveActiveChannel] ?? effectiveActiveChannel + 1}`;
  const activeLoadOhm = activePairBridged
    ? normalizeLimiterLoadOhm(channelOhms[activePairIndex * 2], true)
    : normalizeLimiterLoadOhm(channelOhms[effectiveActiveChannel], false);
  const activeGr = limiters[effectiveActiveChannel] ?? 0;
  const activeOutputDb = vuOutputDbu[effectiveActiveChannel] ?? null;

  const handleActiveChannelChange = (nextChannel: number) => {
    if (nextChannel < 0 || nextChannel >= channels.length) return;
    if (isChannelDisabledByBridge(nextChannel)) return;
    setActiveChannel(nextChannel);
  };

  return (
    <div className="flex flex-col gap-1.5">
      {showTitle && (
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Limiters</span>
      )}

      <div className={`grid w-full gap-2 ${limiterGridColsClass}`}>
        {channels.map((ch, i) => {
          const rms = ch.rmsLimiter;
          const peak = ch.peakLimiter;
          const gr = limiters[i] ?? 0;
          const pairIndex = Math.floor(i / 2);
          const pairBridged = bridgePairs?.[pairIndex]?.bridged === true;
          const isSecondInPair = i % 2 === 1;
          const disabledByBridge = pairBridged && isSecondInPair;
          const pairLabel = `${channelLabels[pairIndex * 2] ?? pairIndex * 2}+${channelLabels[pairIndex * 2 + 1] ?? pairIndex * 2 + 1}`;
          const bridgeMaster = pairBridged && !isSecondInPair;
          const enabled = rms.enabled || peak.enabled;
          const channelName = bridgeMaster ? pairLabel : `Out${channelLabels[i] ?? i + 1}`;
          const loadOhm = pairBridged
            ? normalizeLimiterLoadOhm(channelOhms[pairIndex * 2], true)
            : normalizeLimiterLoadOhm(channelOhms[i], false);
          const displayRmsThreshold =
            toLimiterDisplayVoltage(rms.thresholdVrms, bridgeMaster) + limiterLineVoltageOffset;
          const displayPeakThreshold =
            toLimiterDisplayVoltage(peak.thresholdVp, bridgeMaster) + limiterLineVoltageOffset * Math.SQRT2;
          const displayPrmsW = limiterPowerFromDisplayVoltage(displayRmsThreshold, loadOhm);
          const displayPpeakW = limiterPowerFromDisplayVoltage(displayPeakThreshold, loadOhm);

          return (
            <button
              key={i}
              type="button"
              disabled={disabledByBridge}
              onClick={() => {
                setActiveChannel(i);
                setDialogOpen(true);
              }}
              className="text-left disabled:cursor-not-allowed"
            >
              <Card
                size="sm"
                className={`relative w-full overflow-visible transition-all ${
                  disabledByBridge
                    ? "opacity-40 grayscale"
                    : "hover:bg-muted/20 hover:border-primary/50 hover:shadow-sm"
                } ${enabled ? "text-foreground" : "text-muted-foreground"}`}
              >
                <CardContent className="flex w-full flex-col gap-2.5 py-2.5 px-2 select-none">
                  {/* Header */}
                  <div className="flex items-baseline justify-between gap-1 min-w-0">
                    <p className="text-xs font-bold leading-tight truncate">{channelName}</p>
                    <div
                      className={`h-2 w-2 flex-shrink-0 rounded-full ${
                        disabledByBridge ? "bg-amber-600" : enabled ? "bg-green-500" : "bg-slate-400"
                      }`}
                    />
                  </div>

                  {/* Two-column layout: RMS | Peak */}
                  <div className="grid grid-cols-2 gap-1.5">
                    {/* RMS Column */}
                    <div className="space-y-1.5 border-r border-border/30 pr-1.5">
                      <div className="space-y-1">
                        <p className="text-[9px] font-semibold uppercase text-muted-foreground">RMS</p>
                        <div className="space-y-0.5">
                          <div className="flex items-baseline gap-0.5">
                            <span className="font-mono text-[10px] tabular-nums leading-none">
                              {displayRmsThreshold.toFixed(2)}
                            </span>
                            <span className="text-[8px] text-muted-foreground">V</span>
                          </div>
                          <div className="flex items-baseline gap-0.5">
                            <span className="font-mono text-[10px] tabular-nums leading-none">{displayPrmsW}</span>
                            <span className="text-[8px] text-muted-foreground">W</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div
                          className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${
                            rms.enabled ? "bg-green-500" : "bg-red-500"
                          }`}
                        />
                        <span className="text-[10px]">{rms.enabled ? "On" : "Off"}</span>
                      </div>
                    </div>

                    {/* Peak Column */}
                    <div className="space-y-1.5 pl-1.5">
                      <div className="space-y-1">
                        <p className="text-[9px] font-semibold uppercase text-muted-foreground">Peak</p>
                        <div className="space-y-0.5">
                          <div className="flex items-baseline gap-0.5">
                            <span className="font-mono text-[10px] tabular-nums leading-none">
                              {displayPeakThreshold.toFixed(2)}
                            </span>
                            <span className="text-[8px] text-muted-foreground">V</span>
                          </div>
                          <div className="flex items-baseline gap-0.5">
                            <span className="font-mono text-[10px] tabular-nums leading-none">{displayPpeakW}</span>
                            <span className="text-[8px] text-muted-foreground">W</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div
                          className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${
                            peak.enabled ? "bg-green-500" : "bg-red-500"
                          }`}
                        />
                        <span className="text-[10px]">{peak.enabled ? "On" : "Off"}</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </button>
          );
        })}
      </div>

      {active ? (
        <LimiterDetailsDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          mac={mac}
          channel={effectiveActiveChannel}
          channelName={activeChannelName}
          channelCount={channels.length}
          activeChannel={effectiveActiveChannel}
          onActiveChannelChange={handleActiveChannelChange}
          enableChannelSwitching
          bridgeMode={activePairBridged && !activeIsSecondInPair}
          disabled={false}
          ratedRmsV={ratedRmsV}
          limiterLineVoltageOffset={limiterLineVoltageOffset}
          loadOhm={activeLoadOhm}
          rms={active.rmsLimiter}
          peak={active.peakLimiter}
          gr={activeGr}
          outputDb={activeOutputDb}
          onToggleRms={(toggleMac, toggleChannel, enabledValue) =>
            rmsLimiterOut(toggleMac, toggleChannel, enabledValue, {
              attackMs: channels[toggleChannel]?.rmsLimiter.attackMs ?? active.rmsLimiter.attackMs,
              releaseMultiplier:
                channels[toggleChannel]?.rmsLimiter.releaseMultiplier ?? active.rmsLimiter.releaseMultiplier,
              thresholdVrms: channels[toggleChannel]?.rmsLimiter.thresholdVrms ?? active.rmsLimiter.thresholdVrms
            })
          }
          onTogglePeak={(toggleMac, toggleChannel, enabledValue) =>
            peakLimiterOut(toggleMac, toggleChannel, enabledValue, {
              holdMs: channels[toggleChannel]?.peakLimiter.holdMs ?? active.peakLimiter.holdMs,
              releaseMs: channels[toggleChannel]?.peakLimiter.releaseMs ?? active.peakLimiter.releaseMs,
              thresholdVp: channels[toggleChannel]?.peakLimiter.thresholdVp ?? active.peakLimiter.thresholdVp
            })
          }
          onSetRmsAttack={setRmsLimiterAttack}
          onSetRmsReleaseMultiplier={setRmsLimiterReleaseMultiplier}
          onSetRmsThreshold={setRmsLimiterThreshold}
          onSetPeakHold={setPeakLimiterHold}
          onSetPeakRelease={setPeakLimiterRelease}
          onSetPeakThreshold={setPeakLimiterThreshold}
          onSetOhms={(ohmsMac, ohmsChannel, ohms) => updateAmpChannelOhms(ohmsMac, ohmsChannel, ohms)}
        />
      ) : null}
    </div>
  );
}
