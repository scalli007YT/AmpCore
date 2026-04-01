"use client";

import type { Amp, ChannelParam, AmpChannelConstants } from "@/stores/AmpStore";
import type { AmpOptions } from "@/stores/AmpOptionStore";
import { MatrixGrid } from "@/components/monitor/amp-tabs/matrix-grid";
import { LimiterBlock } from "@/components/monitor/amp-tabs/limiter-panel";
import { SourceConfigDialog } from "@/components/dialogs/source-config-dialog";
import { useI18n } from "@/components/layout/i18n-provider";

interface MatrixPanelProps {
  amp: Amp;
  effectiveChannels: ChannelParam[];
  effectiveChannelCount: number;
  effectiveChannelOhms: AmpChannelConstants[];
  ampOptions: AmpOptions;
}

export function MatrixPanel({
  amp,
  effectiveChannels,
  effectiveChannelCount,
  effectiveChannelOhms,
  ampOptions
}: MatrixPanelProps) {
  const dict = useI18n();

  if (!amp.channelParams) {
    return <p className="text-sm text-muted-foreground animate-pulse">{dict.monitor.ampTabs.waitingForData}</p>;
  }

  return (
    <div className="overflow-hidden rounded-md border border-border/50 bg-background/30 p-2.5">
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_1px_minmax(0,1fr)] xl:gap-3">
        <section className="flex min-h-[360px] flex-col gap-2">
          <div className="flex items-center justify-center gap-2">
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              {dict.monitor.ampTabs.matrix}
            </h3>
            <SourceConfigDialog channels={effectiveChannels} mac={amp.mac} capabilities={amp.sourceCapabilities} />
          </div>
          <div className="flex flex-1 items-center justify-center overflow-auto">
            <MatrixGrid
              channels={effectiveChannels}
              mac={amp.mac}
              analogInputCount={amp.sourceCapabilities?.analogInputCount}
            />
          </div>
        </section>

        <div className="hidden xl:block self-stretch w-px bg-border/60" />

        <section className="flex min-h-[360px] flex-col gap-2">
          <h3 className="text-center text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            {dict.monitor.ampTabs.limiters}
          </h3>
          <div className="flex flex-1 items-center justify-center">
            <LimiterBlock
              mac={amp.mac}
              ratedRmsV={amp.ratedRmsV}
              limiterLineVoltageOffset={ampOptions.limiterLineVoltageOffset}
              channelOhms={effectiveChannelOhms.map((channel) => channel.ohms)}
              bridgePairs={amp.bridgePairs}
              heartbeat={amp.heartbeat}
              channels={effectiveChannels}
              limiters={amp.heartbeat?.limiters.slice(0, effectiveChannelCount) ?? effectiveChannels.map(() => 0)}
              showTitle={false}
            />
          </div>
        </section>
      </div>
    </div>
  );
}
