"use client";

import { memo, useEffect, useMemo, useState } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ReferenceLine } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig
} from "@/components/ui/chart";
import { getValueHistory, getTempHistory, type HeartbeatSample, type TempSample } from "@/stores/ValueHistoryStore";
import { getChannelLabels } from "@/lib/channel-labels";

// ---------------------------------------------------------------------------
// Tuning
// ---------------------------------------------------------------------------

const REFRESH_MS = 1000;
const DISPLAY_POINTS = 80;
const TEMP_DISPLAY_POINTS = 80;

// ---------------------------------------------------------------------------
// Color palette
// ---------------------------------------------------------------------------

const CHANNEL_PALETTE = ["#60a5fa", "#34d399", "#fb923c", "#f472b6", "#a78bfa", "#facc15", "#38bdf8", "#4ade80"];
const PSU_COLOR = "#f87171";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtRelative(ms: number, nowMs: number): string {
  return `${Math.round((ms - nowMs) / 1000)}s`;
}

function fmtRelativeMin(ms: number, nowMs: number): string {
  const diffS = Math.round((ms - nowMs) / 1000);
  if (diffS === 0) return "0s";
  const absDiffS = Math.abs(diffS);
  const m = Math.floor(absDiffS / 60);
  const s = absDiffS % 60;
  return `-${m > 0 ? `${m}m` : ""}${s > 0 || m === 0 ? `${s}s` : ""}`;
}

function lastN<T>(arr: T[], max: number): T[] {
  return arr.length <= max ? arr.slice() : arr.slice(arr.length - max);
}

function buildConfig(keys: string[], colors: string[]): ChartConfig {
  return Object.fromEntries(keys.map((k, i) => [k, { label: k, color: colors[i % colors.length] }]));
}

// ---------------------------------------------------------------------------
// MetricChart
// ---------------------------------------------------------------------------

interface MetricChartProps {
  title: string;
  data: Record<string, number | string>[];
  keys: string[];
  config: ChartConfig;
  domain?: [number | "auto", number | "auto"];
  ticks?: number[];
  refLine?: number;
  formatY?: (v: number) => string;
  height?: number;
}

const MetricChart = memo(function MetricChart({
  title,
  data,
  keys,
  config,
  domain,
  ticks,
  refLine,
  formatY,
  height = 120
}: MetricChartProps) {
  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="px-4 pt-3 pb-1">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{title}</p>
      </div>
      <ChartContainer config={config} className="w-full" style={{ height }}>
        <LineChart data={data} margin={{ top: 2, right: 4, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border/40" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
            interval="preserveStartEnd"
            minTickGap={120}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            domain={domain ?? ["auto", "auto"]}
            ticks={ticks}
            tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
            tickFormatter={formatY}
            width={46}
            tickCount={ticks ? undefined : 4}
            tickLine={false}
            axisLine={false}
          />
          <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
          <ChartLegend content={<ChartLegendContent />} />
          {refLine !== undefined && <ReferenceLine y={refLine} stroke="hsl(var(--border))" strokeDasharray="4 2" />}
          {keys.map((key) => (
            <Line
              key={key}
              type="monotone"
              dataKey={key}
              stroke={`var(--color-${key})`}
              dot={false}
              isAnimationActive={false}
              strokeWidth={1.5}
            />
          ))}
        </LineChart>
      </ChartContainer>
    </div>
  );
});

// ---------------------------------------------------------------------------
// GraphsPanel
// ---------------------------------------------------------------------------

interface GraphsPanelProps {
  mac: string;
  outputChx?: number;
  ratedRmsV?: number;
}

export function GraphsPanel({ mac, outputChx }: GraphsPanelProps) {
  const [samples, setSamples] = useState<HeartbeatSample[]>(() => lastN(getValueHistory(mac), DISPLAY_POINTS));
  const [tempSamples, setTempSamples] = useState<TempSample[]>(() => lastN(getTempHistory(mac), TEMP_DISPLAY_POINTS));

  useEffect(() => {
    setSamples(lastN(getValueHistory(mac), DISPLAY_POINTS));
    setTempSamples(lastN(getTempHistory(mac), TEMP_DISPLAY_POINTS));
    const id = setInterval(() => {
      setSamples(lastN(getValueHistory(mac), DISPLAY_POINTS));
      setTempSamples(lastN(getTempHistory(mac), TEMP_DISPLAY_POINTS));
    }, REFRESH_MS);
    return () => clearInterval(id);
  }, [mac]);

  const chCount = outputChx && outputChx > 0 ? outputChx : (samples[0]?.outputVoltages.length ?? 1);
  const chLabels = useMemo(() => getChannelLabels(chCount), [chCount]);
  const tempKeys = useMemo(() => [...chLabels, "PSU"], [chLabels]);

  const chConfig = useMemo(() => buildConfig(chLabels, CHANNEL_PALETTE), [chLabels]);
  const tempConfig = useMemo(
    () => buildConfig(tempKeys, [...CHANNEL_PALETTE.slice(0, chCount), PSU_COLOR]),
    [tempKeys, chCount]
  );

  function toDb(v: number): number {
    return v > 0 ? Math.max(Math.round(Math.log10(v) * 200) / 10, -80) : -80;
  }

  const tempData = useMemo(() => {
    const now = tempSamples.length ? tempSamples[tempSamples.length - 1].t : Date.now();
    return tempSamples.map((s) => {
      const row: Record<string, number | string> = { label: fmtRelativeMin(s.t, now) };
      for (let i = 0; i < chCount; i++) row[chLabels[i]] = s.temperatures[i] ?? 0;
      row["PSU"] = s.temperatures[chCount] ?? 0;
      return row;
    });
  }, [tempSamples, chCount, chLabels]);

  const outVData = useMemo(() => {
    const now = samples.length ? samples[samples.length - 1].t : Date.now();
    return samples.map((s) => {
      const row: Record<string, number | string> = { label: fmtRelative(s.t, now) };
      for (let i = 0; i < chCount; i++) row[chLabels[i]] = Math.round((s.outputVoltages[i] ?? 0) * 10) / 10;
      return row;
    });
  }, [samples, chCount, chLabels]);

  const inDbData = useMemo(() => {
    const now = samples.length ? samples[samples.length - 1].t : Date.now();
    return samples.map((s) => {
      const row: Record<string, number | string> = { label: fmtRelative(s.t, now) };
      for (let i = 0; i < chCount; i++) row[chLabels[i]] = toDb(s.inputVoltages[i] ?? 0);
      return row;
    });
  }, [samples, chCount, chLabels]);

  const limitData = useMemo(() => {
    const now = samples.length ? samples[samples.length - 1].t : Date.now();
    return samples.map((s) => {
      const row: Record<string, number | string> = { label: fmtRelative(s.t, now) };
      for (let i = 0; i < chCount; i++) row[chLabels[i]] = -(s.limiters[i] ?? 0);
      return row;
    });
  }, [samples, chCount, chLabels]);

  if (samples.length === 0) {
    return (
      <p className="text-sm text-muted-foreground animate-pulse py-12 text-center">Waiting for heartbeat data...</p>
    );
  }

  return (
    <div className="flex flex-col gap-3 pb-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground px-1 pt-1">
        Real-time (~11 s)
      </p>

      <MetricChart
        title="Output Voltage (V)"
        data={outVData}
        keys={chLabels}
        config={chConfig}
        domain={["auto", "auto"]}
        formatY={(v) => `${v}V`}
      />
      <MetricChart
        title="Input Level (dBFS)"
        data={inDbData}
        keys={chLabels}
        config={chConfig}
        domain={[-80, 0]}
        ticks={[-80, -70, -60, -50, -40, -30, -20, -10, 0]}
        formatY={(v) => `${v}dB`}
      />
      <MetricChart
        title="Limiter Reduction (dB)"
        data={limitData}
        keys={chLabels}
        config={chConfig}
        domain={["auto", 0]}
        refLine={0}
        formatY={(v) => `${v}dB`}
      />

      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground px-1 mt-1">
        Temperature (20 min)
      </p>

      <MetricChart
        title="Temperature (°C)"
        data={tempData}
        keys={tempKeys}
        config={tempConfig}
        domain={[0, "auto"]}
        formatY={(v) => `${v}°`}
        height={140}
      />
    </div>
  );
}
