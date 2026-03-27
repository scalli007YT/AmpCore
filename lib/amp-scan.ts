import dgram from "dgram";
import os from "os";
import { FuncCode } from "./amp-device";

const AMP_PORT = 45455;
const DISCOVERY_TIMEOUT = 200; // 200ms — amps respond in <50ms on LAN/WiFi
const NETWORK_DATA_FLAG = 0xd903;

/**
 * Returns the directed broadcast address for every active IPv4 interface
 * (e.g. 192.168.1.255, 10.0.0.255). Sending to each ensures discovery works
 * even when the machine has multiple adapters on different subnets.
 */
function getDirectedBroadcasts(): string[] {
  const broadcasts: string[] = [];
  for (const iface of Object.values(os.networkInterfaces())) {
    if (!iface) continue;
    for (const addr of iface) {
      if (addr.family !== "IPv4" || addr.internal) continue;
      const ip = addr.address.split(".").map(Number);
      const mask = addr.netmask.split(".").map(Number);
      const bcast = ip.map((b, i) => (b & mask[i]) | (~mask[i] & 0xff));
      broadcasts.push(bcast.join("."));
    }
  }
  // Fallback to limited broadcast if no usable interfaces found
  return broadcasts.length > 0 ? broadcasts : ["255.255.255.255"];
}

/**
 * Broadcast-based discovery for AMP devices (matching original C# app)
 * Sends BASIC_INFO query to 255.255.255.255:45455 and collects responses.
 * Each BASIC_INFO response contains the full device identity — no follow-up
 * unicast queries needed.
 */
export async function broadcastDiscovery(): Promise<Array<{ ip: string; mac: string; name: string; version: string }>> {
  console.log("[broadcastDiscovery] Starting broadcast discovery scan");
  const devices: Map<string, { ip: string; mac: string; name: string; version: string }> = new Map();
  const PC_RECV_PORT = 45454; // Port to listen for AMP responses

  return new Promise((resolve) => {
    try {
      const socket = dgram.createSocket("udp4");

      const timeoutHandle = setTimeout(() => {
        try {
          socket.close();
        } catch {}
        console.log(`[broadcastDiscovery] Timeout reached, found ${devices.size} device(s)`);
        resolve(Array.from(devices.values()));
      }, DISCOVERY_TIMEOUT);

      socket.on("message", (msg: Buffer, rinfo) => {
        try {
          console.log(`[broadcastDiscovery] Received message from ${rinfo.address}:${rinfo.port}, length=${msg.length}`);\n          // BASIC_INFO response layout:
          //   [0–9]   NetworkData header
          //   [10–19] StructHeader (head=0x55, FC=0)
          //   [20..]  body + checksum
          // Body supports legacy 24-byte and newer 32-byte name layouts.
          if (msg.length < 90) {\n            console.debug(`[broadcastDiscovery] Message too short from ${rinfo.address}`);\n            return;\n          }\n          if (msg[10] !== 0x55) {\n            console.debug(`[broadcastDiscovery] Invalid header from ${rinfo.address}`);\n            return;\n          }\n          if (msg[11] !== FuncCode.BASIC_INFO) {\n            console.debug(`[broadcastDiscovery] Not BASIC_INFO from ${rinfo.address}`);\n            return;\n          }

          const fullBody = msg.slice(20, msg.length - 3);
          let body = fullBody;
          if (fullBody.length === 79 || fullBody.length === 87) {
            body = fullBody.slice(0, fullBody.length - 4);
          }
          if (body.length < 75) return;

          const readMacAt = (offset: number): Buffer | null => {
            if (body.length < offset + 6) return null;
            const macCandidate = body.slice(offset, offset + 6);
            return macCandidate.reduce((a, b) => a + b, 0) > 0 ? macCandidate : null;
          };

          const macOffset = readMacAt(72) ? 72 : 64;
          const macBytes = readMacAt(macOffset);
          if (!macBytes) return;

          // Parse MAC
          const mac = Array.from(macBytes)
            .map((b) => b.toString(16).toUpperCase().padStart(2, "0"))
            .join(":");

          if (devices.has(mac)) return; // already seen

          // Parse version (offset 20, 24 bytes, null-terminated)
          const verSlice = body.slice(0, 24);
          const verNull = verSlice.indexOf(0);
          const version = verSlice
            .slice(0, verNull === -1 ? verSlice.length : verNull)
            .toString("ascii")
            .trim();

          // Parse name (offset 32, length inferred from MAC offset)
          const nameSlice = body.slice(32, macOffset);
          const nameNull = nameSlice.indexOf(0);
          const name = nameSlice
            .slice(0, nameNull === -1 ? nameSlice.length : nameNull)
            .toString("ascii")
            .trim();

          console.log(`[broadcastDiscovery] Device discovered: mac=${mac}, ip=${rinfo.address}, name=${name}, version=${version}`);
          devices.set(mac, { ip: rinfo.address, mac, name, version });
        } catch (err) {
          console.error("[DISCOVERY] Error parsing message:", err);
        }
      });

      socket.on("error", (err) => {
        console.error("[DISCOVERY] Socket error:", err);
        clearTimeout(timeoutHandle);
        try {
          socket.close();
        } catch {}
        resolve(Array.from(devices.values()));
      });

      // Bind socket to receive port BEFORE sending
      socket.bind({ port: PC_RECV_PORT, address: "0.0.0.0", exclusive: false }, () => {
        try {
          console.log("[broadcastDiscovery] Socket bound on 0.0.0.0:45454, enabling broadcast");
          // Now that socket is bound, enable broadcast mode
          socket.setBroadcast(true);

          // Build BASIC_INFO broadcast query packet
          // Build StructHeader (10 bytes)
          const header = Buffer.alloc(10);
          header[0] = 0x55; // head
          header[1] = FuncCode.BASIC_INFO; // function_code
          header[2] = 2; // status_code (request)
          header[3] = 0; // chx
          header[4] = 0; // link
          header[5] = 0; // inOutFlag
          header[6] = 0; // segment
          header[7] = 0; // r1
          header[8] = 0; // r2
          header[9] = 0; // r3

          // Calculate checksum (3 bytes)
          const length = header.length;
          const num = length + 3;
          let sum = header.reduce((acc, byte) => acc + byte, 0);
          sum += num + (num >> 8);

          const checksum = Buffer.from([(num >> 8) & 0xff, num & 0xff, sum & 0xff]);

          const frame = Buffer.concat([header, checksum]);

          // Build NetworkData wrapper (10 bytes)
          const networkData = Buffer.alloc(10);
          networkData.writeUInt16LE(NETWORK_DATA_FLAG, 0);
          networkData.writeInt16LE(0, 2);
          networkData[4] = 1; // packets_count
          networkData.writeUInt16LE(frame.length, 5); // packets_lastlenth
          networkData[7] = 1; // packets_stepcount
          networkData[8] = 0; // data_state
          networkData[9] = 0; // padding_data

          const packet = Buffer.concat([networkData, frame]);

          // Send directed broadcast on every active network interface so amps
          // are discovered regardless of which subnet/adapter they're on.
          const broadcastAddrs = getDirectedBroadcasts();
          console.log(`[broadcastDiscovery] Sending discovery probe to ${broadcastAddrs.length} broadcast address(es): ${broadcastAddrs.join(", ")}`);\n          for (const addr of broadcastAddrs) {
            socket.send(packet, 0, packet.length, AMP_PORT, addr, (err) => {
              if (err) {
                console.error(`[broadcastDiscovery] Send error on ${addr}:`, err);
              } else {
                console.log(`[broadcastDiscovery] Discovery probe sent to ${addr}:${AMP_PORT}`);\n              }
            });
          }
        } catch (err) {
          console.error("[DISCOVERY] Failed to build or send packet:", err);
          clearTimeout(timeoutHandle);
          try {
            socket.close();
          } catch {}
          resolve([]);
        }
      });

      // Handle bind errors
      socket.on("error", (err) => {
        console.error("[DISCOVERY] Bind error:", err);
        clearTimeout(timeoutHandle);
        try {
          socket.close();
        } catch {}
        resolve([]);
      });
    } catch (err) {
      console.error("[DISCOVERY] Failed to create socket:", err);
      resolve([]);
    }
  });
}

/**
 * Stub for compatibility - kept for backward compatibility
 * Use broadcastDiscovery() instead
 */
export async function scanActiveIps(subnet: string): Promise<string[]> {
  const devices = await broadcastDiscovery();
  return devices.map((d) => d.ip);
}
