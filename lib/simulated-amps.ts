import type { AmpActionRequest } from "@/lib/validation/amp-actions";
import type { AmpBasicInfo, BridgeReadback, HeartbeatData } from "@/stores/AmpStore";
import { isSimulatedMac as isKnownSimulatedMac } from "@/lib/simulated-amp-identity";

const DEFAULT_CHANNEL_COUNT = 4;
const FC27_BYTES_PER_CHANNEL = 515;
const FC27_TRAILER_SIZE = 180;
const EQ_BAND_COUNT = 10;

type EqTarget = "input" | "output";
type CrossoverKind = "hp" | "lp";

interface SimulatedEqBand {
  type: number;
  gain: number;
  freq: number;
  q: number;
  bypass: boolean;
}

interface SimulatedLimiterRms {
  enabled: boolean;
  attackMs: number;
  releaseMultiplier: number;
  thresholdVrms: number;
}

interface SimulatedLimiterPeak {
  enabled: boolean;
  holdMs: number;
  releaseMs: number;
  thresholdVp: number;
}

interface SimulatedSourceFamily {
  trim: number;
  delay: number;
}

interface SimulatedMatrixSource {
  gain: number;
  active: boolean;
}

interface SimulatedAmpDefinition {
  mac: string;
  ip: string;
  name: string;
  version: string;
  identifier: string;
  ratedRmsV: number;
  baseTemperatureC: number;
  outputChannels: number;
  analogInputs: number;
  digitalInputs: number;
}

interface SimulatedChannelState {
  volumeOut: number;
  trimOut: number;
  delayIn: number;
  delayOut: number;
  muteIn: boolean;
  muteOut: boolean;
  noiseGateOut: boolean;
  invertedOut: boolean;
  powerMode: number;
  sourceTypeCode: number;
  analogInputIndex: number;
  sourceFamilies: [SimulatedSourceFamily, SimulatedSourceFamily, SimulatedSourceFamily];
  matrix: SimulatedMatrixSource[];
  rmsLimiter: SimulatedLimiterRms;
  peakLimiter: SimulatedLimiterPeak;
  eqIn: SimulatedEqBand[];
  eqOut: SimulatedEqBand[];
}

interface SimulatedAmpState {
  startedAtMs: number;
  channels: SimulatedChannelState[];
  bridgePairs: boolean[];
}

export interface SimulatedScanDevice {
  ip: string;
  mac: string;
  name: string;
  deviceVersion: string;
  identifier: string;
  runtime: string;
}

interface SimulatedHeartbeatEvent {
  ip: string;
  mac: string;
  name: string;
  version: string;
  heartbeat: HeartbeatData;
  bridgePairs: BridgeReadback[];
}

interface SimulatedDiscoveryEvent {
  ip: string;
  mac: string;
  name: string;
  version: string;
  basicInfo: AmpBasicInfo;
}

const SIMULATED_AMPS: SimulatedAmpDefinition[] = [
  {
    mac: "10:02:00:00:00:01",
    ip: "172.31.100.2",
    name: "DSP-1002",
    version: "DSP-1002",
    identifier: "SIM-DSP-1002",
    ratedRmsV: 89.4,
    baseTemperatureC: 34,
    outputChannels: 2,
    analogInputs: 2,
    digitalInputs: 0
  },
  {
    mac: "10:04:00:00:00:01",
    ip: "172.31.100.4",
    name: "DSP-1004",
    version: "DSP-1004",
    identifier: "SIM-DSP-1004",
    ratedRmsV: 89.4,
    baseTemperatureC: 35,
    outputChannels: 4,
    analogInputs: 4,
    digitalInputs: 0
  },
  {
    mac: "11:02:00:00:00:01",
    ip: "172.31.110.2",
    name: "DSP-1002D",
    version: "DSP-1002D",
    identifier: "SIM-DSP-1002D",
    ratedRmsV: 89.4,
    baseTemperatureC: 35,
    outputChannels: 2,
    analogInputs: 2,
    digitalInputs: 2
  },
  {
    mac: "11:04:00:00:00:01",
    ip: "172.31.110.4",
    name: "DSP-1004D",
    version: "DSP-1004D",
    identifier: "SIM-DSP-1004D",
    ratedRmsV: 89.4,
    baseTemperatureC: 36,
    outputChannels: 4,
    analogInputs: 4,
    digitalInputs: 4
  }
];

const stateByMac = new Map<string, SimulatedAmpState>();

function normalizeMac(mac: string): string {
  return mac.trim().toUpperCase();
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function toRuntimeLabel(minutes: number): string {
  const safeMinutes = Math.max(0, Math.floor(minutes));
  const hours = Math.floor(safeMinutes / 60);
  const remMinutes = safeMinutes % 60;
  return `${hours}h-${remMinutes}min`;
}

function writeAscii(buffer: Buffer, offset: number, length: number, value: string): void {
  const text = Buffer.from(value, "ascii").subarray(0, length);
  text.copy(buffer, offset);
}

function createDefaultEqBand(idx: number): SimulatedEqBand {
  if (idx === 0) {
    return { type: 4, gain: 0, freq: 80, q: 0.71, bypass: false };
  }
  if (idx === 9) {
    return { type: 4, gain: 0, freq: 18000, q: 0.71, bypass: false };
  }
  return { type: 0, gain: 0, freq: 1000, q: 1, bypass: false };
}

function createDefaultChannelState(channelCount: number, channelIndex: number): SimulatedChannelState {
  return {
    volumeOut: -9,
    trimOut: -9,
    delayIn: 0,
    delayOut: 0,
    muteIn: false,
    muteOut: false,
    noiseGateOut: false,
    invertedOut: false,
    powerMode: 0,
    sourceTypeCode: 0,
    analogInputIndex: channelIndex,
    sourceFamilies: [
      { trim: 0, delay: 0 },
      { trim: 0, delay: 0 },
      { trim: 0, delay: 0 }
    ],
    matrix: Array.from({ length: channelCount }, (_, src) => ({
      gain: src === channelIndex ? 0 : -80,
      active: src === channelIndex
    })),
    rmsLimiter: {
      enabled: false,
      attackMs: 20,
      releaseMultiplier: 4,
      thresholdVrms: 40
    },
    peakLimiter: {
      enabled: false,
      holdMs: 15,
      releaseMs: 120,
      thresholdVp: 60
    },
    eqIn: Array.from({ length: EQ_BAND_COUNT }, (_, idx) => createDefaultEqBand(idx)),
    eqOut: Array.from({ length: EQ_BAND_COUNT }, (_, idx) => createDefaultEqBand(idx))
  };
}

function getDefinitionByMac(mac: string): SimulatedAmpDefinition | undefined {
  const normalized = normalizeMac(mac);
  return SIMULATED_AMPS.find((amp) => normalizeMac(amp.mac) === normalized);
}

function getState(mac: string): SimulatedAmpState | undefined {
  const definition = getDefinitionByMac(mac);
  if (!definition) return undefined;

  const normalized = normalizeMac(definition.mac);
  let state = stateByMac.get(normalized);
  if (!state) {
    const channelCount = definition.outputChannels || DEFAULT_CHANNEL_COUNT;
    const bridgePairCount = Math.max(1, Math.ceil(channelCount / 2));
    state = {
      startedAtMs: Date.now(),
      channels: Array.from({ length: channelCount }, (_, idx) => createDefaultChannelState(channelCount, idx)),
      bridgePairs: Array.from({ length: bridgePairCount }, () => false)
    };
    stateByMac.set(normalized, state);
  }

  return state;
}

function toBasicInfo(definition: SimulatedAmpDefinition): AmpBasicInfo {
  return {
    Gain_max: 80,
    Analog_signal_Input_chx: definition.analogInputs,
    Digital_signal_input_chx: definition.digitalInputs,
    Output_chx: definition.outputChannels,
    Machine_state: 0
  };
}

function getRuntimeMinutesInternal(mac: string): number | null {
  const state = getState(mac);
  if (!state) return null;
  return Math.max(0, Math.floor((Date.now() - state.startedAtMs) / 60000));
}

function getBridgePairs(state: SimulatedAmpState): BridgeReadback[] {
  return state.bridgePairs.map((bridged, idx) => ({
    pair: idx,
    raw: bridged ? 0 : 1,
    bridged
  }));
}

function getEqBank(channel: SimulatedChannelState, target: EqTarget): SimulatedEqBand[] {
  return target === "input" ? channel.eqIn : channel.eqOut;
}

function getCrossoverBandIndex(kind: CrossoverKind): number {
  return kind === "hp" ? 0 : 9;
}

function buildHeartbeat(definition: SimulatedAmpDefinition, state: SimulatedAmpState): HeartbeatData {
  const now = Date.now();
  const t = now / 1000;
  const channelCount = state.channels.length;
  const temperatures = Array.from({ length: 5 }, (_, idx) => {
    const wave = Math.sin(t / 7 + idx * 0.8) * 1.4;
    return Math.round((definition.baseTemperatureC + idx * 0.7 + wave) * 10) / 10;
  });

  const outputVoltages = state.channels.map((channel, idx) => {
    if (channel.muteOut) return 0;
    const level = clamp(1 + channel.volumeOut / 40, 0, 1);
    const motion = 0.75 + 0.15 * Math.sin(t * 1.8 + idx);
    return Math.max(0, definition.ratedRmsV * level * motion);
  });

  const outputCurrents = outputVoltages.map((voltage, idx) => {
    if (state.channels[idx]?.muteOut) return 0;
    if (voltage <= 0) return 0;
    const nominalOhms = 8;
    return voltage / nominalOhms;
  });

  const outputImpedance = outputVoltages.map((voltage, idx) => {
    const current = outputCurrents[idx] ?? 0;
    if (current <= 0) return 0;
    return voltage / current;
  });

  const outputDbu = outputVoltages.map((voltage) => {
    if (voltage <= 0) return -100;
    return 20 * Math.log10(voltage / definition.ratedRmsV);
  });

  const inputVoltages = state.channels.map((channel, idx) => {
    if (channel.muteIn) return 0;
    const motion = 0.2 + 0.08 * Math.sin(t * 1.2 + idx * 0.7);
    return Math.max(0, motion);
  });

  const inputDbfs = inputVoltages.map((voltage) => {
    if (voltage <= 0) return null;
    return 20 * Math.log10(voltage);
  });

  return {
    temperatures,
    outputVoltages,
    outputCurrents,
    outputImpedance,
    outputDbu,
    outputStates: Array.from({ length: channelCount }, () => 0),
    inputVoltages,
    inputDbfs,
    limiters: state.channels.map((channel) => (channel.rmsLimiter.enabled || channel.peakLimiter.enabled ? -2 : 0)),
    inputStates: Array.from({ length: channelCount }, () => 0),
    fanVoltage: 30 + Math.round((5 + 3 * Math.sin(t / 5)) * 10) / 10,
    machineMode: 0,
    receivedAt: now
  };
}

export function isSimulatedMac(mac: string): boolean {
  return isKnownSimulatedMac(mac) && getDefinitionByMac(mac) !== undefined;
}

export function getSimulatedRuntimeMinutes(mac: string): number | null {
  return getRuntimeMinutesInternal(mac);
}

export function getSimulatedScanDevices(): SimulatedScanDevice[] {
  return SIMULATED_AMPS.map((definition) => {
    const runtimeMinutes = getRuntimeMinutesInternal(definition.mac) ?? 0;
    return {
      ip: definition.ip,
      mac: definition.mac,
      name: definition.name,
      deviceVersion: definition.version,
      identifier: definition.identifier,
      runtime: toRuntimeLabel(runtimeMinutes)
    };
  });
}

export function getSimulatedDiscoveryEvents(): SimulatedDiscoveryEvent[] {
  return SIMULATED_AMPS.map((definition) => ({
    ip: definition.ip,
    mac: definition.mac,
    name: definition.name,
    version: definition.version,
    basicInfo: toBasicInfo(definition)
  }));
}

export function getSimulatedHeartbeatEvents(): SimulatedHeartbeatEvent[] {
  return SIMULATED_AMPS.flatMap((definition) => {
    const state = getState(definition.mac);
    if (!state) return [];

    return [
      {
        ip: definition.ip,
        mac: definition.mac,
        name: definition.name,
        version: definition.version,
        heartbeat: buildHeartbeat(definition, state),
        bridgePairs: getBridgePairs(state)
      }
    ];
  });
}

export function buildSimulatedFc27Hex(mac: string): string | null {
  const definition = getDefinitionByMac(mac);
  const state = getState(mac);
  if (!definition || !state) return null;

  const channelCount = definition.outputChannels || DEFAULT_CHANNEL_COUNT;
  const trailerBase = channelCount * FC27_BYTES_PER_CHANNEL;
  const buffer = Buffer.alloc(trailerBase + FC27_TRAILER_SIZE, 0);

  for (let ch = 0; ch < channelCount; ch++) {
    const base = ch * FC27_BYTES_PER_CHANNEL;
    const channel = state.channels[ch] ?? createDefaultChannelState(channelCount, ch);

    for (let src = 0; src < channelCount; src++) {
      const matrixOffset = base + 60 + src * 5;
      const source = channel.matrix[src] ?? { gain: -80, active: false };
      buffer.writeFloatLE(source.gain, matrixOffset);
      buffer.writeUInt8(source.active ? 1 : 0, matrixOffset + 4);
    }

    buffer.writeFloatLE(channel.sourceFamilies[0].trim, base + 36);
    buffer.writeFloatLE(channel.sourceFamilies[0].delay, base + 40);
    buffer.writeFloatLE(channel.sourceFamilies[1].trim, base + 44);
    buffer.writeFloatLE(channel.sourceFamilies[1].delay, base + 48);
    buffer.writeFloatLE(channel.sourceFamilies[2].trim, base + 52);
    buffer.writeFloatLE(channel.sourceFamilies[2].delay, base + 56);

    buffer.writeFloatLE(channel.trimOut, base + 80);
    buffer.writeUInt8(channel.muteOut ? 0 : 1, base + 84);
    buffer.writeUInt8(channel.sourceTypeCode & 0xff, base + 85);
    buffer.writeFloatLE(channel.delayIn, base + 86);
    buffer.writeFloatLE(channel.delayOut, base + 90);
    buffer.writeUInt8(channel.invertedOut ? 1 : 0, base + 94);

    buffer.writeUInt16LE(Math.round(channel.rmsLimiter.attackMs), base + 95);
    buffer.writeUInt8(Math.round(channel.rmsLimiter.releaseMultiplier), base + 97);
    buffer.writeFloatLE(channel.rmsLimiter.thresholdVrms, base + 98);
    buffer.writeUInt8(channel.rmsLimiter.enabled ? 0 : 1, base + 102);

    buffer.writeUInt16LE(Math.round(channel.peakLimiter.holdMs), base + 108);
    buffer.writeUInt16LE(Math.round(channel.peakLimiter.releaseMs), base + 110);
    buffer.writeFloatLE(channel.peakLimiter.thresholdVp, base + 112);
    buffer.writeUInt8(channel.peakLimiter.enabled ? 0 : 1, base + 116);

    buffer.writeInt8(0, base + 117);

    for (let band = 0; band < EQ_BAND_COUNT; band++) {
      const inBand = channel.eqIn[band] ?? createDefaultEqBand(band);
      const inOffset = base + 121 + band * 14;
      const inType = inBand.bypass ? 255 - inBand.type : inBand.type;
      buffer.writeUInt8(inType & 0xff, inOffset);
      buffer.writeFloatLE(inBand.gain, inOffset + 1);
      buffer.writeFloatLE(inBand.freq, inOffset + 5);
      buffer.writeFloatLE(inBand.q, inOffset + 9);
      buffer.writeUInt8(inBand.bypass ? 1 : 0, inOffset + 13);

      const outBand = channel.eqOut[band] ?? createDefaultEqBand(band);
      const outOffset = base + 262 + band * 14;
      const outType = outBand.bypass ? 255 - outBand.type : outBand.type;
      buffer.writeUInt8(outType & 0xff, outOffset);
      buffer.writeFloatLE(outBand.gain, outOffset + 1);
      buffer.writeFloatLE(outBand.freq, outOffset + 5);
      buffer.writeFloatLE(outBand.q, outOffset + 9);
      buffer.writeUInt8(outBand.bypass ? 1 : 0, outOffset + 13);
    }

    buffer.writeUInt8(channel.powerMode & 0xff, base + 403);
    buffer.writeFloatLE(channel.volumeOut, base + 405);
    buffer.writeUInt8(channel.noiseGateOut ? 0 : 1, base + 409);

    writeAscii(buffer, base + 413, 16, `AIn${ch + 1}`);
    writeAscii(buffer, base + 430, 16, `Out${String.fromCharCode(65 + ch)}`);

    buffer.writeUInt8(channel.muteIn ? 0 : 1, trailerBase + 132 + ch);
    buffer.writeUInt8(channel.analogInputIndex & 0xff, trailerBase + 136 + ch);
  }

  return buffer.toString("hex");
}

export function applySimulatedAction(mac: string, body: AmpActionRequest): boolean {
  const definition = getDefinitionByMac(mac);
  const state = getState(mac);
  if (!definition || !state) return false;

  const channel = Number.isInteger(body.channel) ? body.channel : -1;
  const channelState = channel >= 0 && channel < state.channels.length ? state.channels[channel] : null;

  switch (body.action) {
    case "muteIn":
      if (channelState) channelState.muteIn = Boolean(body.value);
      return true;

    case "muteOut":
      if (channelState) channelState.muteOut = Boolean(body.value);
      return true;

    case "volumeOut":
    case "volumeIn":
      if (channelState) channelState.volumeOut = clamp(body.value, -80, 12);
      return true;

    case "outputTrim":
      if (channelState) channelState.trimOut = clamp(body.value, -80, 12);
      return true;

    case "delayIn":
      if (channelState) channelState.delayIn = clamp(body.value, 0, 340);
      return true;

    case "delayOut":
      if (channelState) channelState.delayOut = clamp(body.value, 0, 682);
      return true;

    case "invertPolarityOut":
      if (channelState) channelState.invertedOut = Boolean(body.value);
      return true;

    case "noiseGateOut":
      if (channelState) channelState.noiseGateOut = Boolean(body.value);
      return true;

    case "powerModeOut":
      if (channelState) channelState.powerMode = clamp(Math.round(body.value), 0, 2);
      return true;

    case "sourceType":
      if (channelState) channelState.sourceTypeCode = clamp(Math.round(body.value), 0, 2);
      return true;

    case "sourceDelay":
      if (channelState) {
        const family = clamp(Math.round(body.source), 0, 2);
        channelState.sourceFamilies[family].delay = clamp(body.value, 0, 10);
        channelState.sourceFamilies[family].trim = clamp(body.trim, 0, 18);
      }
      return true;

    case "sourceTrim":
      if (channelState) {
        const family = clamp(Math.round(body.source), 0, 2);
        channelState.sourceFamilies[family].trim = clamp(body.value, 0, 18);
        channelState.sourceFamilies[family].delay = clamp(body.delay, 0, 10);
      }
      return true;

    case "analogType":
      if (channelState) {
        const maxAnalog = Math.max(1, definition.analogInputs);
        channelState.analogInputIndex = clamp(Math.round(body.value), 0, maxAnalog - 1);
      }
      return true;

    case "bridgePair":
      if (body.channel >= 0 && body.channel < state.bridgePairs.length) {
        state.bridgePairs[body.channel] = Boolean(body.value);
      }
      return true;

    case "matrixGain":
      if (channelState) {
        const source = Math.round(body.source);
        if (source >= 0 && source < channelState.matrix.length) {
          channelState.matrix[source].gain = clamp(body.value, -80, 12);
          channelState.matrix[source].active = true;
        }
      }
      return true;

    case "matrixActive":
      if (channelState) {
        const source = Math.round(body.source);
        if (source >= 0 && source < channelState.matrix.length) {
          channelState.matrix[source].active = Boolean(body.value);
        }
      }
      return true;

    case "rmsLimiterOut":
      if (channelState) {
        channelState.rmsLimiter.enabled = Boolean(body.value);
        if (typeof body.attackMs === "number") channelState.rmsLimiter.attackMs = clamp(body.attackMs, 0, 1000);
        if (typeof body.releaseMultiplier === "number") {
          channelState.rmsLimiter.releaseMultiplier = clamp(Math.round(body.releaseMultiplier), 0, 255);
        }
        if (typeof body.thresholdVrms === "number") {
          channelState.rmsLimiter.thresholdVrms = clamp(body.thresholdVrms, 0.01, 1000);
        }
      }
      return true;

    case "peakLimiterOut":
      if (channelState) {
        channelState.peakLimiter.enabled = Boolean(body.value);
        if (typeof body.holdMs === "number") channelState.peakLimiter.holdMs = clamp(body.holdMs, 0, 1000);
        if (typeof body.releaseMs === "number") channelState.peakLimiter.releaseMs = clamp(body.releaseMs, 0, 5000);
        if (typeof body.thresholdVp === "number")
          channelState.peakLimiter.thresholdVp = clamp(body.thresholdVp, 0.01, 2000);
      }
      return true;

    case "crossoverEnabled":
      if (channelState) {
        const band = getEqBank(channelState, body.target)[getCrossoverBandIndex(body.kind)];
        if (band) {
          band.bypass = !body.value;
          band.type = clamp(Math.round(body.filterType), 0, 10);
        }
      }
      return true;

    case "crossoverFreq":
      if (channelState) {
        const band = getEqBank(channelState, body.target)[getCrossoverBandIndex(body.kind)];
        if (band) band.freq = clamp(body.value, 20, 22000);
      }
      return true;

    case "eqBandType":
      if (channelState) {
        const bank = getEqBank(channelState, body.target);
        const bandIndex = body.band;
        const band = bank[bandIndex];
        if (band) {
          band.type = clamp(Math.round(body.value), 0, 10);
          band.bypass = body.bypass;
        }
      }
      return true;

    case "eqBandFreq":
      if (channelState) {
        const band = getEqBank(channelState, body.target)[body.band];
        if (band) band.freq = clamp(body.value, 20, 22000);
      }
      return true;

    case "eqBandGain":
      if (channelState) {
        const band = getEqBank(channelState, body.target)[body.band];
        if (band) band.gain = clamp(body.value, -30, 15);
      }
      return true;

    case "eqBandQ":
      if (channelState) {
        const band = getEqBank(channelState, body.target)[body.band];
        if (band) band.q = clamp(body.value, 0.1, 128);
      }
      return true;

    case "eqBlock":
      if (channelState) {
        const bank = getEqBank(channelState, body.target);
        for (let i = 0; i < Math.min(body.bands.length, bank.length); i++) {
          const next = body.bands[i];
          bank[i] = {
            type: clamp(Math.round(next.type), 0, 10),
            gain: clamp(next.gain, -30, 15),
            freq: clamp(next.freq, 20, 22000),
            q: clamp(next.q, 0.1, 128),
            bypass: Boolean(next.bypass)
          };
        }
      }
      return true;

    case "renameAmp":
      definition.name = body.value.trim();
      return true;

    default:
      return true;
  }
}
