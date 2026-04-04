"use client";

import { useState } from "react";
import type { HeartbeatData, ChannelParams, BridgeReadback, ChannelFlags } from "@/stores/AmpStore";
import type { SourceCapabilities } from "@/lib/source-capabilities";
import { useAmpActions } from "@/hooks/useAmpActions";
import { useVuMeters } from "@/hooks/useVuMeters";
import { getStoredAmpLinkConfig, useAmpActionLinkStore } from "@/stores/AmpActionLinkStore";
import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ConfirmActionDialog } from "@/components/dialogs/confirm-action-dialog";
import { SourceConfigDialog } from "@/components/dialogs/source-config-dialog";
import { EqBandDialog } from "@/components/monitor/amp-tabs/eq-controls";
import { FirFilterDialog } from "@/components/monitor/amp-tabs/fir-filter-panel";
import { HorizontalDbMeter } from "@/components/monitor/amp-tabs/horizontal-db-meter";
import {
  DelayPopover,
  VolumePopover,
  DbPopover,
  PowerModePill,
  EditableChannelName,
  ChannelFlagPills,
  outDbScale,
  IN_DB_TOP,
  IN_DB_BOT,
  IN_SCALE
} from "@/components/monitor/amp-tabs/heartbeat-controls";
import { COLORS } from "@/lib/colors";
import { OUTPUT_TRIM_MAX_DB, OUTPUT_TRIM_MIN_DB, OUTPUT_VOLUME_MAX_DB, OUTPUT_VOLUME_MIN_DB } from "@/lib/constants";
import { getLinkedChannels, type LinkScope } from "@/lib/amp-action-linking";
import { getChannelLabels } from "@/lib/channel-labels";
import { voltageToMeterDb, rmsToPeakVoltage, formatDbfs } from "@/lib/generic";
import { useI18n } from "@/components/layout/i18n-provider";
import { Volume1, VolumeX, Circle, CircleSlash } from "lucide-react";

type BridgePair = number;

export function HeartbeatDashboard({
  hb,
  mac,
  ratedRmsV,
  channelParams,
  bridgePairs,
  outputChx,
  channelFlags,
  sourceCapabilities,
  limiterLineVoltageOffset = 0
}: {
  hb: HeartbeatData;
  mac: string;
  ratedRmsV?: number;
  channelParams?: ChannelParams;
  bridgePairs?: BridgeReadback[];
  outputChx?: number;
  channelFlags?: ChannelFlags[];
  sourceCapabilities?: SourceCapabilities;
  limiterLineVoltageOffset?: number;
}) {
  const dict = useI18n();
  const byMac = useAmpActionLinkStore((state) => state.byMac);
  const linkConfig = getStoredAmpLinkConfig(byMac, mac);
  const f1 = (n: number) => n.toFixed(1);
  const f0 = (n: number) => n.toFixed(0);

  const vu = useVuMeters(mac);
  const {
    setBridgePair,
    muteIn,
    muteOut,
    invertPolarityOut,
    noiseGateOut,
    setVolumeOut,
    setDelayIn,
    setDelayOut,
    setTrimOut,
    setPowerModeOut,
    renameInput,
    renameOutput
  } = useAmpActions();

  const vuOutputDbu = vu?.outputDbu ?? hb.outputDbu.map(() => null);
  const vuInputDbfs = vu?.inputDbfs ?? hb.inputDbfs;
  const { top: OUT_DB_TOP, bot: OUT_DB_BOT, ticks: OUT_SCALE } = outDbScale();

  const LABEL_H = 24;
  // Authoritative channel count: prefer discovery (outputChx) > FC=27 (channelParams) > heartbeat arrays
  const channelCount =
    outputChx && outputChx > 0
      ? outputChx
      : channelParams?.channels.length && channelParams.channels.length > 0
        ? channelParams.channels.length
        : Math.max(hb.outputStates.length, hb.inputStates.length, hb.outputVoltages.length, hb.inputDbfs.length, 1);
  const channelLabels = getChannelLabels(channelCount);
  const outputPairCount = Math.ceil(channelLabels.length / 2);
  const [bridgeConfirmOpen, setBridgeConfirmOpen] = useState(false);
  const [bridgeBusy, setBridgeBusy] = useState(false);
  const [pendingBridgePair, setPendingBridgePair] = useState<BridgePair | null>(null);
  const [pendingBridgeNext, setPendingBridgeNext] = useState<boolean | null>(null);
  const [hoveredLink, setHoveredLink] = useState<{ scope: LinkScope; channel: number } | null>(null);

  const getLinkHoverProps = (scope: LinkScope, channel: number) => ({
    onMouseEnter: () => setHoveredLink({ scope, channel }),
    onMouseLeave: () => setHoveredLink(null),
    onFocus: () => setHoveredLink({ scope, channel }),
    onBlur: () => setHoveredLink(null)
  });

  const isLinkedHovered = (scope: LinkScope, channel: number) => {
    if (!hoveredLink || hoveredLink.scope !== scope) return false;
    return getLinkedChannels(linkConfig, scope, hoveredLink.channel).includes(channel);
  };

  const linkedHoverClass = (scope: LinkScope, channel: number, hoverClass: string) =>
    isLinkedHovered(scope, channel) ? hoverClass : "";

  const pairBridgeState = (pair: number) => bridgePairs?.[pair]?.bridged ?? null;

  const effectivePairBridgeState = (pair: number) => {
    if (bridgeBusy && pendingBridgePair !== null && pendingBridgeNext !== null && pendingBridgePair === pair) {
      return pendingBridgeNext;
    }

    return pairBridgeState(pair);
  };

  const requestBridgeToggle = (pairIndex: number) => {
    const currentState = effectivePairBridgeState(pairIndex);
    if (currentState === null) return;

    setPendingBridgePair(pairIndex);
    setPendingBridgeNext(!currentState);
    setBridgeConfirmOpen(true);
  };

  const handleBridgeDialogOpen = (open: boolean) => {
    if (bridgeBusy) return;
    setBridgeConfirmOpen(open);
    if (!open) {
      setPendingBridgePair(null);
      setPendingBridgeNext(null);
    }
  };

  const handleConfirmBridge = async () => {
    if (pendingBridgePair === null || pendingBridgeNext === null) return;

    setBridgeBusy(true);
    try {
      await setBridgePair(mac, pendingBridgePair, pendingBridgeNext);
    } finally {
      setBridgeBusy(false);
      setBridgeConfirmOpen(false);
      setPendingBridgePair(null);
      setPendingBridgeNext(null);
    }
  };

  const isBridgedSecondColumn = (channelIndex: number) => {
    if (channelIndex % 2 === 0) return false;
    const pairIndex = Math.floor(channelIndex / 2);
    return effectivePairBridgeState(pairIndex) === true;
  };

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex flex-col gap-4 text-xs select-none w-full">
        <section className="flex flex-col gap-1.5">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Input</h3>
          <div className="rounded-lg border border-border/40 bg-muted/5 p-3 overflow-x-auto">
            <div className="flex min-w-fit flex-col gap-2">
              {channelLabels.map((_, i) => {
                const dbfsVal = vuInputDbfs[i];
                const hasSignal = hb.inputStates[i] === 0;
                const isLimit = dbfsVal !== null && dbfsVal > -1;
                return (
                  <div key={i} className="relative">
                    <div className="absolute left-[102px] top-1 z-10">
                      <EditableChannelName
                        name={channelParams?.channels[i]?.inputName}
                        fallback={`In${i + 1}`}
                        active={hasSignal}
                        onRename={(newName) => renameInput(mac, i, newName)}
                        className="rounded border border-border/50 bg-card/90 px-1.5 py-0.5"
                      />
                    </div>
                    <div className="flex items-center gap-2 rounded-md border border-border/30 bg-muted/5 px-2.5 pb-2 pt-4">
                      <div className="w-[84px] shrink-0">
                        <SourceConfigDialog
                          channels={channelParams?.channels ?? []}
                          mac={mac}
                          capabilities={sourceCapabilities}
                          initialChannel={i}
                          trigger={
                            <button
                              type="button"
                              className="flex h-12 w-[84px] flex-col items-start justify-center gap-0.5 rounded border border-border/50 bg-muted/25 px-2 text-left transition-colors hover:border-primary/45 hover:bg-primary/10"
                            >
                              <span className="w-full truncate font-semibold text-[11px] text-foreground/90">
                                {channelParams?.channels[i]?.sourceType?.trim() || "Select"}
                              </span>
                              <span className="text-[9px] uppercase tracking-wide text-muted-foreground">Source</span>
                            </button>
                          }
                        />
                      </div>

                      <div className="flex flex-col shrink-0" style={{ width: 220 }}>
                        <HorizontalDbMeter
                          value={dbfsVal}
                          dbTop={IN_DB_TOP}
                          dbBottom={IN_DB_BOT}
                          limit={isLimit}
                          width={220}
                          height={28}
                        />
                        <div className="flex justify-between mt-0.5 px-px" style={{ width: 220 }}>
                          {IN_SCALE.map((t) => (
                            <span key={t} className="text-[9px] text-foreground/50 leading-none tabular-nums font-mono">
                              {t}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div
                        className={`flex h-12 w-16 shrink-0 flex-col items-center justify-center rounded border px-1 ${
                          hasSignal ? "border-green-500/40 bg-green-500/10" : "border-border/40 bg-muted/20 opacity-60"
                        }`}
                      >
                        <span className="font-mono text-[13px] font-semibold tabular-nums leading-none">
                          {formatDbfs(dbfsVal)}
                        </span>
                        <span className="text-[9px] text-foreground/65 mt-0.5">dBFS</span>
                      </div>

                      <div className="flex h-12 w-16 shrink-0 select-none flex-col items-center justify-center rounded border border-border/30 bg-muted/10 px-1 text-muted-foreground/55 pointer-events-none">
                        <span className="font-mono text-[13px] font-semibold tabular-nums leading-none">
                          {channelParams?.channels[i]?.gainIn ?? "~"}
                        </span>
                        <span className="text-[9px] text-muted-foreground/75 mt-0.5">Gain dB</span>
                      </div>

                      {(() => {
                        const muted = channelParams?.channels[i]?.muteIn;
                        const canClick = muted !== undefined;
                        return (
                          <button
                            type="button"
                            disabled={!canClick}
                            {...getLinkHoverProps("muteIn", i)}
                            onClick={() => canClick && void muteIn(mac, i, !muted)}
                            className={`flex h-12 w-16 shrink-0 flex-col items-center justify-center rounded border px-1 py-0.5 select-none transition-colors disabled:pointer-events-none disabled:opacity-50 ${
                              muted === true
                                ? "border-destructive/65 bg-destructive/15 text-destructive hover:bg-destructive/20"
                                : muted === false
                                  ? "border-border/50 bg-muted/20 text-foreground/80 hover:border-destructive/45 hover:text-destructive"
                                  : "border-border/30 bg-muted/10 text-muted-foreground/40"
                            } ${linkedHoverClass("muteIn", i, muted === false ? "border-destructive/40 text-destructive/70" : "")}`}
                          >
                            {muted === true ? (
                              <VolumeX className="w-5 h-5" />
                            ) : muted === false ? (
                              <Volume1 className="w-5 h-5" />
                            ) : (
                              <span className="font-mono text-[13px] font-semibold">~</span>
                            )}
                            <span className="text-[9px] leading-none text-muted-foreground mt-0.5">Mute</span>
                          </button>
                        );
                      })()}

                      <div className="w-16 shrink-0">
                        <DelayPopover
                          delayMs={channelParams?.channels[i]?.delayIn}
                          maxMs={100}
                          label="ms in"
                          buttonClassName="!h-12 text-[13px]"
                          onSet={(ms) => setDelayIn(mac, i, ms)}
                        />
                      </div>

                      <div className="w-16 shrink-0">
                        <EqBandDialog
                          triggerLabel="EQ In"
                          title={`Input EQ - ${channelParams?.channels[i]?.inputName ?? channelLabels[i] ?? i + 1}`}
                          triggerClassName={`!h-12 ${linkedHoverClass("inputEq", i, "ring-1 ring-purple-500/40")}`}
                          onTriggerMouseEnter={getLinkHoverProps("inputEq", i).onMouseEnter}
                          onTriggerMouseLeave={getLinkHoverProps("inputEq", i).onMouseLeave}
                          onTriggerFocus={getLinkHoverProps("inputEq", i).onFocus}
                          onTriggerBlur={getLinkHoverProps("inputEq", i).onBlur}
                          mac={mac}
                          channel={i}
                          target="input"
                          bands={channelParams?.channels[i]?.eqIn}
                          allChannelBands={channelParams?.channels.map((c) => c?.eqIn)}
                          channelCount={channelCount}
                          channelNames={channelParams?.channels.map((c) => c?.inputName)}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section className="flex flex-col gap-1.5">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Output</h3>
          <div className="rounded-lg border border-border/40 bg-muted/5 p-3 overflow-x-auto">
            <div className="flex min-w-fit flex-col gap-2">
              {Array.from({ length: outputPairCount }).map((_, pairIndex) => {
                const firstChannel = pairIndex * 2;
                const secondChannel = firstChannel + 1;
                const bridgeState = effectivePairBridgeState(pairIndex);
                const bridgeLabel = bridgeState === true ? "ON" : bridgeState === false ? "OFF" : "?";

                return (
                  <div key={pairIndex} className="flex items-stretch gap-1">
                    <button
                      type="button"
                      disabled={bridgeState === null || bridgeBusy}
                      onClick={() => requestBridgeToggle(pairIndex)}
                      className={`shrink-0 w-6 rounded-md border text-[8px] font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50 flex items-center justify-center ${
                        bridgeState === true
                          ? "border-emerald-500/60 bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25"
                          : "border-border/40 bg-muted/15 text-muted-foreground/70 hover:border-border/60 hover:bg-muted/25"
                      }`}
                    >
                      <span className="[writing-mode:vertical-lr] rotate-180 whitespace-nowrap tracking-wide">
                        {channelLabels[firstChannel]}/{channelLabels[secondChannel]} {bridgeLabel}
                      </span>
                    </button>

                    <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                      {[firstChannel, secondChannel].map((i) => {
                        if (i >= channelLabels.length) return null;
                        const ch = channelLabels[i];
                        const st = hb.outputStates[i] ?? 0;
                        const v = hb.outputVoltages[i];
                        const a = hb.outputCurrents[i];
                        const dbu = vuOutputDbu[i];
                        const temp = hb.temperatures[i] ?? 0;
                        const isClip = st === 5;
                        const isLimit = st === 5 || st === 10;
                        const isActive = st === 0 || st === 8;
                        const isDisabledByBridge = isBridgedSecondColumn(i);
                        const dbuVal = dbu === null || dbu <= OUT_DB_BOT ? null : Math.min(dbu, OUT_DB_TOP);

                        const chParam = channelParams?.channels[i];
                        const thresholdLines: { db: number; color: string; label: string }[] = [];

                        if (chParam?.rmsLimiter.enabled) {
                          const offsetVrms = chParam.rmsLimiter.thresholdVrms + limiterLineVoltageOffset;
                          const d = voltageToMeterDb(offsetVrms, ratedRmsV);
                          if (d !== null) {
                            thresholdLines.push({
                              db: d,
                              color: COLORS.RMS_LIMITER,
                              label: `RMS ${chParam.rmsLimiter.thresholdVrms.toFixed(2)} Vrms - ${chParam.rmsLimiter.prmsW} W (${d.toFixed(1)} dB)`
                            });
                          }
                        }

                        if (chParam?.peakLimiter.enabled) {
                          const offsetVp = chParam.peakLimiter.thresholdVp + limiterLineVoltageOffset * Math.SQRT2;
                          const d = voltageToMeterDb(offsetVp, rmsToPeakVoltage(ratedRmsV));
                          if (d !== null) {
                            thresholdLines.push({
                              db: d,
                              color: COLORS.PEAK_LIMITER,
                              label: `Peak ${chParam.peakLimiter.thresholdVp.toFixed(2)} Vp - ${chParam.peakLimiter.ppeakW} W (${d.toFixed(1)} dB)`
                            });
                          }
                        }

                        return (
                          <div key={i} className="relative">
                            <div className="absolute left-2 top-1 z-10 flex items-center gap-1.5">
                              <EditableChannelName
                                name={channelParams?.channels[i]?.outputName}
                                fallback={`Out${ch}`}
                                active={isActive}
                                onRename={(newName) => renameOutput(mac, i, newName)}
                                className="rounded border border-border/50 bg-card/90 px-1.5 py-0.5"
                              />
                              <ChannelFlagPills flags={channelFlags?.find((f) => f.channel === i)} />
                            </div>
                            <div className={isDisabledByBridge ? "opacity-40 pointer-events-none grayscale" : ""}>
                              <div
                                aria-disabled={isDisabledByBridge}
                                className="flex items-center gap-2 rounded-md border border-border/30 bg-muted/5 px-2.5 pb-2 pt-4"
                              >
                                <div className="flex flex-col shrink-0" style={{ width: 220 }}>
                                  <HorizontalDbMeter
                                    value={dbuVal}
                                    dbTop={OUT_DB_TOP}
                                    dbBottom={OUT_DB_BOT}
                                    limit={isClip || isLimit}
                                    width={220}
                                    height={28}
                                    thresholdLines={thresholdLines}
                                  />
                                  <div className="flex justify-between mt-0.5 px-px" style={{ width: 220 }}>
                                    {OUT_SCALE.map((t) => (
                                      <span
                                        key={t}
                                        className="text-[9px] text-foreground/50 leading-none tabular-nums font-mono"
                                      >
                                        {t}
                                      </span>
                                    ))}
                                  </div>
                                </div>

                                <div
                                  className={`shrink-0 rounded px-1.5 py-1 text-[11px] font-bold text-center leading-tight ${
                                    isLimit ? "bg-red-500 text-white" : "bg-muted/30 text-foreground/60"
                                  }`}
                                >
                                  LIM
                                </div>

                                <div
                                  className={`flex h-12 w-16 shrink-0 flex-col items-center justify-center rounded border border-border/50 bg-muted/25 ${v <= 0.01 ? "opacity-40" : ""}`}
                                >
                                  <span className="font-mono text-[13px] font-semibold tabular-nums leading-none">
                                    {v > 0.01 ? f1(v) : "0"}
                                  </span>
                                  <span className="text-[9px] text-muted-foreground mt-0.5">V</span>
                                </div>
                                <div
                                  className={`flex h-12 w-16 shrink-0 flex-col items-center justify-center rounded border border-border/50 bg-muted/25 ${a <= 0.01 ? "opacity-40" : ""}`}
                                >
                                  <span className="font-mono text-[13px] font-semibold tabular-nums leading-none">
                                    {a > 0.01 ? f1(a) : "0"}
                                  </span>
                                  <span className="text-[9px] text-muted-foreground mt-0.5">A</span>
                                </div>
                                <div className="flex h-12 w-16 shrink-0 flex-col items-center justify-center rounded border border-border/50 bg-muted/25">
                                  <span
                                    className={`font-mono text-[13px] font-semibold tabular-nums leading-none ${temp > 80 ? "text-red-500" : ""}`}
                                  >
                                    {f0(temp)}
                                  </span>
                                  <span className="text-[9px] text-muted-foreground mt-0.5">°C</span>
                                </div>

                                <div className="w-16 shrink-0">
                                  <FirFilterDialog
                                    mac={mac}
                                    channel={i}
                                    title={`FIR Filter - ${channelParams?.channels[i]?.outputName ?? `Out${channelLabels[i] ?? i + 1}`}`}
                                    channelCount={channelCount}
                                  />
                                </div>

                                <div className="w-16 shrink-0">
                                  <EqBandDialog
                                    triggerLabel="Edit|EQ Out"
                                    title={`Output EQ - ${channelParams?.channels[i]?.outputName ?? `Out${channelLabels[i] ?? i + 1}`}`}
                                    triggerClassName={`!h-12 ${linkedHoverClass("outputEq", i, "ring-1 ring-purple-500/40")}`}
                                    onTriggerMouseEnter={getLinkHoverProps("outputEq", i).onMouseEnter}
                                    onTriggerMouseLeave={getLinkHoverProps("outputEq", i).onMouseLeave}
                                    onTriggerFocus={getLinkHoverProps("outputEq", i).onFocus}
                                    onTriggerBlur={getLinkHoverProps("outputEq", i).onBlur}
                                    mac={mac}
                                    channel={i}
                                    target="output"
                                    bands={channelParams?.channels[i]?.eqOut}
                                    allChannelBands={channelParams?.channels.map((c) => c?.eqOut)}
                                    channelCount={channelCount}
                                    channelNames={channelParams?.channels.map((c) => c?.outputName)}
                                  />
                                </div>
                                <div className="w-16 shrink-0">
                                  <VolumePopover
                                    volumeDb={channelParams?.channels[i]?.volumeOut}
                                    label="Vol dB"
                                    title="Output Volume"
                                    minDb={OUTPUT_VOLUME_MIN_DB}
                                    maxDb={OUTPUT_VOLUME_MAX_DB}
                                    buttonClassName={`!h-12 text-[13px] ${linkedHoverClass("volumeOut", i, "border-primary/40 bg-muted/50")}`}
                                    onButtonMouseEnter={getLinkHoverProps("volumeOut", i).onMouseEnter}
                                    onButtonMouseLeave={getLinkHoverProps("volumeOut", i).onMouseLeave}
                                    onButtonFocus={getLinkHoverProps("volumeOut", i).onFocus}
                                    onButtonBlur={getLinkHoverProps("volumeOut", i).onBlur}
                                    onSet={(db) => setVolumeOut(mac, i, db)}
                                  />
                                </div>
                                <div className="w-16 shrink-0">
                                  <DbPopover
                                    valueDb={channelParams?.channels[i]?.trimOut}
                                    label="Trim dB"
                                    title="Output Trim"
                                    minDb={OUTPUT_TRIM_MIN_DB}
                                    maxDb={OUTPUT_TRIM_MAX_DB}
                                    buttonClassName={`!h-12 text-[13px] ${linkedHoverClass("trimOut", i, (channelParams?.channels[i]?.trimOut ?? 0) !== 0 ? "ring-1 ring-amber-500/45" : "ring-1 ring-amber-500/30")}`}
                                    onButtonMouseEnter={getLinkHoverProps("trimOut", i).onMouseEnter}
                                    onButtonMouseLeave={getLinkHoverProps("trimOut", i).onMouseLeave}
                                    onButtonFocus={getLinkHoverProps("trimOut", i).onFocus}
                                    onButtonBlur={getLinkHoverProps("trimOut", i).onBlur}
                                    onSet={(db) => setTrimOut(mac, i, db)}
                                  />
                                </div>
                                <div className="w-16 shrink-0">
                                  <DelayPopover
                                    delayMs={channelParams?.channels[i]?.delayOut}
                                    maxMs={20}
                                    label="ms out"
                                    buttonClassName={`!h-12 text-[13px] ${linkedHoverClass("delayOut", i, (channelParams?.channels[i]?.delayOut ?? 0) > 0 ? "ring-1 ring-sky-500/45" : "ring-1 ring-sky-500/30")}`}
                                    onButtonMouseEnter={getLinkHoverProps("delayOut", i).onMouseEnter}
                                    onButtonMouseLeave={getLinkHoverProps("delayOut", i).onMouseLeave}
                                    onButtonFocus={getLinkHoverProps("delayOut", i).onFocus}
                                    onButtonBlur={getLinkHoverProps("delayOut", i).onBlur}
                                    onSet={(ms) => setDelayOut(mac, i, ms)}
                                  />
                                </div>
                                {(() => {
                                  const inverted = channelParams?.channels[i]?.invertedOut;
                                  const canClick = inverted !== undefined;
                                  return (
                                    <button
                                      type="button"
                                      disabled={!canClick}
                                      {...getLinkHoverProps("polarityOut", i)}
                                      onClick={() => canClick && void invertPolarityOut(mac, i, !inverted)}
                                      className={`flex h-12 w-16 shrink-0 flex-col items-center justify-center rounded border px-1 py-0.5 select-none transition-colors disabled:pointer-events-none disabled:opacity-50 ${
                                        inverted === true
                                          ? "border-destructive/65 bg-destructive/15 text-destructive hover:bg-destructive/20"
                                          : inverted === false
                                            ? "border-border/50 bg-muted/20 text-foreground/80 hover:border-destructive/45 hover:text-destructive"
                                            : "border-border/30 bg-muted/10 text-muted-foreground/40"
                                      } ${linkedHoverClass("polarityOut", i, inverted === false ? "border-destructive/40 text-destructive/80" : "")}`}
                                    >
                                      {inverted === true ? (
                                        <CircleSlash className="w-5 h-5" />
                                      ) : inverted === false ? (
                                        <Circle className="w-5 h-5" />
                                      ) : (
                                        <span className="font-mono text-[13px] font-semibold">~</span>
                                      )}
                                      <span className="text-[9px] leading-none text-muted-foreground mt-0.5">Pol</span>
                                    </button>
                                  );
                                })()}
                                <div className="w-16 shrink-0">
                                  <PowerModePill
                                    mode={channelParams?.channels[i]?.powerMode}
                                    channelLabel={
                                      channelParams?.channels[i]?.outputName ?? `Out${channelLabels[i] ?? i + 1}`
                                    }
                                    triggerClassName="!h-12 text-[13px]"
                                    onConfirm={(mode) => setPowerModeOut(mac, i, mode)}
                                  />
                                </div>
                                {(() => {
                                  const ng = channelParams?.channels[i]?.noiseGateOut;
                                  const canClick = ng !== undefined;
                                  return (
                                    <button
                                      type="button"
                                      disabled={!canClick}
                                      {...getLinkHoverProps("noiseGateOut", i)}
                                      onClick={() => canClick && void noiseGateOut(mac, i, !ng)}
                                      className={`flex h-12 w-16 shrink-0 flex-col items-center justify-center rounded border px-1 py-0.5 select-none transition-colors disabled:pointer-events-none disabled:opacity-50 ${
                                        ng === true
                                          ? "border-sky-500/65 bg-sky-500/15 text-sky-700 dark:text-sky-300"
                                          : ng === false
                                            ? "border-border/50 bg-muted/20 text-foreground/80 hover:border-sky-500/45 hover:text-sky-700 dark:hover:text-sky-300"
                                            : "border-border/30 bg-muted/10 text-muted-foreground/40"
                                      } ${linkedHoverClass("noiseGateOut", i, ng === false ? "border-sky-500/40 text-sky-400/70" : "")}`}
                                    >
                                      <span className="font-mono text-[13px] font-semibold tabular-nums leading-none">
                                        {ng === true ? "ON" : ng === false ? "OFF" : "~"}
                                      </span>
                                      <span className="text-[9px] leading-none text-muted-foreground mt-0.5">Gate</span>
                                    </button>
                                  );
                                })()}
                                {(() => {
                                  const muted = channelParams?.channels[i]?.muteOut;
                                  const canClick = muted !== undefined;
                                  return (
                                    <button
                                      type="button"
                                      disabled={!canClick}
                                      {...getLinkHoverProps("muteOut", i)}
                                      onClick={() => canClick && void muteOut(mac, i, !muted)}
                                      className={`flex h-12 w-16 shrink-0 flex-col items-center justify-center rounded border px-1 py-0.5 select-none transition-colors disabled:pointer-events-none disabled:opacity-50 ${
                                        muted === true
                                          ? "border-destructive/65 bg-destructive/15 text-destructive hover:bg-destructive/20"
                                          : muted === false
                                            ? "border-border/50 bg-muted/20 text-foreground/80 hover:border-destructive/45 hover:text-destructive"
                                            : "border-border/30 bg-muted/10 text-muted-foreground/40"
                                      } ${linkedHoverClass("muteOut", i, muted === false ? "border-destructive/40 text-destructive/70" : "")}`}
                                    >
                                      {muted === true ? (
                                        <VolumeX className="w-5 h-5" />
                                      ) : muted === false ? (
                                        <Volume1 className="w-5 h-5" />
                                      ) : (
                                        <span className="font-mono text-[13px] font-semibold">~</span>
                                      )}
                                      <span className="text-[9px] leading-none text-muted-foreground mt-0.5">Mute</span>
                                    </button>
                                  );
                                })()}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center flex-wrap text-[10px] text-muted-foreground mt-1">
              <span className="text-muted-foreground">
                PSU
                <span
                  className={`font-semibold tabular-nums font-mono ml-1 ${(hb.temperatures[4] ?? 0) > 80 ? "text-red-500" : ""}`}
                >
                  {f0(hb.temperatures[4] ?? 0)}
                </span>
                <span className="text-[10px] ml-0.5">°C</span>
              </span>
            </div>
          </div>
        </section>
      </div>

      <ConfirmActionDialog
        open={bridgeConfirmOpen}
        onOpenChange={handleBridgeDialogOpen}
        title={dict.dialogs.heartbeat.changeBridgeModeTitle}
        description={
          pendingBridgePair !== null && pendingBridgeNext !== null
            ? dict.dialogs.heartbeat.changeBridgeModeDescription
                .replace(
                  "{state}",
                  pendingBridgeNext ? dict.dialogs.limiterDetails.on : dict.dialogs.limiterDetails.off
                )
                .replace("{pairA}", channelLabels[pendingBridgePair * 2] ?? String(pendingBridgePair * 2 + 1))
                .replace("{pairB}", channelLabels[pendingBridgePair * 2 + 1] ?? String(pendingBridgePair * 2 + 2))
            : dict.dialogs.heartbeat.changeBridgeModeFallback
        }
        confirmLabel={bridgeBusy ? dict.dialogs.heartbeat.applying : dict.dialogs.heartbeat.applyBridgeChange}
        confirmDisabled={bridgeBusy || pendingBridgePair === null || pendingBridgeNext === null}
        onConfirm={handleConfirmBridge}
      />
    </TooltipProvider>
  );
}
