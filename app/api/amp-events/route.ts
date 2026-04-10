/**
 * GET /api/amp-events
 *
 * Server-Sent Events stream that bridges the server-side AmpController
 * singleton to the browser.
 *
 * The controller owns the UDP socket (bound once, persistent), runs the
 * 140 ms heartbeat loop and the 4 s discovery timer.  This route simply
 * subscribes to its EventEmitter and forwards events as SSE messages.
 *
 * Event types (JSON body of each `data:` line):
 *
 *   { type: "discovery", ip, mac, name, version }
 *   { type: "heartbeat", ip, mac, heartbeat: HeartbeatData }
 *   { type: "offline",   mac }
 *   { type: "ping" }          ← keepalive every 15 s
 */

import { ampController } from "@/lib/amp-controller";
import type { DiscoveryEvent, HeartbeatEvent, OfflineEvent } from "@/lib/amp-controller";
import { getSimulatedDiscoveryEvents, getSimulatedHeartbeatEvents } from "@/lib/simulated-amps";

// Tell Next.js this route must not be statically pre-rendered
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const projectMode = url.searchParams.get("projectMode") === "demo" ? "demo" : "real";
  const seedIps = url.searchParams.get("seedIps")?.split(",").filter(Boolean) ?? [];

  // Ensure the controller socket is started (idempotent) for real-device projects.
  if (projectMode === "real") {
    ampController.start();
    // Seed remembered IPs for cross-subnet discovery (from project's lastKnownIp values)
    for (const ip of seedIps) {
      if (/^\d+\.\d+\.\d+\.\d+$/.test(ip.trim())) {
        ampController.seedIp(ip.trim());
      }
    }
  }

  let closed = false;
  // Hoisted so both start() and cancel() can reach the same function.
  // (In ReadableStream, `this` inside cancel() is the UnderlyingSource literal,
  // not the ReadableStreamDefaultController — so storing on controller doesn't work.)
  let cleanupFn: (() => void) | undefined;

  const stream = new ReadableStream({
    start(controller) {
      const send = (obj: object) => {
        if (closed) return;
        try {
          controller.enqueue(`data: ${JSON.stringify(obj)}\n\n`);
        } catch {
          // Stream already closed — ignore
        }
      };

      // -----------------------------------------------------------------------
      // Attach listeners
      // -----------------------------------------------------------------------
      const onDiscovery = (e: DiscoveryEvent) => send({ type: "discovery", ...e });

      const onHeartbeat = (e: HeartbeatEvent) => send({ type: "heartbeat", ...e });

      const onOffline = (e: OfflineEvent) => send({ type: "offline", ...e });

      if (projectMode === "real") {
        ampController.on("discovery", onDiscovery);
        ampController.on("heartbeat", onHeartbeat);
        ampController.on("offline", onOffline);
      }

      const sendSimulatedDiscovery = () => {
        for (const event of getSimulatedDiscoveryEvents()) {
          send({ type: "discovery", ...event });
        }
      };

      const sendSimulatedHeartbeat = () => {
        for (const event of getSimulatedHeartbeatEvents()) {
          send({ type: "heartbeat", ...event });
        }
      };

      const demoEnabled = projectMode === "demo";
      const demoDiscoveryTimer = demoEnabled ? setInterval(sendSimulatedDiscovery, 4_000) : null;
      const demoHeartbeatTimer = demoEnabled ? setInterval(sendSimulatedHeartbeat, 500) : null;

      if (demoEnabled) {
        sendSimulatedDiscovery();
        sendSimulatedHeartbeat();
      }

      // Keepalive ping every 15 s to prevent proxy/browser timeouts
      const pingTimer = setInterval(() => send({ type: "ping" }), 15_000);

      // -----------------------------------------------------------------------
      // Cleanup on client disconnect
      // -----------------------------------------------------------------------
      cleanupFn = () => {
        if (closed) return;
        closed = true;
        clearInterval(pingTimer);
        if (demoDiscoveryTimer) clearInterval(demoDiscoveryTimer);
        if (demoHeartbeatTimer) clearInterval(demoHeartbeatTimer);
        if (projectMode === "real") {
          ampController.off("discovery", onDiscovery);
          ampController.off("heartbeat", onHeartbeat);
          ampController.off("offline", onOffline);
        }
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

      // AbortSignal fires when the HTTP connection drops (most reliable path).
      request.signal.addEventListener("abort", cleanupFn, { once: true });
    },

    cancel() {
      // Called by the ReadableStream runtime when the consumer cancels.
      cleanupFn?.();
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no" // disable nginx buffering
    }
  });
}
