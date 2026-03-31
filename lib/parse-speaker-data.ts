/**
 * FC=57 (SPEAKER_DATA / chx_output_data_copy_code) response parser.
 *
 * The device returns a fixed-length binary blob that is identified by its
 * byte length. All field offsets and sizes are reverse-engineered from the
 * original WPF C# structs (SpeakerData_116/117/Phonic/Tecnare/YCST.cs).
 *
 * Variant sizes (from QuanJu.cs constants):
 *   YCST    = 157
 *   115     = 2216
 *   116     = 2252
 *   Phonic  = 2294
 *   117     = 2310
 *   Tecnare = 2415  (= 117 + 105-byte DEQ block)
 */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type SpeakerVariant = "ycst" | "115" | "116" | "phonic" | "117" | "tecnare" | "unknown";

export interface SpeakerEqBand {
  /** Filter type code. 255 = band bypassed. See EQ_FILTER_TYPE_NAMES in parse-channel-data.ts */
  type: number;
  gainDb: number;
  freqHz: number;
  q: number;
  /** True when type===255 or band reset flag is set */
  bypassed: boolean;
}

export interface SpeakerRmsLimiter {
  attackMs: number;
  releaseMultiplier: number;
  /** Threshold in Vrms — same storage format as FC=27 thresholdVrms */
  thresholdVrms: number;
  bypassed: boolean;
  /** auto=true when the auto field byte == 0 (active-low in original firmware) */
  autoMode: boolean;
}

export interface SpeakerPeakLimiter {
  holdMs: number;
  decayMs: number;
  /** Threshold in Vp — same storage format as FC=27 thresholdVp */
  thresholdVp: number;
  bypassed: boolean;
}

export interface SpeakerFir {
  /** 32-byte ASCII name stored on device. Empty string for the 115 variant (no name field). */
  name: string;
  /** 512 float32 FIR coefficients */
  coefficients: number[];
  /** true = FIR filter is bypassed (disabled) */
  bypassed: boolean;
}

export interface ParsedSpeakerData {
  variant: SpeakerVariant;
  byteLength: number;
  /** 32-byte device name string */
  deviceName: string;
  /** 16-byte speaker preset label. Empty string for variants that don't carry one (115/116/Phonic). */
  speakerName: string;
  /** null only for YCST (no FIR hardware) and unknown variants */
  fir: SpeakerFir | null;
  /** 7 bands for old variants (YCST/115/116), 10 bands for Phonic/117/Tecnare */
  eqBands: SpeakerEqBand[];
  eqBypassed: boolean;
  volumeDb: number;
  delayMs: number;
  /** true = polarity inverted */
  polarity: boolean;
  /** true = output muted */
  muteOut: boolean;
  /** Speaker load in Ω. null for YCST and 115 (not stored in those variants). */
  loadOhm: number | null;
  /** null for YCST (limiter not stored in that variant) */
  rmsLimiter: SpeakerRmsLimiter | null;
  /** null for YCST */
  peakLimiter: SpeakerPeakLimiter | null;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Read a null-terminated ASCII string from a fixed-width byte region. */
function readAscii(buf: Buffer, offset: number, maxLen: number): string {
  const slice = buf.slice(offset, offset + maxLen);
  const nullIdx = slice.indexOf(0);
  return (nullIdx === -1 ? slice : slice.slice(0, nullIdx)).toString("ascii").trim();
}

/**
 * Parse a single EQ filter_data band (14 bytes).
 *
 * Wire layout:
 *   +0  uint8   type  (255 = bypassed whole band)
 *   +1  float32 gain dB
 *   +5  float32 freq Hz
 *   +9  float32 Q
 *   +13 uint8   reset flag (ignored — not meaningful for reads)
 */
function readEqBand(buf: Buffer, offset: number): SpeakerEqBand {
  const type = buf.readUInt8(offset);
  const gainDb = buf.readFloatLE(offset + 1);
  const freqHz = buf.readFloatLE(offset + 5);
  const q = buf.readFloatLE(offset + 9);
  return { type, gainDb, freqHz, q, bypassed: type === 255 };
}

/**
 * Parse an out_filter_data block: 7 EQ bands × 14 bytes + 1 bypass byte = 99 bytes total.
 */
function readOutFilterData(buf: Buffer, offset: number): { bands: SpeakerEqBand[]; bypassed: boolean } {
  const bands: SpeakerEqBand[] = [];
  for (let i = 0; i < 7; i++) {
    bands.push(readEqBand(buf, offset + i * 14));
  }
  const bypassed = buf.readUInt8(offset + 98) !== 0;
  return { bands, bypassed };
}

/**
 * Parse an input_filter_data block: 10 EQ bands × 14 bytes + 1 bypass byte = 141 bytes total.
 */
function readInputFilterData(buf: Buffer, offset: number): { bands: SpeakerEqBand[]; bypassed: boolean } {
  const bands: SpeakerEqBand[] = [];
  for (let i = 0; i < 10; i++) {
    bands.push(readEqBand(buf, offset + i * 14));
  }
  const bypassed = buf.readUInt8(offset + 140) !== 0;
  return { bands, bypassed };
}

/**
 * Parse an RMS_Limiter_data block (13 bytes):
 *   +0  int16LE  attackMs
 *   +2  uint8    releaseMultiplier
 *   +3  float32  thresholdDbu
 *   +7  uint8    bypass  (1 = bypassed)
 *   +8  uint8    autoMode (0 = auto ON — active-low)
 *   +9  float32  current max (meter readback — ignored here)
 */
function readRmsLimiter(buf: Buffer, offset: number): SpeakerRmsLimiter {
  return {
    attackMs: buf.readInt16LE(offset),
    releaseMultiplier: buf.readUInt8(offset + 2),
    thresholdVrms: buf.readFloatLE(offset + 3),
    bypassed: buf.readUInt8(offset + 7) === 1,
    autoMode: buf.readUInt8(offset + 8) === 0
  };
}

/**
 * Parse a peak_Limiter_data block (13 bytes):
 *   +0  int16LE  holdMs
 *   +2  int16LE  decayMs
 *   +4  float32  thresholdDbu
 *   +8  uint8    bypass (1 = bypassed)
 *   +9  float32  current max (meter readback — ignored here)
 */
function readPeakLimiter(buf: Buffer, offset: number): SpeakerPeakLimiter {
  return {
    holdMs: buf.readInt16LE(offset),
    decayMs: buf.readInt16LE(offset + 2),
    thresholdVp: buf.readFloatLE(offset + 4),
    bypassed: buf.readUInt8(offset + 8) === 1
  };
}

/**
 * Parse a FIR_DATA block (2080 bytes):
 *   +0   byte[32]    name (ASCII, null-terminated)
 *   +32  float32[512] coefficients (little-endian)
 */
function readFirData(buf: Buffer, offset: number, bypassByte: number): SpeakerFir {
  const name = readAscii(buf, offset, 32);
  const coefficients: number[] = [];
  for (let i = 0; i < 512; i++) {
    coefficients.push(buf.readFloatLE(offset + 32 + i * 4));
  }
  return { name, coefficients, bypassed: bypassByte === 1 };
}

/**
 * Parse the 115-variant FIR — no name field, just 512 raw float32 taps.
 */
function readFir115(buf: Buffer, offset: number, bypassByte: number): SpeakerFir {
  const coefficients: number[] = [];
  for (let i = 0; i < 512; i++) {
    coefficients.push(buf.readFloatLE(offset + i * 4));
  }
  return { name: "", coefficients, bypassed: bypassByte === 1 };
}

// ---------------------------------------------------------------------------
// Variant parsers
// ---------------------------------------------------------------------------

/**
 * YCST — 157 bytes. No FIR, 7-band output EQ, no limiters.
 *
 * +0    32  deviceName
 * +32   99  out_filter_data (7-band EQ)
 * +131   4  vol_out  float32
 * +135   1  mute_out (0=muted)
 * +136   4  delay_out float32
 * +140   1  polarity (1=inverted)
 * +141  16  speakerName
 */
function parseYcst(buf: Buffer): ParsedSpeakerData {
  const eq = readOutFilterData(buf, 32);
  return {
    variant: "ycst",
    byteLength: buf.length,
    deviceName: readAscii(buf, 0, 32),
    speakerName: readAscii(buf, 141, 16),
    fir: null,
    eqBands: eq.bands,
    eqBypassed: eq.bypassed,
    volumeDb: buf.readFloatLE(131),
    delayMs: buf.readFloatLE(136),
    polarity: buf.readUInt8(140) === 1,
    muteOut: buf.readUInt8(135) === 0,
    loadOhm: null,
    rmsLimiter: null,
    peakLimiter: null
  };
}

/**
 * 115 — 2216 bytes. FIR taps only (no name), 7-band output EQ.
 *
 * +0      32  deviceName
 * +32   2048  FIR float[512] (no name)
 * +2080    1  fir_bypass
 * +2081   99  out_filter_data (7-band)
 * +2180    4  vol_out
 * +2184    4  delay_out
 * +2188    1  polarity
 * +2189   13  RMS_Limiter_data
 * +2202   13  peak_Limiter_data
 * +2215    1  mute_out (0=muted)
 */
function parse115(buf: Buffer): ParsedSpeakerData {
  const firBypass = buf.readUInt8(2080);
  const eq = readOutFilterData(buf, 2081);
  return {
    variant: "115",
    byteLength: buf.length,
    deviceName: readAscii(buf, 0, 32),
    speakerName: "",
    fir: readFir115(buf, 32, firBypass),
    eqBands: eq.bands,
    eqBypassed: eq.bypassed,
    volumeDb: buf.readFloatLE(2180),
    delayMs: buf.readFloatLE(2184),
    polarity: buf.readUInt8(2188) === 1,
    muteOut: buf.readUInt8(2215) === 0,
    loadOhm: null,
    rmsLimiter: readRmsLimiter(buf, 2189),
    peakLimiter: readPeakLimiter(buf, 2202)
  };
}

/**
 * 116 — 2252 bytes. FIR_DATA (name+taps), 7-band output EQ.
 *
 * +0      32  deviceName
 * +32   2080  FIR_DATA (name[32] + float[512])
 * +2112    1  fir_bypass
 * +2113   99  out_filter_data (7-band)
 * +2212    4  vol_out
 * +2216    4  delay_out
 * +2220    1  polarity
 * +2221   13  RMS_Limiter_data
 * +2234   13  peak_Limiter_data
 * +2247    1  mute_out (0=muted)
 * +2248    4  load_data float32
 */
function parse116(buf: Buffer): ParsedSpeakerData {
  const firBypass = buf.readUInt8(2112);
  const eq = readOutFilterData(buf, 2113);
  return {
    variant: "116",
    byteLength: buf.length,
    deviceName: readAscii(buf, 0, 32),
    speakerName: "",
    fir: readFirData(buf, 32, firBypass),
    eqBands: eq.bands,
    eqBypassed: eq.bypassed,
    volumeDb: buf.readFloatLE(2212),
    delayMs: buf.readFloatLE(2216),
    polarity: buf.readUInt8(2220) === 1,
    muteOut: buf.readUInt8(2247) === 0,
    loadOhm: buf.readFloatLE(2248),
    rmsLimiter: readRmsLimiter(buf, 2221),
    peakLimiter: readPeakLimiter(buf, 2234)
  };
}

/**
 * Phonic — 2294 bytes. FIR_DATA (name+taps), 10-band input_filter_data EQ.
 *
 * +0      32  deviceName
 * +32   2080  FIR_DATA
 * +2112    1  fir_bypass
 * +2113  141  input_filter_data (10-band)
 * +2254    4  vol_out
 * +2258    4  delay_out
 * +2262    1  polarity
 * +2263   13  RMS_Limiter_data
 * +2276   13  peak_Limiter_data
 * +2289    1  mute_out (0=muted)
 * +2290    4  load_data float32
 */
function parsePhonic(buf: Buffer): ParsedSpeakerData {
  const firBypass = buf.readUInt8(2112);
  const eq = readInputFilterData(buf, 2113);
  return {
    variant: "phonic",
    byteLength: buf.length,
    deviceName: readAscii(buf, 0, 32),
    speakerName: "",
    fir: readFirData(buf, 32, firBypass),
    eqBands: eq.bands,
    eqBypassed: eq.bypassed,
    volumeDb: buf.readFloatLE(2254),
    delayMs: buf.readFloatLE(2258),
    polarity: buf.readUInt8(2262) === 1,
    muteOut: buf.readUInt8(2289) === 0,
    loadOhm: buf.readFloatLE(2290),
    rmsLimiter: readRmsLimiter(buf, 2263),
    peakLimiter: readPeakLimiter(buf, 2276)
  };
}

/**
 * 117 — 2310 bytes. FIR_DATA (name+taps), 10-band input_filter_data EQ, speakerName.
 *
 * +0      32  deviceName
 * +32   2080  FIR_DATA
 * +2112    1  fir_bypass
 * +2113  141  input_filter_data (10-band)
 * +2254    4  vol_out
 * +2258    4  delay_out
 * +2262    1  polarity
 * +2263   13  RMS_Limiter_data
 * +2276   13  peak_Limiter_data
 * +2289    1  mute_out (0=muted)
 * +2290    4  load_data float32
 * +2294   16  SpeakerName
 */
function parse117(buf: Buffer): ParsedSpeakerData {
  const firBypass = buf.readUInt8(2112);
  const eq = readInputFilterData(buf, 2113);
  return {
    variant: "117",
    byteLength: buf.length,
    deviceName: readAscii(buf, 0, 32),
    speakerName: readAscii(buf, 2294, 16),
    fir: readFirData(buf, 32, firBypass),
    eqBands: eq.bands,
    eqBypassed: eq.bypassed,
    volumeDb: buf.readFloatLE(2254),
    delayMs: buf.readFloatLE(2258),
    polarity: buf.readUInt8(2262) === 1,
    muteOut: buf.readUInt8(2289) === 0,
    loadOhm: buf.readFloatLE(2290),
    rmsLimiter: readRmsLimiter(buf, 2263),
    peakLimiter: readPeakLimiter(buf, 2276)
  };
}

/**
 * Tecnare — 2415 bytes = 117 body (2310 B) + 105-byte DEQ block.
 * The first 2310 bytes are identical to the 117 struct.
 * The trailing 105 bytes are SynDEQ_Data — not currently parsed beyond detection.
 */
function parseTecnare(buf: Buffer): ParsedSpeakerData {
  const base = parse117(buf.slice(0, 2310) as Buffer);
  return { ...base, variant: "tecnare", byteLength: buf.length };
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/** Known variant lengths keyed by byte length. */
const VARIANT_BY_LENGTH: Record<number, (buf: Buffer) => ParsedSpeakerData> = {
  157: parseYcst,
  2216: parse115,
  2252: parse116,
  2294: parsePhonic,
  2310: parse117,
  2415: parseTecnare
};

/** Map from byte length to variant name — derived from the parser registry. */
const VARIANT_NAME_BY_LENGTH: Record<number, SpeakerVariant> = {
  157: "ycst",
  2216: "115",
  2252: "116",
  2294: "phonic",
  2310: "117",
  2415: "tecnare"
};

/**
 * Parse an FC=57 response body into structured speaker data.
 * Returns null when the body length doesn't match any known variant.
 */
export function parseSpeakerData(body: Buffer): ParsedSpeakerData | null {
  const parser = VARIANT_BY_LENGTH[body.length];
  if (!parser) return null;

  try {
    return parser(body);
  } catch {
    return null;
  }
}

/**
 * Determine the variant name from a body length without parsing.
 * Returns "unknown" for unrecognised lengths.
 */
export function detectSpeakerVariant(byteLength: number): SpeakerVariant {
  return VARIANT_NAME_BY_LENGTH[byteLength] ?? "unknown";
}
