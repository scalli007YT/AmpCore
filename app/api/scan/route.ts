import { CvrAmpDevice } from "@/lib/amp-device";
import { getLocalNetworkInfo } from "@/lib/network-info";
import { scanActiveIps, sendArpRequest } from "@/lib/arp-scan";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    // Get the subnet from query params or detect it
    const networkInfo = getLocalNetworkInfo();
    const subnetParam = request.nextUrl.searchParams.get("subnet");

    // Check if it's a direct IP query (contains dots and ends with a number like x.x.x.x)
    const isDirectIp = subnetParam && subnetParam.match(/^\d+\.\d+\.\d+\.\d+$/);

    if (isDirectIp) {
      // Direct IP query
      return queryAndReturnDevice(subnetParam, "", [subnetParam], networkInfo);
    }

    // Subnet scan with ARP-based discovery
    const subnet = subnetParam || networkInfo.subnet;

    // Get active IPs from ARP table
    const activeIps = await scanActiveIps(subnet);

    // Query each active IP for AMP device info - find ALL devices, not just the first
    const foundDevices: Array<{ ip: string; info: any }> = [];

    for (const ip of activeIps) {
      try {
        const device = new CvrAmpDevice(ip);
        const info = await device.queryBasicInfo();
        device.close();

        foundDevices.push({ ip, info });
      } catch (err) {
        // Not an AMP device, skip to next IP
      }
    }

    // If devices found, return all of them
    if (foundDevices.length > 0) {
      return NextResponse.json({
        success: true,
        subnet,
        detectedNetworkInfo: networkInfo,
        devicesCount: foundDevices.length,
        devices: foundDevices.map((d) => ({
          ip: d.ip,
          name: d.info.name,
          mac: d.info.mac,
          deviceVersion: d.info.deviceVersion,
          identifier: d.info.identifier,
          runtime: d.info.runtime,
        })),
      });
    }

    // If no devices found in ARP table, try a broader discovery by pinging subnet range
    // This helps find devices that haven't communicated recently
    if (activeIps.length === 0) {
      // Try some likely IP addresses (common device ranges: 1-20, 50-100, 200-254)
      const likelyIps = [
        ...Array.from({ length: 20 }, (_, i) => `${subnet}.${i + 1}`),
        ...Array.from({ length: 20 }, (_, i) => `${subnet}.${i + 100}`),
        ...Array.from({ length: 20 }, (_, i) => `${subnet}.${i + 200}`),
      ];

      for (const ip of likelyIps) {
        try {
          // Send ARP request to wake up device
          await sendArpRequest(ip);

          const device = new CvrAmpDevice(ip);
          const info = await device.queryBasicInfo();
          device.close();

          foundDevices.push({ ip, info });
        } catch (err) {
          // Not an AMP device, skip to next IP
        }
      }

      // Return all devices found in broader discovery
      if (foundDevices.length > 0) {
        return NextResponse.json({
          success: true,
          subnet,
          detectedNetworkInfo: networkInfo,
          devicesCount: foundDevices.length,
          devices: foundDevices.map((d) => ({
            ip: d.ip,
            name: d.info.name,
            mac: d.info.mac,
            deviceVersion: d.info.deviceVersion,
            identifier: d.info.identifier,
            runtime: d.info.runtime,
          })),
        });
      }
    }

    // No devices found
    return NextResponse.json({
      success: false,
      error: "No AMP devices found in subnet",
      subnet,
      detectedNetworkInfo: networkInfo,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

async function queryAndReturnDevice(
  deviceIp: string,
  subnet: string,
  devicesFound: string[],
  networkInfo: any,
) {
  const device = new CvrAmpDevice(deviceIp);
  const info = await device.queryBasicInfo();
  device.close();

  return NextResponse.json({
    success: true,
    subnet,
    detectedNetworkInfo: networkInfo,
    devicesCount: 1,
    devices: [
      {
        ip: deviceIp,
        name: info.name,
        mac: info.mac,
        deviceVersion: info.deviceVersion,
        identifier: info.identifier,
        runtime: info.runtime,
      },
    ],
  });
}
