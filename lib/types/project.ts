import type { AmpLinkConfig } from "@/lib/amp-action-linking";

export type ProjectMode = "real" | "demo";

export interface AmpChannelConstants {
  ohms: number;
}

export interface AssignedAmpConstants {
  channels: AmpChannelConstants[];
  linking: AmpLinkConfig;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  projectMode: ProjectMode;
  updatedAt: string;
  assigned_amps: Array<{
    id: string;
    mac: string;
    lastKnownName?: string;
    lastKnownIp?: string;
    constants: AssignedAmpConstants;
    loadOhm?: number;
  }>;
}

export const DEFAULT_CHANNEL_OHMS = 8;
export const DEFAULT_PROJECT_CHANNEL_COUNT = 4;
