"use client";

import { useId, useRef, useState } from "react";
import type { EqBand } from "@/stores/AmpStore";
import { computeEqCurve, curveGainAtBand, EQ_BAND_SHORT_LABELS, EQ_FREQ_TICKS, formatFreq } from "@/lib/eq";
import { getEqFilterTypeCapabilities } from "@/lib/parse-channel-data";
import {
  CROSSOVER_FREQ_MAX_HZ,
  CROSSOVER_FREQ_MIN_HZ,
  EQ_BAND_GAIN_MAX_DB,
  EQ_BAND_GAIN_MIN_DB,
  EQ_BAND_Q_MAX,
  EQ_BAND_Q_MIN
} from "@/lib/constants";

type DragMode = "xy" | "x" | "y" | "q";

type DragState = {
  pointerId: number;
  bandIdx: number;
  mode: DragMode;
  startClientX: number;
  startFreq: number;
  startGain: number;
  startQ: number;
};

interface EqCurveChartProps {
  bands: EqBand[];
  interactive?: boolean;
  onBandPreviewChange?: (bandIdx: number, next: Partial<Pick<EqBand, "freq" | "gain" | "q">>) => void;
  onBandCommit?: (bandIdx: number, next: Partial<Pick<EqBand, "freq" | "gain" | "q">>) => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
}

/**
 * SVG-based parametric EQ frequency response chart.
 * Renders a filled curve with interactive band handles.
 * Uses CSS variables for theming — no hardcoded colors.
 */
export function EqCurveChart({
  bands,
  interactive = false,
  onBandPreviewChange,
  onBandCommit,
  onDragStart,
  onDragEnd
}: EqCurveChartProps) {
  const curveData = computeEqCurve(bands, 256);
  const [activeBand, setActiveBand] = useState<number | null>(null);
  const [hoverBand, setHoverBand] = useState<number | null>(null);
  const dragRef = useRef<DragState | null>(null);

  const yMin = -24;
  const yMax = 24;
  const yStep = 6;

  // Use viewBox for responsiveness — the SVG scales to fill its container
  const W = 800;
  const H = 360;
  const pad = { top: 24, right: 20, bottom: 32, left: 48 };
  const cw = W - pad.left - pad.right;
  const ch = H - pad.top - pad.bottom;

  const logMin = Math.log10(20);
  const logMax = Math.log10(20000);

  const xScale = (freq: number) => pad.left + ((Math.log10(Math.max(freq, 20)) - logMin) / (logMax - logMin)) * cw;
  const yScale = (db: number) => pad.top + ((yMax - Math.max(yMin, Math.min(yMax, db))) / (yMax - yMin)) * ch;
  const xToFreq = (x: number) => {
    const ratio = Math.max(0, Math.min(1, (x - pad.left) / cw));
    return 10 ** (logMin + ratio * (logMax - logMin));
  };
  const yToDb = (y: number) => {
    const ratio = Math.max(0, Math.min(1, (y - pad.top) / ch));
    return yMax - ratio * (yMax - yMin);
  };

  const toViewBoxPoint = (svg: SVGSVGElement, clientX: number, clientY: number) => {
    const rect = svg.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * W,
      y: ((clientY - rect.top) / rect.height) * H
    };
  };

  const clampFreq = (freq: number) => Math.max(CROSSOVER_FREQ_MIN_HZ, Math.min(CROSSOVER_FREQ_MAX_HZ, freq));
  const clampGain = (gain: number) => Math.max(EQ_BAND_GAIN_MIN_DB, Math.min(EQ_BAND_GAIN_MAX_DB, gain));
  const clampQ = (q: number) => Math.max(EQ_BAND_Q_MIN, Math.min(EQ_BAND_Q_MAX, q));

  const toRoundedFreq = (freq: number) => Math.round(clampFreq(freq));
  const toRoundedGain = (gain: number) => Math.round(clampGain(gain) * 10) / 10;
  const toRoundedQ = (q: number) => Math.round(clampQ(q) * 100) / 100;

  const emitPreview = (bandIdx: number, next: Partial<Pick<EqBand, "freq" | "gain" | "q">>) => {
    if (!onBandPreviewChange) return;
    onBandPreviewChange(bandIdx, next);
  };

  const emitCommit = (bandIdx: number, next: Partial<Pick<EqBand, "freq" | "gain" | "q">>) => {
    if (!onBandCommit) return;
    onBandCommit(bandIdx, next);
  };

  // Curve paths — use raw (unclamped) yScale for clipping to work correctly
  const yScaleRaw = (db: number) => pad.top + ((yMax - db) / (yMax - yMin)) * ch;

  const pathPoints = curveData.map((p) => `${xScale(p.freq)},${yScaleRaw(p.gain)}`);
  const linePath = `M${pathPoints.join("L")}`;
  const fillPath = `${linePath}L${xScale(20000)},${yScaleRaw(0)}L${xScale(20)},${yScaleRaw(0)}Z`;

  const clipId = useId();
  // Band markers
  const markers = bands.map((band, i) => ({
    idx: i,
    x: xScale(band.freq),
    y: yScale(curveGainAtBand(bands, i)),
    label: EQ_BAND_SHORT_LABELS[i],
    capabilities: getEqFilterTypeCapabilities(band.type),
    bypass: band.bypass
  }));

  const beginDrag = (event: React.PointerEvent<SVGElement>, bandIdx: number, mode: DragMode) => {
    if (!interactive) return;
    const band = bands[bandIdx];
    if (!band || band.bypass) return;

    const capabilities = getEqFilterTypeCapabilities(band.type);
    if (mode === "y" && !capabilities.supportsGain) return;
    if (mode === "q" && !capabilities.supportsQ) return;

    event.preventDefault();
    event.stopPropagation();

    setActiveBand(bandIdx);
    setHoverBand(bandIdx);
    onDragStart?.();
    dragRef.current = {
      pointerId: event.pointerId,
      bandIdx,
      mode,
      startClientX: event.clientX,
      startFreq: band.freq,
      startGain: band.gain,
      startQ: band.q
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    const band = bands[drag.bandIdx];
    if (!band) return;
    const capabilities = getEqFilterTypeCapabilities(band.type);
    const { x, y } = toViewBoxPoint(event.currentTarget, event.clientX, event.clientY);

    if (drag.mode === "xy") {
      const next: Partial<Pick<EqBand, "freq" | "gain" | "q">> = { freq: toRoundedFreq(xToFreq(x)) };
      if (capabilities.supportsGain) {
        next.gain = toRoundedGain(yToDb(y));
      }
      emitPreview(drag.bandIdx, next);
      return;
    }

    if (drag.mode === "x") {
      emitPreview(drag.bandIdx, { freq: toRoundedFreq(xToFreq(x)) });
      return;
    }

    if (drag.mode === "y") {
      if (capabilities.supportsGain) {
        emitPreview(drag.bandIdx, { gain: toRoundedGain(yToDb(y)) });
      }
      return;
    }

    const deltaX = event.clientX - drag.startClientX;
    emitPreview(drag.bandIdx, { q: toRoundedQ(drag.startQ + deltaX * 0.02) });
  };

  const endDrag = (event: React.PointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const band = bands[drag.bandIdx];
    if (band) {
      const capabilities = getEqFilterTypeCapabilities(band.type);
      if (drag.mode === "xy") {
        const { x, y } = toViewBoxPoint(event.currentTarget, event.clientX, event.clientY);
        const next: Partial<Pick<EqBand, "freq" | "gain" | "q">> = { freq: toRoundedFreq(xToFreq(x)) };
        if (capabilities.supportsGain) {
          next.gain = toRoundedGain(yToDb(y));
        }
        emitCommit(drag.bandIdx, next);
      } else if (drag.mode === "x") {
        const { x } = toViewBoxPoint(event.currentTarget, event.clientX, event.clientY);
        emitCommit(drag.bandIdx, { freq: toRoundedFreq(xToFreq(x)) });
      } else if (drag.mode === "y" && capabilities.supportsGain) {
        const { y } = toViewBoxPoint(event.currentTarget, event.clientX, event.clientY);
        emitCommit(drag.bandIdx, { gain: toRoundedGain(yToDb(y)) });
      } else if (drag.mode === "q" && capabilities.supportsQ) {
        const deltaX = event.clientX - drag.startClientX;
        emitCommit(drag.bandIdx, { q: toRoundedQ(drag.startQ + deltaX * 0.02) });
      }
    }
    dragRef.current = null;
    setActiveBand(null);
    onDragEnd?.();
  };

  // Y ticks
  const yTicks: number[] = [];
  for (let db = yMin; db <= yMax; db += yStep) yTicks.push(db);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full h-auto rounded-md border border-border/40 bg-muted/30"
      preserveAspectRatio="xMidYMid meet"
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onPointerLeave={() => {
        if (!dragRef.current) {
          setHoverBand(null);
          setActiveBand(null);
        }
      }}
    >
      <defs>
        <clipPath id={clipId}>
          <rect x={pad.left} y={pad.top} width={cw} height={ch} />
        </clipPath>
      </defs>
      {/* Horizontal grid lines */}
      {yTicks.map((db) => (
        <g key={`y${db}`}>
          <line
            x1={pad.left}
            x2={W - pad.right}
            y1={yScale(db)}
            y2={yScale(db)}
            className={db === 0 ? "stroke-border" : "stroke-border/80"}
            strokeWidth={db === 0 ? 1.5 : 0.5}
          />
          <text
            x={pad.left - 8}
            y={yScale(db)}
            textAnchor="end"
            dominantBaseline="middle"
            className="fill-muted-foreground"
            fontSize={11}
          >
            {db}
          </text>
        </g>
      ))}
      {/* Vertical grid lines */}
      {EQ_FREQ_TICKS.map((f) => (
        <g key={`x${f}`}>
          <line
            x1={xScale(f)}
            x2={xScale(f)}
            y1={pad.top}
            y2={H - pad.bottom}
            className="stroke-border/60"
            strokeWidth={0.5}
          />
          <text
            x={xScale(f)}
            y={H - pad.bottom + 16}
            textAnchor="middle"
            className="fill-muted-foreground"
            fontSize={11}
          >
            {formatFreq(f)}
          </text>
        </g>
      ))}
      {/* Axis labels */}
      <text x={8} y={pad.top - 8} className="fill-muted-foreground" fontSize={10}>
        dB
      </text>
      <text x={W - pad.right} y={H - 4} textAnchor="end" className="fill-muted-foreground" fontSize={10}>
        Hz
      </text>

      {/* Filled area under/above 0 dB */}
      <path d={fillPath} className="fill-primary/12" clipPath={`url(#${clipId})`} />
      {/* Curve line */}
      <path
        d={linePath}
        fill="none"
        className="stroke-primary"
        strokeWidth={2}
        strokeLinejoin="round"
        clipPath={`url(#${clipId})`}
      />

      {/* Band markers — placed at the band's Hz/dB point on the curve */}
      {markers.map((m, i) => {
        if (m.bypass) return null;
        const cx = Math.max(pad.left + 8, Math.min(W - pad.right - 8, m.x));
        const cy = Math.max(pad.top + 8, Math.min(H - pad.bottom - 8, m.y));
        const selected = activeBand === m.idx;
        const visible = selected || hoverBand === m.idx;
        const qCanAdjust = m.capabilities.supportsQ;
        const gainCanAdjust = m.capabilities.supportsGain;

        if (!interactive) {
          return (
            <g key={i}>
              <circle cx={cx} cy={cy} r={6} className="fill-background stroke-primary/70" strokeWidth={1} />
            </g>
          );
        }

        return (
          <g key={i} className="select-none">
            <circle
              cx={cx}
              cy={cy}
              r={12}
              fill="transparent"
              onMouseEnter={() => setHoverBand(m.idx)}
              style={{ outline: "none", cursor: "pointer" }}
            />
            <polygon
              points={`${cx},${cy - 6} ${cx + 6},${cy} ${cx},${cy + 6} ${cx - 6},${cy}`}
              className={selected ? "fill-primary/35 stroke-primary" : "fill-primary/20 stroke-primary/80"}
              strokeWidth={1}
              onPointerDown={(e) => beginDrag(e, m.idx, "xy")}
              onMouseEnter={() => setHoverBand(m.idx)}
              style={{ cursor: gainCanAdjust ? "move" : "ew-resize" }}
            />
            {!visible ? null : (
              <>
                <line
                  x1={cx - 13}
                  y1={cy}
                  x2={cx + 13}
                  y2={cy}
                  className={selected ? "stroke-primary/90" : "stroke-primary/55"}
                  strokeWidth={1}
                />
                <line
                  x1={cx}
                  y1={cy - 13}
                  x2={cx}
                  y2={cy + 13}
                  className={selected ? "stroke-primary/90" : "stroke-primary/55"}
                  strokeWidth={1}
                />
                <circle
                  cx={cx - 13}
                  cy={cy}
                  r={3.5}
                  className="fill-background stroke-primary/80"
                  strokeWidth={1}
                  onPointerDown={(e) => beginDrag(e, m.idx, "x")}
                  style={{ cursor: "ew-resize" }}
                />
                <circle
                  cx={cx + 13}
                  cy={cy}
                  r={3.5}
                  className="fill-background stroke-primary/80"
                  strokeWidth={1}
                  onPointerDown={(e) => beginDrag(e, m.idx, "x")}
                  style={{ cursor: "ew-resize" }}
                />
                <circle
                  cx={cx}
                  cy={cy - 13}
                  r={3.5}
                  className={
                    gainCanAdjust ? "fill-background stroke-primary/80" : "fill-muted stroke-muted-foreground/50"
                  }
                  strokeWidth={1}
                  onPointerDown={(e) => beginDrag(e, m.idx, "y")}
                  style={{ cursor: gainCanAdjust ? "ns-resize" : "not-allowed" }}
                />
                <circle
                  cx={cx}
                  cy={cy + 13}
                  r={3.5}
                  className={
                    gainCanAdjust ? "fill-background stroke-primary/80" : "fill-muted stroke-muted-foreground/50"
                  }
                  strokeWidth={1}
                  onPointerDown={(e) => beginDrag(e, m.idx, "y")}
                  style={{ cursor: gainCanAdjust ? "ns-resize" : "not-allowed" }}
                />
                <circle
                  cx={cx - 5}
                  cy={cy - 18}
                  r={2.5}
                  className={qCanAdjust ? "fill-primary/80" : "fill-muted-foreground/40"}
                  onPointerDown={(e) => beginDrag(e, m.idx, "q")}
                  style={{ cursor: qCanAdjust ? "ew-resize" : "not-allowed" }}
                />
                <circle
                  cx={cx + 5}
                  cy={cy - 18}
                  r={2.5}
                  className={qCanAdjust ? "fill-primary/80" : "fill-muted-foreground/40"}
                  onPointerDown={(e) => beginDrag(e, m.idx, "q")}
                  style={{ cursor: qCanAdjust ? "ew-resize" : "not-allowed" }}
                />
                <text x={cx} y={cy + 25} textAnchor="middle" className="fill-muted-foreground" fontSize={9}>
                  {m.label}
                </text>
              </>
            )}
          </g>
        );
      })}
    </svg>
  );
}
