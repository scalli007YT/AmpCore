/**
 * heartbeat-smoother.ts
 *
 * Two-stage smoothing pipeline for HeartbeatData:
 *
 *  Stage 1 — Median (window=5) on all sensor arrays.
 *             Kills single-frame spikes before they reach the UI.
 *             Applied to: temperatures, outputImpedance,
 *             inputVoltages, limiters, fanVoltage.
 *
 *  Stage 2 — Attack/release EMA on VU-meter channels (outputDbu, inputDbfs).
 *             Ticked every rAF frame (~16 ms) for 60 fps bar animation.
 *             attack τ = 20 ms  (instant peak grab)
 *             release τ = 300 ms (smooth fall-off)
 */

import { RollingMedianFilter } from "@/lib/generic";
import type { HeartbeatData } from "@/stores/AmpStore";

// ─── Tuning ─────────────────────────────────────────────────────────────────

const WINDOW_SIZE = 5; // median window (odd → clean median)
const VU_ATTACK_MS = 20; // τ rising
const VU_RELEASE_MS = 300; // τ falling
const VU_OUTPUT_TARGET_FOLLOW_MS = 45; // output-only target easing to avoid staircase jitter
const VU_FLOOR = -100; // below this → treat as silent (null)
const VU_MIN_DT_MS = 1;
const VU_MAX_DT_MS = 80;

// ─── Helpers ────────────────────────────────────────────────────────────────

/** EMA step: move `from` toward `to` with time-constant `tau` over `dt` ms. */
function ema(from: number, to: number, tau: number, dt: number): number {
  return from + (to - from) * (1 - Math.exp(-dt / tau));
}

// ─── Stage 1: Median smoother ────────────────────────────────────────────────

class ChannelWindow {
  private median = new RollingMedianFilter(WINDOW_SIZE);

  push(value: number | null | undefined): number | null {
    return this.median.push(value);
  }

  reset(): void {
    this.median.reset();
  }
}

const channels = (n: number) => Array.from({ length: n }, () => new ChannelWindow());

interface SensorWindows {
  temperatures: ChannelWindow[];
  outputImpedance: ChannelWindow[];
  inputVoltages: ChannelWindow[];
  limiters: ChannelWindow[];
  outputStates: ChannelWindow[];
  fanVoltage: ChannelWindow;
}

function makeWindows(): SensorWindows {
  return {
    temperatures: channels(5),
    outputImpedance: [],
    inputVoltages: [],
    limiters: [],
    outputStates: [],
    fanVoltage: new ChannelWindow()
  };
}

function ensureWindowCount(current: ChannelWindow[], count: number): ChannelWindow[] {
  if (current.length === count) return current;
  return channels(count);
}

class MedianSmoother {
  private w = makeWindows();

  smooth(raw: HeartbeatData, maxDb: number): HeartbeatData {
    const { w } = this;
    w.outputImpedance = ensureWindowCount(w.outputImpedance, raw.outputImpedance.length);
    w.inputVoltages = ensureWindowCount(w.inputVoltages, raw.inputVoltages.length);
    w.limiters = ensureWindowCount(w.limiters, raw.limiters.length);
    w.outputStates = ensureWindowCount(w.outputStates, raw.outputStates.length);
    const arr = (wins: ChannelWindow[], vals: number[]) => wins.map((win, i) => win.push(vals[i]) ?? vals[i]);

    const outputVoltages = raw.outputVoltages;
    const outputStates = arr(w.outputStates, raw.outputStates).map((v) => Math.round(v));

    // Derive output dB target directly from live output voltages; Stage 2 EMA
    // provides the visual smoothing for meter motion.
    const outputDbu = outputVoltages.map((v) => (v > 0 ? Math.log10(v) * 20 - maxDb : -100));

    return {
      // Discrete / state — pass through unchanged
      outputStates,
      inputStates: raw.inputStates,
      machineMode: raw.machineMode,
      receivedAt: raw.receivedAt,

      // Smoothed numerics
      temperatures: arr(w.temperatures, raw.temperatures),
      outputVoltages,
      outputCurrents: raw.outputCurrents,
      outputImpedance: arr(w.outputImpedance, raw.outputImpedance),
      inputVoltages: arr(w.inputVoltages, raw.inputVoltages),
      limiters: arr(w.limiters, raw.limiters),
      fanVoltage: w.fanVoltage.push(raw.fanVoltage) ?? raw.fanVoltage,

      // outputDbu recomputed from live voltages for smoother VU targeting
      outputDbu,
      inputDbfs: raw.inputDbfs
    };
  }

  reset(): void {
    this.w = makeWindows();
  }
}

// ─── Stage 2: VU EMA smoother ────────────────────────────────────────────────

class VuChannel {
  private current: number | null = null;
  private target: number | null = null;
  private smoothedTarget: number | null = null;

  constructor(private readonly targetFollowMs = 0) {}

  setTarget(value: number | null): void {
    this.target = value != null && value > VU_FLOOR ? value : null;
    if (this.target === null) {
      this.smoothedTarget = null;
    } else if (this.smoothedTarget === null) {
      this.smoothedTarget = this.target;
    }
  }

  tick(dt: number): number | null {
    const clampedDt = Math.max(VU_MIN_DT_MS, Math.min(VU_MAX_DT_MS, dt));
    const { target } = this;

    if (target !== null && this.targetFollowMs > 0) {
      this.smoothedTarget =
        this.smoothedTarget === null ? target : ema(this.smoothedTarget, target, this.targetFollowMs, clampedDt);
    } else {
      this.smoothedTarget = target;
    }

    const t = this.smoothedTarget;

    if (t === null) {
      if (this.current === null) return null;
      this.current = ema(this.current, VU_FLOOR, VU_RELEASE_MS, clampedDt);
      if (this.current <= VU_FLOOR + 0.5) {
        this.current = null;
        return null;
      }
      return this.current;
    }

    if (this.current === null) {
      this.current = t;
      return t;
    }

    const tau = t >= this.current ? VU_ATTACK_MS : VU_RELEASE_MS;
    this.current = ema(this.current, t, tau, clampedDt);
    return this.current;
  }

  reset(): void {
    this.current = null;
    this.target = null;
    this.smoothedTarget = null;
  }
}

export interface VuState {
  outputDbu: (number | null)[];
  inputDbfs: (number | null)[];
}

class VuSmoother {
  private out: VuChannel[] = [];
  private ins: VuChannel[] = [];

  private ensureLength(kind: "out" | "ins", count: number): VuChannel[] {
    const current = kind === "out" ? this.out : this.ins;
    if (current.length === count) return current;
    const next = Array.from(
      { length: count },
      (_, index) => current[index] ?? new VuChannel(kind === "out" ? VU_OUTPUT_TARGET_FOLLOW_MS : 0)
    );
    if (kind === "out") this.out = next;
    else this.ins = next;
    return next;
  }

  setTargets(outDbu: number[], inDbfs: (number | null)[]): void {
    this.ensureLength("out", outDbu.length).forEach((ch, i) => ch.setTarget(outDbu[i]));
    this.ensureLength("ins", inDbfs.length).forEach((ch, i) => ch.setTarget(inDbfs[i]));
  }

  tick(dt: number): VuState {
    return {
      outputDbu: this.out.map((ch) => ch.tick(dt)),
      inputDbfs: this.ins.map((ch) => ch.tick(dt))
    };
  }

  reset(): void {
    [...this.out, ...this.ins].forEach((ch) => ch.reset());
  }
}

// ─── Registry ────────────────────────────────────────────────────────────────
// One smoother pair per amp MAC, created on demand.

interface SmootherPair {
  median: MedianSmoother;
  vu: VuSmoother;
}

const registry = new Map<string, SmootherPair>();

function getPair(mac: string): SmootherPair {
  const key = mac.toUpperCase();
  let pair = registry.get(key);
  if (!pair) registry.set(key, (pair = { median: new MedianSmoother(), vu: new VuSmoother() }));
  return pair;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Run a raw heartbeat through Stage 1 (median) and update Stage 2 VU targets.
 * Returns the median-smoothed HeartbeatData for the store.
 * `maxDb` = 20*log10(ratedRmsV) for this device, matching the original app's
 * relative output meter scale where 0 dB means rated/max RMS output.
 * Call on every incoming heartbeat.
 */
export function smoothHeartbeat(mac: string, raw: HeartbeatData, maxDb: number): HeartbeatData {
  const { median, vu } = getPair(mac);
  const smoothed = median.smooth(raw, maxDb);
  vu.setTargets(smoothed.outputDbu, smoothed.inputDbfs);
  return smoothed;
}

/**
 * Advance the VU envelope by `dt` ms (pass rAF elapsed time).
 * Returns animated bar values. Call every animation frame.
 */
export function tickVuMeters(mac: string, dt: number): VuState {
  return getPair(mac).vu.tick(dt);
}

/**
 * Reset both stages for a MAC (call on amp reconnect to flush stale history).
 */
export function resetSmootherForMac(mac: string): void {
  const pair = registry.get(mac.toUpperCase());
  if (pair) {
    pair.median.reset();
    pair.vu.reset();
  }
}
