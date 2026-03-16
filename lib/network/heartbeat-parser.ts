import type { HeartbeatData } from "@/stores/AmpStore";
import { HEARTBEAT_STRUCT_BODY_LENGTHS } from "./heartbeat-structs";

const NETWORK_HEADER_LEN = 10;
const STRUCT_HEADER_LEN = 10;
const CHECKSUM_LEN = 3;
const BODY_START = NETWORK_HEADER_LEN + STRUCT_HEADER_LEN;

const VALID_OUTPUT_STATES = new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);

function readFloats(body: Buffer, offset: number, count: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    const abs = offset + i * 4;
    if (abs + 4 > body.length) {
      out.push(0);
      continue;
    }
    out.push(body.readFloatLE(abs));
  }
  return out;
}

function readBytes(body: Buffer, offset: number, count: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    const abs = offset + i;
    out.push(abs < body.length ? body[abs] : 0);
  }
  return out;
}

function readSBytes(body: Buffer, offset: number, count: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    const abs = offset + i;
    if (abs >= body.length) {
      out.push(0);
      continue;
    }
    const v = body[abs];
    out.push(v > 127 ? v - 256 : v);
  }
  return out;
}

function toFour(values: number[]): number[] {
  return [values[0] ?? 0, values[1] ?? 0, values[2] ?? 0, values[3] ?? 0];
}

function looksLikeStateBlock(body: Buffer, offset: number, count = 4): boolean {
  if (offset + count > body.length) return false;
  for (let i = 0; i < count; i++) {
    if (!VALID_OUTPUT_STATES.has(body[offset + i])) return false;
  }
  return true;
}

interface HeartFields {
  temperatures: number[];
  outputVoltages: number[];
  outputCurrents: number[];
  outputStates: number[];
  inputVoltages: number[];
  inputStates: number[];
  limiters: number[];
  fanVoltage: number;
}

interface StructDecisionResult {
  fields: HeartFields;
  decision: string;
}

const loggedDecisions = new Set<string>();

function parseWhole118Family(body: Buffer): StructDecisionResult {
  // Original structs place states at 52; newer 1.1.8/1.1.9 captures can shift
  // the runtime block with states at 36 and currents at 20.
  const legacyLikely = looksLikeStateBlock(body, 52);
  const shiftedLikely = looksLikeStateBlock(body, 36);

  const useShifted = shiftedLikely && !legacyLikely;

  if (useShifted) {
    const temperatures = readFloats(body, 0, 5);
    const outputVoltages = readFloats(body, 0, 4);
    const outputCurrents = readFloats(body, 20, 4);
    const outputStates = readBytes(body, 36, 4);
    const inputVoltages = readFloats(body, 40, 4);
    const limiters = readFloats(body, 56, 4);
    const inputStates = readSBytes(body, 72, 4);
    const fanVoltage = body.length >= 96 ? (readFloats(body, 92, 1)[0] ?? 0) : 0;
    return {
      decision: "WHOLE118_FAMILY_SHIFTED",
      fields: {
        temperatures,
        outputVoltages,
        outputCurrents,
        outputStates,
        inputVoltages,
        inputStates,
        limiters,
        fanVoltage
      }
    };
  }

  // Original 117/118/118Plus layout.
  const temperatures = readFloats(body, 0, 5);
  const outputVoltages = readFloats(body, 20, 4);
  const outputCurrents = readFloats(body, 36, 4);
  const outputStates = readBytes(body, 52, 4);
  const inputVoltages = readFloats(body, 56, 4);
  const limiters = body.length >= 88 ? readFloats(body, 72, 4) : [0, 0, 0, 0];
  const inputStates = body.length >= 92 ? readSBytes(body, 88, 4) : [0, 0, 0, 0];
  const fanVoltage = body.length >= 96 ? (readFloats(body, 92, 1)[0] ?? 0) : 0;

  return {
    decision: "WHOLE118_FAMILY_LEGACY",
    fields: {
      temperatures,
      outputVoltages,
      outputCurrents,
      outputStates,
      inputVoltages,
      inputStates,
      limiters,
      fanVoltage
    }
  };
}

function parseTwoChannelWithPower(body: Buffer): StructDecisionResult {
  const powerT = readFloats(body, 0, 1)[0] ?? 0;
  const outputVoltages = readFloats(body, 4, 2);
  const outputCurrents = readFloats(body, 12, 2);
  const outputStates = readBytes(body, 20, 2);

  let inputVoltages = [0, 0];
  let inputStates = [0, 0];

  if (body.length >= 32) {
    // Heart_Inf_M_One layout.
    inputVoltages = readFloats(body, 22, 2);
    inputStates = readBytes(body, 30, 2);
  } else if (body.length >= 23) {
    // Heart_Inf_Q12F layout.
    inputStates = [readBytes(body, 22, 1)[0] ?? 0, 0];
  }

  return {
    decision: `TWO_CHANNEL_WITH_POWER_LEN_${body.length}`,
    fields: {
      temperatures: [0, 0, 0, 0, powerT],
      outputVoltages,
      outputCurrents,
      outputStates,
      inputVoltages,
      inputStates,
      limiters: [0, 0, 0, 0],
      fanVoltage: 0
    }
  };
}

function parseTwoChannelNoCurrent(body: Buffer): StructDecisionResult {
  const powerT = readFloats(body, 0, 1)[0] ?? 0;
  const outputVoltages = readFloats(body, 4, 2);
  const outputStates = readBytes(body, 12, 2);

  let inputVoltages = [0, 0];
  let inputStates = [0, 0];

  if (body.length >= 19) {
    inputVoltages = [readFloats(body, 14, 1)[0] ?? 0, 0];
    inputStates = [readBytes(body, 18, 1)[0] ?? 0, 0];
  }

  return {
    decision: `TWO_CHANNEL_NO_CURRENT_LEN_${body.length}`,
    fields: {
      temperatures: [0, 0, 0, 0, powerT],
      outputVoltages,
      outputCurrents: [0, 0],
      outputStates,
      inputVoltages,
      inputStates,
      limiters: [0, 0, 0, 0],
      fanVoltage: 0
    }
  };
}

function parseEightChannel(body: Buffer): StructDecisionResult {
  const temperatures = readFloats(body, 0, 2);
  const outputVoltages = readFloats(body, 8, 4);
  const outputCurrents = readFloats(body, 40, 4);
  const outputStates = readBytes(body, 72, 4);

  return {
    decision: "EIGHT_CHANNEL_DA8300",
    fields: {
      temperatures: [temperatures[0] ?? 0, temperatures[1] ?? 0, 0, 0, 0],
      outputVoltages,
      outputCurrents,
      outputStates,
      inputVoltages: [0, 0, 0, 0],
      inputStates: [0, 0, 0, 0],
      limiters: [0, 0, 0, 0],
      fanVoltage: 0
    }
  };
}

function parseBodyByStructDecision(body: Buffer): StructDecisionResult {
  // Original app chooses parser by exact body length and model mode.
  // Here we mirror by body-length family first.
  switch (body.length) {
    case HEARTBEAT_STRUCT_BODY_LENGTHS.WHOLE118_PLUS:
    case HEARTBEAT_STRUCT_BODY_LENGTHS.WHOLE118:
    case HEARTBEAT_STRUCT_BODY_LENGTHS.WHOLE118_MINUS_INSTATES:
    case HEARTBEAT_STRUCT_BODY_LENGTHS.ACTIVE:
    case HEARTBEAT_STRUCT_BODY_LENGTHS.WHOLE117:
      return parseWhole118Family(body);
    case HEARTBEAT_STRUCT_BODY_LENGTHS.DA8300:
      return parseEightChannel(body);
    case HEARTBEAT_STRUCT_BODY_LENGTHS.M_ONE:
    case HEARTBEAT_STRUCT_BODY_LENGTHS.Q12F:
    case HEARTBEAT_STRUCT_BODY_LENGTHS.T_V_G:
      return parseTwoChannelWithPower(body);
    case HEARTBEAT_STRUCT_BODY_LENGTHS.ONE_TO_ONE_2:
    case HEARTBEAT_STRUCT_BODY_LENGTHS.T_V_1TO1_2:
      return parseTwoChannelNoCurrent(body);
    default:
      // Fallback to most common family.
      return {
        decision: `FALLBACK_WHOLE118_FAMILY_LEN_${body.length}`,
        fields: parseWhole118Family(body).fields
      };
  }
}

export function parseHeartbeat(buf: Buffer): HeartbeatData | null {
  if (buf.length < BODY_START + CHECKSUM_LEN) return null;
  if (buf[10] !== 0x55) return null;
  if (buf[11] !== 6) return null; // FuncCode.HEARTBEAT

  const machineMode = buf.readInt16LE(2);
  const bodyLen = buf.length - BODY_START - CHECKSUM_LEN;
  if (bodyLen <= 0) return null;

  const bodyEnd = BODY_START + bodyLen;
  const body = buf.slice(BODY_START, bodyEnd);

  const parsed = parseBodyByStructDecision(body);
  if (!loggedDecisions.has(parsed.decision)) {
    loggedDecisions.add(parsed.decision);
    console.info(`[HeartbeatParser] struct decision=${parsed.decision} bodyLen=${body.length}`);
  }

  const outputVoltages = toFour(parsed.fields.outputVoltages);
  const outputCurrents = toFour(parsed.fields.outputCurrents);
  const outputStates = toFour(parsed.fields.outputStates);
  const inputVoltages = toFour(parsed.fields.inputVoltages);
  const limiters = toFour(parsed.fields.limiters);
  const inputStates = toFour(parsed.fields.inputStates);
  const temperatures = [
    parsed.fields.temperatures[0] ?? 0,
    parsed.fields.temperatures[1] ?? 0,
    parsed.fields.temperatures[2] ?? 0,
    parsed.fields.temperatures[3] ?? 0,
    parsed.fields.temperatures[4] ?? 0
  ];

  const outputImpedance = outputVoltages.map((v, i) => {
    const a = outputCurrents[i] ?? 0;
    return a > 0 ? Math.round(v / a) : 0;
  });

  const outputDbu = outputVoltages.map(() => -100);
  const inputDbfs: (number | null)[] = inputVoltages.map((v) =>
    v > 0 ? Math.round(Math.log10(v) * 20 * 10) / 10 : null
  );

  return {
    temperatures,
    outputVoltages,
    outputCurrents,
    outputImpedance,
    outputDbu,
    outputStates,
    inputVoltages,
    inputDbfs,
    limiters,
    inputStates,
    fanVoltage: parsed.fields.fanVoltage,
    machineMode,
    receivedAt: Date.now()
  };
}
