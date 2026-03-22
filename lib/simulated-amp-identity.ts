export const SIMULATED_AMP_MACS = [
  "10:02:00:00:00:01",
  "10:04:00:00:00:01",
  "11:02:00:00:00:01",
  "11:04:00:00:00:01"
] as const;

const SIMULATED_MAC_SET = new Set(SIMULATED_AMP_MACS.map((mac) => mac.toUpperCase()));

export function normalizeMac(mac: string): string {
  return mac.trim().toUpperCase();
}

export function isSimulatedMac(mac: string): boolean {
  return SIMULATED_MAC_SET.has(normalizeMac(mac));
}
