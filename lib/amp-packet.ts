// lib/amp-packet.ts
export function buildStatusPacket(): Buffer {
  const buf = Buffer.alloc(102);

  // --- Header ---
  buf[0] = 0x55; // start byte
  buf[1] = 0x00; // function code / reserved
  buf[2] = 0x01; // status / flags
  buf[3] = 0x03; // payload length MSB? (matches capture)
  buf[4] = 0x0a; // payload length LSB? (total 0x030a = 778 bytes in original? maybe only used low byte)

  // --- Payload (ASCII device info from capture) ---
  const payloadAscii =
    "000000000034323430344230362d3030363131382d4453502d323030340000000000000000505343414c20524f5345204453502d323030340000000000000000000000000000";
  // convert hex string to bytes
  for (let i = 0; i < payloadAscii.length / 2; i++) {
    buf[5 + i] = parseInt(payloadAscii.substr(i * 2, 2), 16);
  }

  // --- Checksum ---
  const sum = buf.slice(0, 101).reduce((acc, byte) => acc + byte, 0);
  buf[101] = sum & 0xff;

  return buf;
}
