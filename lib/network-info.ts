import os from "os";

export interface NetworkInfo {
  subnet: string;
  ipAddress: string;
}

export function getLocalNetworkInfo(): NetworkInfo {
  const interfaces = os.networkInterfaces();

  // Find the first non-loopback IPv4 address
  for (const [, addresses] of Object.entries(interfaces)) {
    if (addresses) {
      for (const addr of addresses) {
        // Skip loopback and IPv6
        if (addr.family === "IPv4" && !addr.address.startsWith("127.")) {
          // Extract subnet (first 3 octets)
          const parts = addr.address.split(".");
          const subnet = `${parts[0]}.${parts[1]}.${parts[2]}`;

          return {
            subnet,
            ipAddress: addr.address,
          };
        }
      }
    }
  }

  // Fallback
  return {
    subnet: "192.168.178",
    ipAddress: "0.0.0.0",
  };
}
