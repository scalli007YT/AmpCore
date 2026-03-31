import dgram from "dgram";
import {
  buildStructHeader,
  buildNetworkDataHeader,
  calcCheckCode,
  FRAGMENT_SIZE,
  type StructHeaderFields
} from "@/lib/network/protocol";

const AMP_SEND_PORT = 45455;
const CROSSOVER_COMMIT_PACKET = Buffer.from("03d99401015c0001015a", "hex");
const MAX_PACKETS_COUNT = 255; // network header packets_count is uint8

export class FuncCode {
  static BASIC_INFO = 0;
  static AUTO_STANDBY = 1;
  static AUTO_STANDBY_TIME = 2;
  static HEARTBEAT = 6;
  static VOL = 9;
  static MUTE = 10;
  static SOURCE_SELECT = 11;
  static ROUTING = 12;
  static GAIN = 13;
  static DELAY = 14;
  static STANDBY_DATA = 15;
  static ROTARY_LOCK = 17;
  static PHASE = 18;
  static DYN_EQ = 25;
  static SYNC_DATA = 27;
  static CHECK_VERSION = 28;
  static FW_STEP_RESULT = 29;
  static FILTER_TYPE = 30;
  static FILTER_GAIN = 31;
  static FILTER_FREQ = 32;
  static FILTER_FREQ_BOOST = 33;
  static FILTER_Q = 34;
  static CH_EQ_BYPASS = 36;
  static RMS_THRESH = 39;
  static PEAK_HOLD = 40;
  static PEAK_RELEASE = 41;
  static PEAK_THRESH = 42;
  static FIR_DATA = 43;
  static FIR_BYPASS = 44;
  static PEAK_BYPASS = 47;
  static RMS_BYPASS = 48;
  static DZ_DY = 49;
  static SOURCE_DZDY = 49; // legacy alias
  static BRIDGE = 50;
  static CH_DATA = 51;
  static EQ = 52;
  static DYN_EQ2 = 53;
  static PEAK_LIMITER = 54;
  static RMS_LIMITER = 55;
  static SPEAKER_DATA = 57;
  static SAVE_RECALL = 59;
  static FEEDBACK = 65;
  static FEEDBACK_BYPASS = 66;
  static IOS_DATA = 68;
  static NOISE_GATE = 69;
  static KNOB_VOL = 70;
  static SN_TABLE = 71;
  static CUSTOMER_NAME_MODIFY = 60; // 0x3C, confirmed by captured rename packet
  static BACK_SW_FILTER = 73;
  static SOURCE_DATA = 62;
  static ANALOG_TYPE = 79;
  static PRIORITY_INPUTS = 80;
  static POWER_ALLOT = 81;
  static SPEAKER_NAME = 77;
  static MONO_SWITCH = 78;
}

export class CvrAmpDevice {
  private ampIp: string;

  constructor(ampIp: string) {
    this.ampIp = ampIp;
  }

  /**
   * Recall a preset slot from device memory.
   *
   * Confirmed from original C# source:
   *   Save_Recall_data { mode = 2, ch_x = slotIndex, buffers = [32x0] }
   *   UDP.SendStruct(Save_Recall_data_code, 0, save_Recall_data)
   *
   * Slot numbering in the UI is 1-based. Wire ch_x is 0-based.
   */
  async recallPreset(slot: number): Promise<void> {
    if (!Number.isInteger(slot) || slot < 1 || slot > 40) {
      throw new Error(`Invalid preset slot: ${slot}`);
    }

    const body = Buffer.alloc(34, 0);
    body.writeUInt8(2, 0); // mode = 2 (recall)
    body.writeUInt8(slot - 1, 1); // ch_x = zero-based slot index

    await this.sendControl(FuncCode.SAVE_RECALL, 0, body, 0 /* input/default */);
  }

  /**
   * Store (save) current device state into a preset slot.
   *
   * Confirmed from original C# source:
   *   Save_Recall_data { mode = 1, ch_x = slotIndex, buffers = name[32] }
   */
  async storePreset(slot: number, name: string): Promise<void> {
    if (!Number.isInteger(slot) || slot < 1 || slot > 40) {
      throw new Error(`Invalid preset slot: ${slot}`);
    }

    const trimmed = (name ?? "").trim();
    if (trimmed.length === 0) {
      throw new Error("Preset name cannot be empty");
    }

    const body = Buffer.alloc(34, 0);
    body.writeUInt8(1, 0); // mode = 1 (store)
    body.writeUInt8(slot - 1, 1); // ch_x = zero-based slot index

    // Device preset names are 32-byte null-padded ASCII fields.
    const nameBytes = Buffer.from(trimmed, "ascii").subarray(0, 32);
    nameBytes.copy(body, 2);

    await this.sendControl(FuncCode.SAVE_RECALL, 0, body, 0 /* input/default */);
  }

  /**
   * Commit staged crossover changes.
   *
   * Reverse-engineered from the CVR desktop app and the attached Python helper:
   * after HP/LP writes (FC=30 / FC=32), the device expects this fixed 10-byte
   * follow-up packet before the changes become active.
   */
  async commitCrossover(): Promise<void> {
    const sock = dgram.createSocket("udp4");
    await new Promise<void>((resolve, reject) => {
      sock.bind({ port: 0, address: "0.0.0.0" }, (err?: Error) => {
        if (err) reject(err);
        else resolve();
      });
    });

    await new Promise<void>((resolve, reject) => {
      sock.send(CROSSOVER_COMMIT_PACKET, 0, CROSSOVER_COMMIT_PACKET.length, AMP_SEND_PORT, this.ampIp, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    await new Promise<void>((resolve) => setTimeout(resolve, 10));
    try {
      sock.close();
    } catch {
      // ignore close errors
    }
  }

  /**
   * Send a fire-and-forget control command via an ephemeral UDP socket.
   *
   * Wire format derived from real packet captures (Python reverse-engineering)
   * and confirmed by reading the original C# source:
   *   - NetworkData flag: 0xd903 with machineMode=0
   *   - statusCode: 1  (all write/control commands)
   *   - inOutFlag (byte 9 of StructHeader): 0=input, 1=Output  (C# enum in_out_flag)
   *
   * An ephemeral socket (port 0) is used so the command originates from a
   * different source port than the persistent monitor socket — matching the
   * CVR Windows software behaviour.
   *
   * The amp ACKs with a short packet; we don't need it, so the socket is
   * closed after a brief wait to flush the send buffer.
   *
   * @param fc         Function code (e.g. FuncCode.MUTE = 10)
   * @param chx        Channel index 0–3
   * @param body       Command payload bytes
   * @param inOutFlag  StructHeader byte 9 (in_out_flag): 0=input, 1=Output (default 0)
   * @param link       StructHeader bytes 5-8 (Link int32): link group (default 0)
   * @param segment    StructHeader byte 4 (Segment): segment selector (default 0)
   * @param statusCode StructHeader byte 2 (default 1 for most write/control commands)
   */
  async sendControl(
    fc: number,
    chx: number,
    body: Buffer,
    inOutFlag = 0,
    link = 0,
    segment = 0,
    statusCode = 1
  ): Promise<void> {
    const header: StructHeaderFields = {
      functionCode: fc,
      statusCode,
      chx,
      link,
      inOutFlag,
      segment
    };

    const sock = dgram.createSocket("udp4");
    await new Promise<void>((resolve, reject) => {
      sock.bind({ port: 0, address: "0.0.0.0" }, (err?: Error) => {
        if (err) reject(err);
        else resolve();
      });
    });

    // Build the inner frame: structHeader + body + checkCode
    // This matches the C# pattern: array = StructToBytes(header) + StructToBytes(body) + getCheckCode(array)
    const structHeaderBuf = buildStructHeader(header);
    const inner = Buffer.concat([structHeaderBuf, body]);
    const frame = Buffer.concat([inner, calcCheckCode(inner)]);

    // Fragment at application-level (450-byte chunks) matching C# UDP.cs behaviour.
    // The device reassembles fragments using packets_count / packets_stepcount / packets_lastlenth.
    const packetsCount = frame.length <= FRAGMENT_SIZE ? 1 : Math.ceil(frame.length / FRAGMENT_SIZE);
    const packetsLastlen = frame.length % FRAGMENT_SIZE === 0 ? FRAGMENT_SIZE : frame.length % FRAGMENT_SIZE;

    if (packetsCount > MAX_PACKETS_COUNT) {
      throw new Error(
        `Payload too large for one protocol transfer: frame=${frame.length} bytes requires ${packetsCount} packets, max is ${MAX_PACKETS_COUNT}`
      );
    }

    for (let step = 1; step <= packetsCount; step++) {
      const chunkStart = (step - 1) * FRAGMENT_SIZE;
      const chunkLen = step === packetsCount ? packetsLastlen : FRAGMENT_SIZE;
      const chunk = frame.slice(chunkStart, chunkStart + chunkLen);

      const networkHeader = buildNetworkDataHeader({
        frameLen: packetsLastlen,
        machineMode: 0,
        dataState: 0,
        packetsCount,
        packetsStep: step
      });

      const packet = Buffer.concat([networkHeader, chunk]);

      await new Promise<void>((resolve, reject) => {
        sock.send(packet, 0, packet.length, AMP_SEND_PORT, this.ampIp, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      // Wait between fragments for the device to process and ACK.
      // The C# original waits for an ACK with a 1-second timeout per fragment.
      // Small payloads (≤ 450 B) need only a tiny gap, but large payloads like
      // FC=57 speaker data (~2310 B, 6 fragments) need longer pauses so the
      // embedded processor can reassemble and flush each chunk.
      if (step < packetsCount) {
        await new Promise<void>((resolve) => setTimeout(resolve, packetsCount > 2 ? 150 : 20));
      }
    }

    // Give the OS time to flush — longer for multi-fragment sends
    await new Promise<void>((resolve) => setTimeout(resolve, packetsCount > 2 ? 100 : 10));
    try {
      sock.close();
    } catch {
      // ignore close errors
    }
  }

  close(): void {
    // No-op — sendControl creates and closes its own ephemeral sockets.
    // Kept for API compatibility with existing callers.
  }
}

// Re-export for server-side callers that already import from this module.
export { maxDbFromDeviceName } from "./amp-model";
export { parseHeartbeat } from "./network/heartbeat-parser";
