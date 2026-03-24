/**
 * FIR (Finite Impulse Response) filter analysis utilities.
 *
 * Computes impulse response, frequency response (magnitude in dB),
 * and phase response from raw FIR filter coefficients using the
 * Discrete-Time Fourier Transform (DTFT).
 *
 * Reference: original C# FIRPage.xaml.cs setFIRFrequencyResponse / setFIRPhaseResponse
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const FIR_MAX_TAPS = 512;
export const FIR_SAMPLE_RATE = 48000;
export const FIR_NAME_MAX_BYTES = 32;

/** Display limits matching the original controller UI */
export const FIR_FREQ_MIN_HZ = 10;
export const FIR_FREQ_MAX_HZ = 20000;
export const FIR_MAGNITUDE_MIN_DB = -24;
export const FIR_MAGNITUDE_MAX_DB = 24;
export const FIR_PHASE_MIN_DEG = -180;
export const FIR_PHASE_MAX_DEG = 180;

/** Frequency ticks for grid lines on the log axis */
export const FIR_FREQ_TICKS = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];

/** dB grid lines */
export const FIR_DB_TICKS = [-24, -18, -12, -6, 0, 6, 12, 18, 24];

/** Phase grid lines (degrees) */
export const FIR_PHASE_TICKS = [-180, -120, -60, 0, 60, 120, 180];

// ---------------------------------------------------------------------------
// Channel labels for the A/B/C/D tabs
// ---------------------------------------------------------------------------

export const FIR_CHANNEL_LABELS = ["A", "B", "C", "D"] as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FirState {
  /** Filter coefficients (up to 512 floats) */
  coefficients: number[];
  /** Whether the FIR filter is bypassed (true = OFF) */
  bypassed: boolean;
  /** User-assigned filter name */
  name: string;
}

export interface FirFrequencyPoint {
  freq: number;
  magnitude: number; // dB
  phase: number; // degrees
}

export interface FirImpulsePoint {
  timeMs: number;
  amplitude: number;
}

// ---------------------------------------------------------------------------
// Analysis functions
// ---------------------------------------------------------------------------

/**
 * Compute the frequency and phase response of a FIR filter using DTFT.
 *
 * H(f) = Σ h[n] · exp(-j·2π·f·n / fs)
 *
 * Returns `numPoints` log-spaced samples between FIR_FREQ_MIN_HZ and FIR_FREQ_MAX_HZ.
 */
export function computeFirResponse(coefficients: number[], numPoints: number = 512): FirFrequencyPoint[] {
  if (coefficients.length === 0) {
    return Array.from({ length: numPoints }, (_, i) => {
      const t = i / (numPoints - 1);
      const freq = FIR_FREQ_MIN_HZ * Math.pow(FIR_FREQ_MAX_HZ / FIR_FREQ_MIN_HZ, t);
      return { freq, magnitude: 0, phase: 0 };
    });
  }

  const logMin = Math.log10(FIR_FREQ_MIN_HZ);
  const logMax = Math.log10(FIR_FREQ_MAX_HZ);
  const TWO_PI = 2 * Math.PI;
  const result: FirFrequencyPoint[] = [];

  for (let i = 0; i < numPoints; i++) {
    const t = i / (numPoints - 1);
    const freq = Math.pow(10, logMin + t * (logMax - logMin));
    const normalizedFreq = freq / FIR_SAMPLE_RATE;

    // DTFT: H(f) = Σ h[n] * exp(-j*2π*f*n)
    let realPart = 0;
    let imagPart = 0;

    for (let n = 0; n < coefficients.length; n++) {
      const angle = TWO_PI * normalizedFreq * n;
      realPart += coefficients[n] * Math.cos(angle);
      imagPart -= coefficients[n] * Math.sin(angle);
    }

    // Magnitude in dB: 20 * log10(|H(f)|)
    const magnitude_linear = Math.sqrt(realPart * realPart + imagPart * imagPart);
    const magnitude = magnitude_linear > 1e-20 ? 20 * Math.log10(magnitude_linear) : FIR_MAGNITUDE_MIN_DB;

    // Phase in degrees
    const phase = Math.atan2(imagPart, realPart) * (180 / Math.PI);

    result.push({ freq, magnitude, phase });
  }

  return result;
}

/**
 * Compute the impulse response (time-domain) representation.
 * Returns sample points with time in milliseconds.
 */
export function computeFirImpulseResponse(coefficients: number[]): FirImpulsePoint[] {
  return coefficients.map((amplitude, i) => ({
    timeMs: (i / FIR_SAMPLE_RATE) * 1000,
    amplitude
  }));
}

/**
 * Find the "time zero" — the sample index of the peak absolute coefficient,
 * converted to milliseconds. This represents the main delay/centre of the filter.
 *
 * Matches the original C# setFIRTimeZero logic.
 */
export function computeFirTimeZero(coefficients: number[]): {
  index: number;
  timeMs: number;
} {
  if (coefficients.length === 0) return { index: 0, timeMs: 0 };

  let maxAbsVal = 0;
  let maxIndex = 0;

  for (let i = 0; i < coefficients.length; i++) {
    const absVal = Math.abs(coefficients[i]);
    if (absVal > maxAbsVal) {
      maxAbsVal = absVal;
      maxIndex = i;
    }
  }

  // Convert sample index to ms at 48 kHz: index / 48 = ms
  const timeMs = Math.round((maxIndex / 48) * 1000) / 1000;
  return { index: maxIndex, timeMs };
}

/** Minimum tap count accepted by the original controller. */
export const FIR_MIN_TAPS = 128;

/**
 * Compute the effective filter order.
 * Matches the original C# FIRInfo.setFIRData which trims trailing zeros:
 *   Order = length - (trailing zeros count)
 */
export function getFirOrder(coefficients: number[]): number {
  let order = coefficients.length;
  while (order > 0 && coefficients[order - 1] === 0) {
    order--;
  }
  return order;
}

/**
 * Parse FIR coefficients from a text file (one coefficient per line).
 * Supports comma-separated or space-separated values (takes the last column).
 * Clamps to FIR_MAX_TAPS.
 */
export function parseFirFile(text: string): { coefficients: number[]; error?: string } {
  const lines = text.split(/\r?\n/);
  const coefficients: number[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line.length === 0) continue;

    let valueStr = line;

    // Handle space-separated: take the last token
    if (line.includes(" ")) {
      const parts = line.split(/\s+/);
      valueStr = parts[parts.length - 1];
    }
    // Handle comma-separated: take the value after the last comma
    else if (line.includes(",")) {
      const parts = line.split(",");
      valueStr = parts[parts.length - 1].trim();
    }

    const value = parseFloat(valueStr);
    if (!isNaN(value) && isFinite(value)) {
      coefficients.push(value);
    }

    if (coefficients.length >= FIR_MAX_TAPS) break;
  }

  if (coefficients.length < FIR_MIN_TAPS) {
    return {
      coefficients: [],
      error: `File contains ${coefficients.length} taps — minimum is ${FIR_MIN_TAPS}, maximum is ${FIR_MAX_TAPS}`
    };
  }

  return { coefficients };
}

/**
 * Export FIR coefficients to a text file string (one coefficient per line).
 */
export function exportFirFile(coefficients: number[]): string {
  return coefficients.map(String).join("\n");
}

/**
 * Create a default (pass-through) FIR filter: a single 1.0 at sample 0.
 */
export function createDefaultFirCoefficients(): number[] {
  const coefficients = new Array<number>(FIR_MAX_TAPS).fill(0);
  coefficients[0] = 1.0;
  return coefficients;
}

/**
 * Format frequency for display (Hz/kHz).
 */
export function formatFirFreq(hz: number): string {
  if (hz >= 1000) return `${(hz / 1000).toFixed(hz >= 10000 ? 0 : 1)}k`;
  return String(Math.round(hz));
}
