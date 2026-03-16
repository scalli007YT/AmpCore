export const NETWORK_DATA_FLAG = 0xd903;
export const NETWORK_HEADER_LEN = 10;
export const STRUCT_HEADER_LEN = 10;
export const CHECKSUM_LEN = 3;
export const FRAGMENT_SIZE = 450;

export interface NetworkDataHeader {
  dataFlag: number;
  machineMode: number;
  packetsCount: number;
  packetsLastlen: number;
  packetsStep: number;
  dataState: number;
  paddingData: number;
}

export interface StructHeaderFields {
  functionCode: number;
  statusCode: number;
  chx: number;
  segment?: number;
  link?: number;
  inOutFlag?: number;
}

export interface ProtocolPacketParams extends StructHeaderFields {
  body?: Buffer;
  machineMode?: number;
  dataState?: number;
  packetsCount?: number;
  packetsStep?: number;
}

export interface AssembledFrame {
  functionCode: number;
  body: Buffer;
  rawAssembled: Buffer;
}

interface FragmentState {
  data: Buffer;
  totalLen: number;
  packetsCount: number;
  receivedSteps: Set<number>;
}

export function parseNetworkDataHeader(raw: Buffer): NetworkDataHeader | null {
  if (raw.length < NETWORK_HEADER_LEN) return null;
  return {
    dataFlag: raw.readUInt16LE(0),
    machineMode: raw.readInt16LE(2),
    packetsCount: raw[4],
    packetsLastlen: raw.readUInt16LE(5),
    packetsStep: raw[7],
    dataState: raw[8],
    paddingData: raw[9]
  };
}

export function buildNetworkDataHeader(params: {
  frameLen: number;
  machineMode?: number;
  dataState?: number;
  packetsCount?: number;
  packetsStep?: number;
}): Buffer {
  const buf = Buffer.alloc(NETWORK_HEADER_LEN);
  buf.writeUInt16LE(NETWORK_DATA_FLAG, 0);
  buf.writeInt16LE(params.machineMode ?? 0, 2);
  buf[4] = params.packetsCount ?? 1;
  buf.writeUInt16LE(params.frameLen, 5);
  buf[7] = params.packetsStep ?? 1;
  buf[8] = params.dataState ?? 0;
  buf[9] = 0;
  return buf;
}

export function buildStructHeader(fields: StructHeaderFields): Buffer {
  const buf = Buffer.alloc(STRUCT_HEADER_LEN);
  buf[0] = 0x55;
  buf[1] = fields.functionCode;
  buf[2] = fields.statusCode;
  buf[3] = fields.chx;
  buf[4] = fields.segment ?? 0;
  buf.writeInt32LE(fields.link ?? 0, 5);
  buf[9] = fields.inOutFlag ?? 0;
  return buf;
}

export function calcCheckCode(innerFrame: Buffer): Buffer {
  const num = innerFrame.length + CHECKSUM_LEN;
  const hi = (num >> 8) & 0xff;
  const lo = num & 0xff;
  let sum = hi + lo;
  for (const b of innerFrame) sum += b;
  return Buffer.from([hi, lo, sum & 0xff]);
}

export function buildProtocolPacket(params: ProtocolPacketParams): Buffer {
  const body = params.body ?? Buffer.alloc(0);
  const structHeader = buildStructHeader(params);
  const inner = Buffer.concat([structHeader, body]);
  const frame = Buffer.concat([inner, calcCheckCode(inner)]);
  const networkHeader = buildNetworkDataHeader({
    frameLen: frame.length,
    machineMode: params.machineMode,
    dataState: params.dataState,
    packetsCount: params.packetsCount,
    packetsStep: params.packetsStep
  });
  return Buffer.concat([networkHeader, frame]);
}

export function buildAckPacket(rawPacket: Buffer): Buffer | null {
  if (rawPacket.length < NETWORK_HEADER_LEN) return null;
  const ack = Buffer.from(rawPacket.slice(0, NETWORK_HEADER_LEN));
  ack[8] = 1;
  return ack;
}

export function validateAssembledFrame(assembled: Buffer): boolean {
  if (assembled.length < STRUCT_HEADER_LEN + CHECKSUM_LEN) return false;
  if (assembled[0] !== 0x55) return false;
  const inner = assembled.slice(0, assembled.length - CHECKSUM_LEN);
  const expected = calcCheckCode(inner);
  return expected[1] === assembled[assembled.length - 2] && expected[2] === assembled[assembled.length - 1];
}

export function decodeAssembledFrame(assembled: Buffer): AssembledFrame | null {
  if (!validateAssembledFrame(assembled)) return null;
  return {
    functionCode: assembled[1],
    body: assembled.slice(STRUCT_HEADER_LEN, assembled.length - CHECKSUM_LEN),
    rawAssembled: assembled
  };
}

export function prependNetworkHeaderToAssembled(assembled: Buffer, machineMode = 0): Buffer {
  const nd = buildNetworkDataHeader({
    frameLen: assembled.length,
    machineMode,
    dataState: 0,
    packetsCount: 1,
    packetsStep: 1
  });
  return Buffer.concat([nd, assembled]);
}

export class UdpFragmentReassembler {
  private fragmentsByIp = new Map<string, FragmentState>();

  push(ip: string, rawPacket: Buffer): Buffer | null {
    const nd = parseNetworkDataHeader(rawPacket);
    if (!nd) return null;
    if (nd.dataFlag !== NETWORK_DATA_FLAG) return null;

    const totalLen = (nd.packetsCount - 1) * FRAGMENT_SIZE + nd.packetsLastlen;
    if (totalLen <= 0) return null;

    let state = this.fragmentsByIp.get(ip);
    if (!state || state.totalLen !== totalLen || state.packetsCount !== nd.packetsCount) {
      state = {
        data: Buffer.alloc(totalLen),
        totalLen,
        packetsCount: nd.packetsCount,
        receivedSteps: new Set<number>()
      };
      this.fragmentsByIp.set(ip, state);
    }

    const chunk = rawPacket.slice(
      NETWORK_HEADER_LEN,
      NETWORK_HEADER_LEN + Math.min(rawPacket.length - NETWORK_HEADER_LEN, FRAGMENT_SIZE)
    );
    const offset = (nd.packetsStep - 1) * FRAGMENT_SIZE;
    chunk.copy(state.data, offset);
    state.receivedSteps.add(nd.packetsStep);

    if (state.receivedSteps.size < nd.packetsCount) return null;

    const assembled = Buffer.from(state.data);
    this.fragmentsByIp.delete(ip);
    return assembled;
  }

  clear(ip?: string): void {
    if (ip) {
      this.fragmentsByIp.delete(ip);
      return;
    }
    this.fragmentsByIp.clear();
  }
}
