import { execSync } from "child_process";

/**
 * Parses ARP table to find active devices in the network
 * Works on both Windows and Linux/macOS
 */
export async function scanActiveIps(subnet: string): Promise<string[]> {
  try {
    let arpOutput = "";
    const isWindows = process.platform === "win32";

    if (isWindows) {
      // Windows: use 'arp -a' to get ARP table
      try {
        arpOutput = execSync("arp -a", { encoding: "utf-8" });
      } catch (err) {
        console.warn("arp -a command failed:", err);
        return [];
      }
    } else {
      // Linux/macOS: use 'ip neighbor' or 'arp -a'
      try {
        arpOutput = execSync("ip neighbor 2>/dev/null || arp -a", {
          encoding: "utf-8",
          shell: "/bin/bash",
        });
      } catch (err) {
        console.warn("ip neighbor/arp command failed:", err);
        return [];
      }
    }

    // Parse ARP output to extract IPs and filter by subnet
    const activeIps = parseArpOutput(arpOutput, subnet);
    console.log(`Found ${activeIps.length} active devices in ${subnet}.x`);

    return activeIps;
  } catch (err) {
    console.error("ARP scan failed:", err);
    return [];
  }
}

/**
 * Parses ARP table output and filters by subnet
 * Handles both Windows and Unix-style ARP output formats
 */
function parseArpOutput(output: string, subnet: string): string[] {
  const ips = new Set<string>();

  // Windows ARP format: "  192.168.178.34       00-11-22-33-44-55     dynamic"
  // Linux ARP format: "192.168.178.1 dev eth0 lladdr 00:11:22:33:44:55 REACHABLE"
  const ipRegex = /(\d+\.\d+\.\d+\.\d+)/g;

  let match;
  while ((match = ipRegex.exec(output)) !== null) {
    const ip = match[1];

    // Filter by subnet (e.g., "192.168.178")
    if (ip.startsWith(subnet)) {
      // Skip network address (.0) and broadcast (.255)
      const lastOctet = parseInt(ip.split(".")[3]);
      if (lastOctet > 0 && lastOctet < 255) {
        ips.add(ip);
      }
    }
  }

  return Array.from(ips).sort((a, b) => {
    const aLastOctet = parseInt(a.split(".")[3]);
    const bLastOctet = parseInt(b.split(".")[3]);
    return aLastOctet - bLastOctet;
  });
}

/**
 * Sends ARP request for a specific IP to ensure it's in the ARP table
 * This helps discover devices that haven't communicated recently
 */
export async function sendArpRequest(ip: string): Promise<void> {
  try {
    const isWindows = process.platform === "win32";

    if (isWindows) {
      // Windows: use 'ping' to trigger ARP request (more reliable than arp -a alone)
      try {
        execSync(`ping -n 1 -w 100 ${ip}`, {
          encoding: "utf-8",
          timeout: 2000,
        });
      } catch {
        // Ignore ping failure, device might not respond to ping
      }
    } else {
      // Linux/macOS: use 'arping' if available, otherwise 'ping'
      try {
        execSync(`arping -c 1 ${ip}`, { encoding: "utf-8", timeout: 2000 });
      } catch {
        try {
          execSync(`ping -c 1 -W 100 ${ip}`, {
            encoding: "utf-8",
            timeout: 2000,
          });
        } catch {
          // Ignore ping failure
        }
      }
    }
  } catch (err) {
    console.warn(`Failed to send ARP request for ${ip}:`, err);
  }
}
