/**
 * generic.ts
 *
 * Shared pure utility functions used across the application.
 */

/**
 * Format a runtime value (in minutes) as a human-readable string.
 * e.g. 125 → "2h 5min"
 */
export function formatRuntime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${m}min`;
}

/**
 * Format a dBFS value for display.
 * Returns "---" for null or values at/below the noise floor (≤ -100 dBFS).
 */
export function formatDbfs(v: number | null): string {
  return v === null || v <= -100 ? "---" : v.toFixed(0);
}

/**
 * Calculate RMS and peak power from limiter threshold voltages and load impedance.
 *
 *   P_rms  = V_rms²  / Z
 *   P_peak = V_peak² / Z
 *
 * @param thresholdVrms  - RMS limiter threshold voltage (Vrms)
 * @param thresholdVp    - Peak limiter threshold voltage (Vpeak)
 * @param loadOhm        - Nominal load impedance in Ω (default: 8)
 * @returns Object with `prmsW` and `ppeakW` rounded to the nearest watt.
 */
export function limiterPowerFromLoad(
  thresholdVrms: number,
  thresholdVp: number,
  loadOhm: number = 8,
): { prmsW: number; ppeakW: number } {
  const prmsW = Math.round((thresholdVrms * thresholdVrms) / loadOhm);
  const ppeakW = Math.round((thresholdVp * thresholdVp) / loadOhm);
  return { prmsW, ppeakW };
}

/**
 * Convert a threshold voltage to the output dBu scale used by the VU meters.
 *
 * The VU meter scale is referenced to the device's rated RMS output voltage:
 *   dbu = 20 * log10(thresholdV / ratedRmsV)
 *
 * Pass `thresholdVp / Math.SQRT2` when converting a peak voltage to the
 * RMS-referenced scale (e.g. for peak limiter thresholds).
 *
 * Returns `null` when `ratedRmsV` is unknown or `thresholdV` ≤ 0.
 */
export function thresholdVToDbu(
  thresholdV: number,
  ratedRmsV: number | undefined,
): number | null {
  if (!ratedRmsV || thresholdV <= 0) return null;
  return 20 * Math.log10(thresholdV / ratedRmsV);
}
