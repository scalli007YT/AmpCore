// Heartbeat payload lengths (body only, excludes NetworkData+StructHeader+checksum)
// mapped from the reverse-engineered C# structs in the original controller.
export const HEARTBEAT_STRUCT_BODY_LENGTHS = {
  WHOLE117: 72,
  WHOLE118: 92,
  WHOLE118_PLUS: 96,
  ACTIVE: 76,
  DA8300: 80,
  M_ONE: 32,
  Q12F: 23,
  T_V_G: 22,
  ONE_TO_ONE_2: 19,
  T_V_1TO1_2: 14,
  WHOLE118_MINUS_INSTATES: 88
} as const;

export type HeartbeatStructKey = keyof typeof HEARTBEAT_STRUCT_BODY_LENGTHS;
