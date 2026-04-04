"use client";

import type { Amp } from "@/stores/AmpStore";
import type { AmpOptions } from "@/stores/AmpOptionStore";
import { HeartbeatDashboard } from "@/components/monitor/amp-tabs/heartbeat-dashboard";
import { useI18n } from "@/components/layout/i18n-provider";

interface MainPanelProps {
  amp: Amp;
  ampOptions: AmpOptions;
}

export function MainPanel({ amp, ampOptions }: MainPanelProps) {
  const dict = useI18n();

  if (!amp.heartbeat) {
    return <p className="text-sm text-muted-foreground animate-pulse">{dict.monitor.ampTabs.waitingForData}</p>;
  }

  return (
    <div>
      <HeartbeatDashboard
        hb={amp.heartbeat}
        mac={amp.mac}
        ratedRmsV={amp.ratedRmsV}
        channelParams={amp.channelParams}
        bridgePairs={amp.bridgePairs}
        outputChx={amp.output_chx}
        channelFlags={amp.channelFlags}
        sourceCapabilities={amp.sourceCapabilities}
        limiterLineVoltageOffset={ampOptions.limiterLineVoltageOffset}
      />
    </div>
  );
}
