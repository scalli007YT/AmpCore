"use client";

import { useMemo } from "react";
import { toast } from "sonner";
import { ampActionRequestSchema } from "@/lib/validation/amp-actions";
import {
  MATRIX_GAIN_MAX_DB,
  MATRIX_GAIN_MIN_DB,
  OUTPUT_VOLUME_MAX_DB,
  OUTPUT_VOLUME_MIN_DB,
  OUTPUT_TRIM_MAX_DB,
  OUTPUT_TRIM_MIN_DB,
  DELAY_MIN_MS,
  DELAY_IN_MAX_MS,
  DELAY_OUT_MAX_MS,
  CROSSOVER_FREQ_MIN_HZ,
  CROSSOVER_FREQ_MAX_HZ,
  EQ_BAND_GAIN_MIN_DB,
  EQ_BAND_GAIN_MAX_DB,
  EQ_BAND_Q_MIN,
  EQ_BAND_Q_MAX,
  RMS_LIMITER_THRESHOLD_MIN_VRMS,
  RMS_LIMITER_ATTACK_MAX_MS,
  RMS_LIMITER_RELEASE_MAX_MULTIPLIER,
  PEAK_LIMITER_THRESHOLD_MIN_VP,
  PEAK_LIMITER_HOLD_MAX_MS,
  PEAK_LIMITER_RELEASE_MAX_MS,
  CHANNEL_NAME_MAX_LENGTH
} from "@/lib/constants";
import { getLinkedChannels, type LinkScope } from "@/lib/amp-action-linking";
import { useAmpStore } from "@/stores/AmpStore";
import { rmsToPeakVoltage } from "@/lib/generic";
import { getStoredAmpLinkConfig, useAmpActionLinkStore } from "@/stores/AmpActionLinkStore";
import type { EqBand } from "@/stores/AmpStore";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Channel = number;
type BridgePair = number;
type SourceType = 0 | 1 | 2;
type SourceFamily = 0 | 1 | 2;
type BackupVariant = "dual" | "triple";
type CrossoverTarget = "input" | "output";
type CrossoverKind = "hp" | "lp";
type ActionValue = boolean | number | string;

type RmsLimiterParams = {
  attackMs: number;
  releaseMultiplier: number;
  thresholdVrms: number;
};

type PeakLimiterParams = {
  holdMs: number;
  releaseMs: number;
  thresholdVp: number;
};

interface AmpActionsHook {
  setAmpLock: (mac: string, locked: boolean) => Promise<void>;
  setAmpStandby: (mac: string, standby: boolean) => Promise<void>;
  setBridgePair: (mac: string, pair: BridgePair, bridged: boolean) => Promise<void>;
  muteIn: (mac: string, channel: Channel, muted: boolean) => Promise<void>;
  setVolumeOut: (mac: string, channel: Channel, db: number) => Promise<void>;
  muteOut: (mac: string, channel: Channel, muted: boolean) => Promise<void>;
  setDelayIn: (mac: string, channel: Channel, ms: number) => Promise<void>;
  setDelayOut: (mac: string, channel: Channel, ms: number) => Promise<void>;
  setTrimOut: (mac: string, channel: Channel, db: number) => Promise<void>;
  setPowerModeOut: (mac: string, channel: Channel, mode: number) => Promise<void>;
  setCrossoverEnabled: (
    mac: string,
    channel: Channel,
    target: CrossoverTarget,
    kind: CrossoverKind,
    enabled: boolean,
    filterType: number
  ) => Promise<void>;
  setCrossoverFreq: (
    mac: string,
    channel: Channel,
    target: CrossoverTarget,
    kind: CrossoverKind,
    hz: number
  ) => Promise<void>;
  applyEqBlock: (mac: string, channel: Channel, target: CrossoverTarget, bands: EqBand[]) => Promise<void>;
  setEqBandType: (
    mac: string,
    channel: Channel,
    target: CrossoverTarget,
    band: number,
    type: number,
    bypass: boolean
  ) => Promise<void>;
  setEqBandFreq: (mac: string, channel: Channel, target: CrossoverTarget, band: number, hz: number) => Promise<void>;
  setEqBandGain: (mac: string, channel: Channel, target: CrossoverTarget, band: number, db: number) => Promise<void>;
  setEqBandQ: (mac: string, channel: Channel, target: CrossoverTarget, band: number, q: number) => Promise<void>;
  invertPolarityOut: (mac: string, channel: Channel, inverted: boolean) => Promise<void>;
  noiseGateOut: (mac: string, channel: Channel, enabled: boolean) => Promise<void>;
  renameInput: (mac: string, channel: Channel, name: string) => Promise<void>;
  renameOutput: (mac: string, channel: Channel, name: string) => Promise<void>;
  rmsLimiterOut: (mac: string, channel: Channel, enabled: boolean, params?: RmsLimiterParams) => Promise<void>;
  setRmsLimiterAttack: (
    mac: string,
    channel: Channel,
    attackMs: number,
    config: RmsLimiterParams & { enabled: boolean }
  ) => Promise<void>;
  setRmsLimiterReleaseMultiplier: (
    mac: string,
    channel: Channel,
    releaseMultiplier: number,
    config: RmsLimiterParams & { enabled: boolean }
  ) => Promise<void>;
  setRmsLimiterThreshold: (
    mac: string,
    channel: Channel,
    thresholdVrms: number,
    config: RmsLimiterParams & { enabled: boolean }
  ) => Promise<void>;
  peakLimiterOut: (mac: string, channel: Channel, enabled: boolean, params?: PeakLimiterParams) => Promise<void>;
  setPeakLimiterHold: (
    mac: string,
    channel: Channel,
    holdMs: number,
    config: PeakLimiterParams & { enabled: boolean }
  ) => Promise<void>;
  setPeakLimiterRelease: (
    mac: string,
    channel: Channel,
    releaseMs: number,
    config: PeakLimiterParams & { enabled: boolean }
  ) => Promise<void>;
  setPeakLimiterThreshold: (
    mac: string,
    channel: Channel,
    thresholdVp: number,
    config: PeakLimiterParams & { enabled: boolean }
  ) => Promise<void>;
  /** Set crosspoint gain (dB) for a matrix cell. */
  setMatrixGain: (mac: string, channel: Channel, source: Channel, gainDb: number) => Promise<void>;
  /** Toggle a matrix crosspoint on/off. */
  setMatrixActive: (mac: string, channel: Channel, source: Channel, active: boolean) => Promise<void>;
  setSourceType: (mac: string, channel: Channel, sourceType: SourceType) => Promise<void>;
  setSourceDelay: (
    mac: string,
    channel: Channel,
    source: SourceFamily,
    delayMs: number,
    trimDb: number
  ) => Promise<void>;
  setSourceTrim: (
    mac: string,
    channel: Channel,
    source: SourceFamily,
    trimDb: number,
    delayMs: number
  ) => Promise<void>;
  setBackupConfig: (
    mac: string,
    channel: Channel,
    enabled: boolean,
    variant: BackupVariant,
    priority1: SourceFamily,
    threshold: number,
    priority2?: SourceFamily
  ) => Promise<void>;
  setAnalogType: (mac: string, channel: Channel, analogType: number) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Command dispatcher — no reactive state, uses .getState() at call time.
// Wrapped in useMemo to keep stable references for consumers.
// ---------------------------------------------------------------------------

export function useAmpActions(): AmpActionsHook {
  return useMemo(() => createAmpActions(), []);
}

/** Returns the rated RMS voltage for a given mac, or undefined if unknown. */
function getRatedRmsV(mac: string) {
  return useAmpStore.getState().amps.find((a) => a.mac === mac)?.ratedRmsV;
}

function getLinkedTargets(mac: string, channel: Channel, scope: LinkScope) {
  const config = getStoredAmpLinkConfig(useAmpActionLinkStore.getState().byMac, mac);
  return getLinkedChannels(config, scope, channel);
}

/** Send a POST to /api/amp-actions. UI updates from polled amp state. */
async function send(
  mac: string,
  action: string,
  channel: Channel,
  value: ActionValue,
  extra?: Record<string, unknown>,
  opts?: { suppressToast?: boolean; throwOnError?: boolean }
) {
  try {
    const res = await fetch("/api/amp-actions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mac, action, channel, value, ...extra })
    });

    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
      };
      throw new Error(data.error ?? `HTTP ${res.status}`);
    }
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!opts?.suppressToast) {
      toast.error(`Command failed: ${msg}`);
    }
    if (opts?.throwOnError) {
      throw err instanceof Error ? err : new Error(msg);
    }
    return false;
  }
}

async function runLinked(
  mac: string,
  channel: Channel,
  scope: LinkScope,
  task: (targetChannel: Channel) => Promise<boolean>
) {
  const targets = getLinkedTargets(mac, channel, scope);
  const results = await Promise.allSettled(targets.map((targetChannel) => task(targetChannel)));
  const failedCount = results.filter((result) => result.status === "rejected" || result.value !== true).length;

  if (failedCount > 0) {
    const linkedCount = targets.length;
    const firstRejected = results.find((result) => result.status === "rejected");
    const reason =
      firstRejected?.status === "rejected"
        ? firstRejected.reason instanceof Error
          ? firstRejected.reason.message
          : String(firstRejected.reason)
        : null;
    const baseMessage =
      linkedCount > 1
        ? `Linked command partially failed (${linkedCount - failedCount}/${linkedCount})`
        : "Command failed";
    toast.error(reason ? `${baseMessage}: ${reason}` : baseMessage);
  }
}

async function sendLinked(
  mac: string,
  action: string,
  channel: Channel,
  value: ActionValue,
  scope: LinkScope,
  extra?: Record<string, unknown>
) {
  await runLinked(mac, channel, scope, (targetChannel) =>
    send(mac, action, targetChannel, value, extra, { suppressToast: true, throwOnError: true })
  );
}

function createAmpActions(): AmpActionsHook {
  const setAmpLock = async (mac: string, locked: boolean) => {
    await send(mac, "setAmpLock", 0, locked, undefined, { throwOnError: true });
  };

  const setAmpStandby = async (mac: string, standby: boolean) => {
    const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
    await send(mac, "setAmpStandby", 0, standby, undefined, { suppressToast: true, throwOnError: false });
    await delay(80);
    await send(mac, "setAmpStandby", 0, standby, undefined, { suppressToast: true, throwOnError: false });
    await delay(80);
    await send(mac, "setAmpStandby", 0, standby, undefined, { throwOnError: true });
    // Optimistically update standby state in the store — FC=15 polling was removed,
    // so the store would never update otherwise. The command confirmed acceptance above.
    useAmpStore.getState().updateAmpStatus(mac, { standby });
  };

  const setBridgePair = async (mac: string, pair: BridgePair, bridged: boolean) => {
    await send(mac, "bridgePair", pair, bridged);
  };

  const muteIn = async (mac: string, channel: Channel, muted: boolean) => {
    await sendLinked(mac, "muteIn", channel, muted, "muteIn");
  };

  const setVolumeOut = async (mac: string, channel: Channel, db: number) => {
    const clamped = Math.max(OUTPUT_VOLUME_MIN_DB, Math.min(OUTPUT_VOLUME_MAX_DB, db));
    const payload = { mac, action: "volumeOut" as const, channel, value: clamped };
    const parsed = ampActionRequestSchema.safeParse(payload);
    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message ?? "Invalid volumeOut payload";
      toast.error(message);
      throw new Error(message);
    }
    await sendLinked(mac, "volumeOut", channel, clamped, "volumeOut");
  };

  const muteOut = async (mac: string, channel: Channel, muted: boolean) => {
    await sendLinked(mac, "muteOut", channel, muted, "muteOut");
  };

  const invertPolarityOut = async (mac: string, channel: Channel, inverted: boolean) => {
    await sendLinked(mac, "invertPolarityOut", channel, inverted, "polarityOut");
  };

  const noiseGateOut = async (mac: string, channel: Channel, enabled: boolean) => {
    await sendLinked(mac, "noiseGateOut", channel, enabled, "noiseGateOut");
  };

  const rmsLimiterOut = async (mac: string, channel: Channel, enabled: boolean, params?: RmsLimiterParams) => {
    await sendLinked(mac, "rmsLimiterOut", channel, enabled, "limiters", params);
  };

  const setRmsLimiterAttack = async (
    mac: string,
    channel: Channel,
    attackMs: number,
    config: RmsLimiterParams & { enabled: boolean }
  ) => {
    const clampedAttack = Math.max(0, Math.min(RMS_LIMITER_ATTACK_MAX_MS, attackMs));
    await sendLinked(mac, "rmsLimiterOut", channel, config.enabled, "limiters", {
      attackMs: clampedAttack,
      releaseMultiplier: config.releaseMultiplier,
      thresholdVrms: config.thresholdVrms
    });
  };

  const setRmsLimiterReleaseMultiplier = async (
    mac: string,
    channel: Channel,
    releaseMultiplier: number,
    config: RmsLimiterParams & { enabled: boolean }
  ) => {
    const clamped = Math.max(0, Math.min(RMS_LIMITER_RELEASE_MAX_MULTIPLIER, releaseMultiplier));
    await sendLinked(mac, "rmsLimiterOut", channel, config.enabled, "limiters", {
      attackMs: config.attackMs,
      releaseMultiplier: clamped,
      thresholdVrms: config.thresholdVrms
    });
  };

  const setRmsLimiterThreshold = async (
    mac: string,
    channel: Channel,
    thresholdVrms: number,
    config: RmsLimiterParams & { enabled: boolean }
  ) => {
    const maxVrms = getRatedRmsV(mac);
    const clamped =
      maxVrms != null
        ? Math.max(RMS_LIMITER_THRESHOLD_MIN_VRMS, Math.min(maxVrms, thresholdVrms))
        : Math.max(RMS_LIMITER_THRESHOLD_MIN_VRMS, thresholdVrms);
    await sendLinked(mac, "rmsLimiterOut", channel, config.enabled, "limiters", {
      attackMs: config.attackMs,
      releaseMultiplier: config.releaseMultiplier,
      thresholdVrms: clamped
    });
  };

  const peakLimiterOut = async (mac: string, channel: Channel, enabled: boolean, params?: PeakLimiterParams) => {
    await sendLinked(mac, "peakLimiterOut", channel, enabled, "limiters", params);
  };

  const setPeakLimiterHold = async (
    mac: string,
    channel: Channel,
    holdMs: number,
    config: PeakLimiterParams & { enabled: boolean }
  ) => {
    const clamped = Math.max(0, Math.min(PEAK_LIMITER_HOLD_MAX_MS, holdMs));
    await sendLinked(mac, "peakLimiterOut", channel, config.enabled, "limiters", {
      holdMs: clamped,
      releaseMs: config.releaseMs,
      thresholdVp: config.thresholdVp
    });
  };

  const setPeakLimiterRelease = async (
    mac: string,
    channel: Channel,
    releaseMs: number,
    config: PeakLimiterParams & { enabled: boolean }
  ) => {
    const clamped = Math.max(0, Math.min(PEAK_LIMITER_RELEASE_MAX_MS, releaseMs));
    await sendLinked(mac, "peakLimiterOut", channel, config.enabled, "limiters", {
      holdMs: config.holdMs,
      releaseMs: clamped,
      thresholdVp: config.thresholdVp
    });
  };

  const setPeakLimiterThreshold = async (
    mac: string,
    channel: Channel,
    thresholdVp: number,
    config: PeakLimiterParams & { enabled: boolean }
  ) => {
    const maxVp = rmsToPeakVoltage(getRatedRmsV(mac));
    const clamped =
      maxVp != null
        ? Math.max(PEAK_LIMITER_THRESHOLD_MIN_VP, Math.min(maxVp, thresholdVp))
        : Math.max(PEAK_LIMITER_THRESHOLD_MIN_VP, thresholdVp);
    await sendLinked(mac, "peakLimiterOut", channel, config.enabled, "limiters", {
      holdMs: config.holdMs,
      releaseMs: config.releaseMs,
      thresholdVp: clamped
    });
  };

  const setMatrixGain = async (mac: string, channel: Channel, source: Channel, gainDb: number) => {
    const clampedGainDb = Math.max(MATRIX_GAIN_MIN_DB, Math.min(MATRIX_GAIN_MAX_DB, gainDb));
    await send(mac, "matrixGain", channel, clampedGainDb, { source });
  };

  const setMatrixActive = async (mac: string, channel: Channel, source: Channel, active: boolean) => {
    await send(mac, "matrixActive", channel, active, { source });
  };

  const setSourceType = async (mac: string, channel: Channel, sourceType: SourceType) => {
    await send(mac, "sourceType", channel, sourceType, undefined, { throwOnError: true });
  };

  const setSourceDelay = async (
    mac: string,
    channel: Channel,
    source: SourceFamily,
    delayMs: number,
    trimDb: number
  ) => {
    const payload = { mac, action: "sourceDelay" as const, channel, value: delayMs, source, trim: trimDb };
    const parsed = ampActionRequestSchema.safeParse(payload);
    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message ?? "Invalid sourceDelay payload";
      toast.error(message);
      throw new Error(message);
    }
    await send(mac, "sourceDelay", channel, delayMs, { source, trim: trimDb }, { throwOnError: true });
  };

  const setSourceTrim = async (
    mac: string,
    channel: Channel,
    source: SourceFamily,
    trimDb: number,
    delayMs: number
  ) => {
    const payload = { mac, action: "sourceTrim" as const, channel, value: trimDb, source, delay: delayMs };
    const parsed = ampActionRequestSchema.safeParse(payload);
    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message ?? "Invalid sourceTrim payload";
      toast.error(message);
      throw new Error(message);
    }
    await send(mac, "sourceTrim", channel, trimDb, { source, delay: delayMs }, { throwOnError: true });
  };

  const setBackupConfig = async (
    mac: string,
    channel: Channel,
    enabled: boolean,
    variant: BackupVariant,
    priority1: SourceFamily,
    threshold: number,
    priority2?: SourceFamily
  ) => {
    const payload = {
      mac,
      action: "backupConfig" as const,
      channel,
      value: enabled,
      variant,
      priority1,
      priority2,
      threshold
    };
    const parsed = ampActionRequestSchema.safeParse(payload);
    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message ?? "Invalid backupConfig payload";
      toast.error(message);
      throw new Error(message);
    }
    await send(
      mac,
      "backupConfig",
      channel,
      enabled,
      { variant, priority1, priority2, threshold },
      { throwOnError: true }
    );
  };

  const setAnalogType = async (mac: string, channel: Channel, analogType: number) => {
    await send(mac, "analogType", channel, analogType, undefined, { throwOnError: true });
  };

  const setDelayIn = async (mac: string, channel: Channel, ms: number) => {
    const clamped = Math.max(DELAY_MIN_MS, Math.min(DELAY_IN_MAX_MS, ms));
    await send(mac, "delayIn", channel, clamped);
  };

  const setDelayOut = async (mac: string, channel: Channel, ms: number) => {
    const clamped = Math.max(DELAY_MIN_MS, Math.min(DELAY_OUT_MAX_MS, ms));
    await sendLinked(mac, "delayOut", channel, clamped, "delayOut");
  };

  const setTrimOut = async (mac: string, channel: Channel, db: number) => {
    const clamped = Math.max(OUTPUT_TRIM_MIN_DB, Math.min(OUTPUT_TRIM_MAX_DB, db));
    await sendLinked(mac, "outputTrim", channel, clamped, "trimOut");
  };

  const setPowerModeOut = async (mac: string, channel: Channel, mode: number) => {
    const normalized = Number.isInteger(mode) ? mode : 0;
    const clamped = Math.max(0, Math.min(2, normalized));
    await send(mac, "powerModeOut", channel, clamped);
  };

  const setCrossoverEnabled = async (
    mac: string,
    channel: Channel,
    target: CrossoverTarget,
    kind: CrossoverKind,
    enabled: boolean,
    filterType: number
  ) => {
    await sendLinked(mac, "crossoverEnabled", channel, enabled, target === "input" ? "inputEq" : "outputEq", {
      target,
      kind,
      filterType
    });
  };

  const setCrossoverFreq = async (
    mac: string,
    channel: Channel,
    target: CrossoverTarget,
    kind: CrossoverKind,
    hz: number
  ) => {
    const clamped = Math.max(CROSSOVER_FREQ_MIN_HZ, Math.min(CROSSOVER_FREQ_MAX_HZ, hz));
    await sendLinked(mac, "crossoverFreq", channel, clamped, target === "input" ? "inputEq" : "outputEq", {
      target,
      kind
    });
  };

  const setEqBandType = async (
    mac: string,
    channel: Channel,
    target: CrossoverTarget,
    band: number,
    type: number,
    bypass: boolean
  ) => {
    await sendLinked(mac, "eqBandType", channel, type, target === "input" ? "inputEq" : "outputEq", {
      target,
      band,
      bypass
    });
  };

  const applyEqBlock = async (mac: string, channel: Channel, target: CrossoverTarget, bands: EqBand[]) => {
    if (bands.length !== 10) {
      toast.error("EQ job must contain exactly 10 bands");
      return;
    }

    const normalizedBands = bands.map((band, idx) => {
      const isHpLp = idx === 0 || idx === 9;
      const clampedType = Number.isInteger(band.type) ? Math.max(0, Math.min(10, band.type)) : 0;
      const clampedFreq = Math.max(CROSSOVER_FREQ_MIN_HZ, Math.min(CROSSOVER_FREQ_MAX_HZ, band.freq));
      const clampedGain = Math.max(EQ_BAND_GAIN_MIN_DB, Math.min(EQ_BAND_GAIN_MAX_DB, band.gain));
      const clampedQ = Math.max(EQ_BAND_Q_MIN, Math.min(EQ_BAND_Q_MAX, band.q));

      return {
        type: clampedType,
        freq: clampedFreq,
        gain: isHpLp ? 0 : clampedGain,
        q: isHpLp ? 0.7 : clampedQ,
        bypass: Boolean(band.bypass)
      };
    });

    await sendLinked(mac, "eqBlock", channel, 0, target === "input" ? "inputEq" : "outputEq", {
      target,
      bands: normalizedBands
    });
  };

  const setEqBandFreq = async (mac: string, channel: Channel, target: CrossoverTarget, band: number, hz: number) => {
    const clamped = Math.max(CROSSOVER_FREQ_MIN_HZ, Math.min(CROSSOVER_FREQ_MAX_HZ, hz));
    await sendLinked(mac, "eqBandFreq", channel, clamped, target === "input" ? "inputEq" : "outputEq", {
      target,
      band
    });
  };

  const setEqBandGain = async (mac: string, channel: Channel, target: CrossoverTarget, band: number, db: number) => {
    const clamped = Math.max(EQ_BAND_GAIN_MIN_DB, Math.min(EQ_BAND_GAIN_MAX_DB, db));
    await sendLinked(mac, "eqBandGain", channel, clamped, target === "input" ? "inputEq" : "outputEq", {
      target,
      band
    });
  };

  const setEqBandQ = async (mac: string, channel: Channel, target: CrossoverTarget, band: number, q: number) => {
    const clamped = Math.max(EQ_BAND_Q_MIN, Math.min(EQ_BAND_Q_MAX, q));
    await sendLinked(mac, "eqBandQ", channel, clamped, target === "input" ? "inputEq" : "outputEq", {
      target,
      band
    });
  };

  const renameInput = async (mac: string, channel: Channel, name: string) => {
    const trimmed = name.trim().slice(0, CHANNEL_NAME_MAX_LENGTH);
    if (!trimmed) return;
    await send(mac, "renameInput", channel, trimmed);
  };

  const renameOutput = async (mac: string, channel: Channel, name: string) => {
    const trimmed = name.trim().slice(0, CHANNEL_NAME_MAX_LENGTH);
    if (!trimmed) return;
    await send(mac, "renameOutput", channel, trimmed);
  };

  return {
    setAmpLock,
    setAmpStandby,
    setBridgePair,
    muteIn,
    setVolumeOut,
    muteOut,
    invertPolarityOut,
    noiseGateOut,
    rmsLimiterOut,
    peakLimiterOut,
    setRmsLimiterAttack,
    setRmsLimiterReleaseMultiplier,
    setRmsLimiterThreshold,
    setPeakLimiterHold,
    setPeakLimiterRelease,
    setPeakLimiterThreshold,
    setMatrixGain,
    setMatrixActive,
    setSourceType,
    setSourceDelay,
    setSourceTrim,
    setBackupConfig,
    setAnalogType,
    setDelayIn,
    setDelayOut,
    setTrimOut,
    setPowerModeOut,
    setCrossoverEnabled,
    setCrossoverFreq,
    applyEqBlock,
    setEqBandType,
    setEqBandFreq,
    setEqBandGain,
    setEqBandQ,
    renameInput,
    renameOutput
  };
}
