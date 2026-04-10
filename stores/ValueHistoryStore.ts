import type { HeartbeatData } from "@/stores/AmpStore";

// ---------------------------------------------------------------------------
// Tuning
// ---------------------------------------------------------------------------

/**
 * Number of heartbeat samples retained per amp.
 * At ~140 ms per sample → ~42 s window.
 */
const MAX_SAMPLES = 300;

/**
 * Temperature history — sub-sampled at 1 Hz, 20-minute window.
 * 20 min × 60 s = 1 200 points.
 */
const TEMP_SAMPLE_INTERVAL_MS = 1_000;
const TEMP_MAX_SAMPLES = 1_200;

// ---------------------------------------------------------------------------
// Data shape — lightweight snapshot, only fields needed for graphs
// ---------------------------------------------------------------------------

export interface HeartbeatSample {
  /** Unix ms timestamp — used as X axis */
  t: number;
  temperatures: number[];
  outputVoltages: number[];
  outputCurrents: number[];
  outputImpedance: number[];
  inputVoltages: number[];
  /** Raw limiter values — negate for dB reduction display */
  limiters: number[];
  fanVoltage: number;
}

export interface TempSample {
  t: number;
  temperatures: number[];
}

// ---------------------------------------------------------------------------
// Plain module — no Zustand, zero reactive overhead.
// GraphsPanel polls via setInterval; nothing subscribes reactively.
// ---------------------------------------------------------------------------

const _buffers: Record<string, HeartbeatSample[]> = {};
const _tempBuffers: Record<string, TempSample[]> = {};
const _tempLastPushed: Record<string, number> = {};

function extractSample(hb: HeartbeatData): HeartbeatSample {
  return {
    t: hb.receivedAt,
    temperatures: hb.temperatures,
    outputVoltages: hb.outputVoltages,
    outputCurrents: hb.outputCurrents,
    outputImpedance: hb.outputImpedance,
    inputVoltages: hb.inputVoltages,
    limiters: hb.limiters,
    fanVoltage: hb.fanVoltage
  };
}

/** Append a heartbeat sample for the given MAC address. */
export function pushValueHistory(mac: string, hb: HeartbeatData): void {
  const buf = _buffers[mac] ?? (_buffers[mac] = []);
  buf.push(extractSample(hb));
  if (buf.length > MAX_SAMPLES) {
    buf.shift();
  }

  // Sub-sampled temperature history at 1 Hz
  const now = hb.receivedAt;
  const last = _tempLastPushed[mac] ?? 0;
  if (now - last >= TEMP_SAMPLE_INTERVAL_MS) {
    _tempLastPushed[mac] = now;
    const tbuf = _tempBuffers[mac] ?? (_tempBuffers[mac] = []);
    tbuf.push({ t: now, temperatures: hb.temperatures });
    if (tbuf.length > TEMP_MAX_SAMPLES) tbuf.shift();
  }
}

/**
 * Read the current sample buffer for a MAC.
 * Returns a stable mutable reference — callers that need a snapshot should copy it.
 */
export function getValueHistory(mac: string): HeartbeatSample[] {
  return _buffers[mac] ?? [];
}

/** Read the 20-minute temperature history for a MAC. */
export function getTempHistory(mac: string): TempSample[] {
  return _tempBuffers[mac] ?? [];
}

/** Drop all history for a single amp (e.g. on offline event). */
export function clearValueHistory(mac: string): void {
  delete _buffers[mac];
  delete _tempBuffers[mac];
  delete _tempLastPushed[mac];
}

/** Drop history for all amps. */
export function clearAllValueHistory(): void {
  for (const key of Object.keys(_buffers)) {
    delete _buffers[key];
  }
  for (const key of Object.keys(_tempBuffers)) {
    delete _tempBuffers[key];
  }
  for (const key of Object.keys(_tempLastPushed)) {
    delete _tempLastPushed[key];
  }
}
