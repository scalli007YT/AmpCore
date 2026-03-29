"use client";

import { useState } from "react";
import type { HeartbeatData, ChannelParams, BridgeReadback, ChannelFlags } from "@/stores/AmpStore";
import { useAmpActions } from "@/hooks/useAmpActions";
import { useVuMeters } from "@/hooks/useVuMeters";
import { getStoredAmpLinkConfig, useAmpActionLinkStore } from "@/stores/AmpActionLinkStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ConfirmActionDialog } from "@/components/dialogs/confirm-action-dialog";
import { EqBandDialog } from "@/components/monitor/amp-tabs/eq-controls";
import { FirFilterDialog } from "@/components/monitor/fir-filter-panel";
import { HorizontalDbMeter } from "@/components/monitor/horizontal-db-meter";
import { COLORS } from "@/lib/colors";
import {
  CHANNEL_NAME_MAX_LENGTH,
  OUTPUT_TRIM_MAX_DB,
  OUTPUT_TRIM_MIN_DB,
  OUTPUT_VOLUME_MAX_DB,
  OUTPUT_VOLUME_MIN_DB
} from "@/lib/constants";
import { getLinkedChannels, type LinkScope } from "@/lib/amp-action-linking";
import { getChannelLabels } from "@/lib/channel-labels";
import { convertDelayUnits, type DelayUnit, voltageToMeterDb, rmsToPeakVoltage, formatDbfs } from "@/lib/generic";
import { getPowerModeName } from "@/lib/parse-channel-data";
import { useI18n } from "@/components/layout/i18n-provider";
import { Volume1, VolumeX, Circle, CircleSlash, Pencil } from "lucide-react";

const POWER_MODE_OPTIONS = [0, 1, 2] as const;
type BridgePair = number;

type DelayDraft = {
  ms: string;
  meters: string;
  feet: string;
};

function formatDelayDraft(ms: number): DelayDraft {
  const converted = convertDelayUnits(ms, "ms");

  return {
    ms: converted.ms.toLocaleString("en-US", { maximumFractionDigits: 1 }),
    meters: converted.meters.toLocaleString("en-US", { maximumFractionDigits: 2 }),
    feet: converted.feet.toLocaleString("en-US", { maximumFractionDigits: 2 })
  };
}

function parseDraftNumber(raw: string): number | null {
  const normalized = raw.trim().replace(",", ".");
  if (normalized.length === 0) return null;

  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function DelayPopover({
  delayMs,
  maxMs,
  label,
  onSet,
  buttonClassName,
  onButtonMouseEnter,
  onButtonMouseLeave,
  onButtonFocus,
  onButtonBlur
}: {
  delayMs: number | undefined;
  maxMs: number;
  label: string;
  onSet: (ms: number) => void | Promise<void>;
  buttonClassName?: string;
  onButtonMouseEnter?: () => void;
  onButtonMouseLeave?: () => void;
  onButtonFocus?: () => void;
  onButtonBlur?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DelayDraft>(() => formatDelayDraft(delayMs ?? 0));

  const maxDelayUnits = convertDelayUnits(maxMs, "ms");

  const handleOpen = (next: boolean) => {
    if (next) {
      setDraft(formatDelayDraft(delayMs ?? 0));
    }
    setOpen(next);
  };

  const commit = () => {
    const parsedMs = parseDraftNumber(draft.ms);
    if (parsedMs === null || parsedMs < 0) return;

    const clampedMs = Math.min(maxMs, parsedMs);
    setDraft(formatDelayDraft(clampedMs));
    void onSet(clampedMs);
    setOpen(false);
  };

  const updateDraft = (unit: DelayUnit, rawValue: string) => {
    const parsed = parseDraftNumber(rawValue);

    if (parsed === null) {
      setDraft((prev) => ({ ...prev, [unit]: rawValue }));
      return;
    }

    if (parsed < 0) return;

    const nextMs = Math.min(maxMs, convertDelayUnits(parsed, unit).ms);
    setDraft(formatDelayDraft(nextMs));
  };

  const active = delayMs !== undefined && delayMs > 0;

  return (
    <Popover open={open} onOpenChange={handleOpen}>
      <PopoverTrigger asChild>
        <button
          onMouseEnter={onButtonMouseEnter}
          onMouseLeave={onButtonMouseLeave}
          onFocus={onButtonFocus}
          onBlur={onButtonBlur}
          className={`flex h-12 flex-col items-center justify-center w-full rounded border px-1.5 py-1 select-none transition-colors ${
            delayMs === undefined
              ? "border-border/30 bg-muted/10 opacity-40 pointer-events-none"
              : active
                ? "border-sky-500/65 bg-muted/30 hover:border-sky-400/80"
                : "border-border/65 bg-muted/25 hover:border-sky-500/45 hover:bg-muted/40"
          } ${buttonClassName ?? ""}`}
        >
          <span
            className={`font-mono text-[13px] font-semibold tabular-nums leading-none ${active ? "text-sky-600 dark:text-sky-300" : "text-foreground/90"}`}
          >
            {delayMs !== undefined ? delayMs.toFixed(1) : "~"}
          </span>
          <span className="text-[9px] mt-0.5 tracking-wide text-muted-foreground">{label}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-0" side="right" align="center">
        <div className="flex items-center justify-between border-b border-border/60 px-3 py-2">
          <span className="text-xs font-semibold">Delay</span>
          <span className="text-[10px] text-muted-foreground">0 - {maxMs} ms</span>
        </div>
        <div className="px-3 py-3 space-y-2">
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5">
              <Input
                autoFocus
                type="number"
                min={0}
                max={maxMs}
                step={0.1}
                value={draft.ms}
                onChange={(e) => updateDraft("ms", e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commit();
                  if (e.key === "Escape") setOpen(false);
                }}
                className="h-8 text-sm font-mono tabular-nums"
              />
              <span className="text-xs text-muted-foreground shrink-0 w-7">ms</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Input
                type="number"
                min={0}
                max={maxDelayUnits.meters}
                step={0.01}
                value={draft.meters}
                onChange={(e) => updateDraft("meters", e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commit();
                  if (e.key === "Escape") setOpen(false);
                }}
                className="h-8 text-sm font-mono tabular-nums"
              />
              <span className="text-xs text-muted-foreground shrink-0 w-7">m</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Input
                type="number"
                min={0}
                max={maxDelayUnits.feet}
                step={0.01}
                value={draft.feet}
                onChange={(e) => updateDraft("feet", e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commit();
                  if (e.key === "Escape") setOpen(false);
                }}
                className="h-8 text-sm font-mono tabular-nums"
              />
              <span className="text-xs text-muted-foreground shrink-0 w-7">ft</span>
            </div>
          </div>
          <div className="flex gap-1.5">
            <Button size="sm" className="flex-1 h-7 text-xs" onClick={commit}>
              Set
            </Button>
            <Button size="sm" variant="outline" className="flex-1 h-7 text-xs" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function VolumePopover({
  volumeDb,
  label,
  title,
  minDb,
  maxDb,
  onSet,
  buttonClassName,
  onButtonMouseEnter,
  onButtonMouseLeave,
  onButtonFocus,
  onButtonBlur
}: {
  volumeDb: number | undefined;
  label: string;
  title: string;
  minDb: number;
  maxDb: number;
  onSet: (db: number) => void | Promise<void>;
  buttonClassName?: string;
  onButtonMouseEnter?: () => void;
  onButtonMouseLeave?: () => void;
  onButtonFocus?: () => void;
  onButtonBlur?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [inputVal, setInputVal] = useState("");
  const hasValue = volumeDb !== undefined;

  const handleOpen = (next: boolean) => {
    if (next) {
      setInputVal(volumeDb !== undefined ? volumeDb.toLocaleString("en-US", { maximumFractionDigits: 1 }) : "0");
    }
    setOpen(next);
  };

  const commit = () => {
    const parsed = Number.parseFloat(inputVal.replace(",", "."));
    if (!Number.isFinite(parsed)) return;
    const clamped = Math.max(minDb, Math.min(maxDb, parsed));
    setInputVal(clamped.toLocaleString("en-US", { maximumFractionDigits: 1 }));
    void onSet(clamped);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={handleOpen}>
      <PopoverTrigger asChild>
        <button
          onMouseEnter={onButtonMouseEnter}
          onMouseLeave={onButtonMouseLeave}
          onFocus={onButtonFocus}
          onBlur={onButtonBlur}
          className={`flex h-12 flex-col items-center justify-center w-full rounded border px-1.5 py-1 select-none transition-colors ${
            volumeDb === undefined
              ? "border-border/30 bg-muted/10 opacity-40 pointer-events-none"
              : "border-border/65 bg-muted/25 hover:border-cyan-500/45 hover:bg-muted/40"
          } ${buttonClassName ?? ""}`}
        >
          <span
            className={`font-mono text-[13px] font-semibold tabular-nums leading-none ${hasValue ? "text-cyan-700 dark:text-cyan-300" : "text-foreground/90"}`}
          >
            {volumeDb !== undefined ? volumeDb.toFixed(1) : "~"}
          </span>
          <span className="text-[9px] mt-0.5 tracking-wide text-muted-foreground">{label}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-44 p-0" side="right" align="center">
        <div className="flex items-center justify-between border-b border-border/60 px-3 py-2">
          <span className="text-xs font-semibold">{title}</span>
          <span className="text-[10px] text-muted-foreground">dB</span>
        </div>
        <div className="px-3 py-3 space-y-2">
          <div className="flex items-center gap-1.5">
            <Input
              autoFocus
              type="number"
              min={minDb}
              max={maxDb}
              step={0.1}
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commit();
                if (e.key === "Escape") setOpen(false);
              }}
              className="h-8 text-sm font-mono tabular-nums"
            />
            <span className="text-xs text-muted-foreground shrink-0 w-5">dB</span>
          </div>
          <div className="flex gap-1.5">
            <Button size="sm" className="flex-1 h-7 text-xs" onClick={commit}>
              Set
            </Button>
            <Button size="sm" variant="outline" className="flex-1 h-7 text-xs" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function DbPopover({
  valueDb,
  label,
  title,
  minDb,
  maxDb,
  onSet,
  buttonClassName,
  onButtonMouseEnter,
  onButtonMouseLeave,
  onButtonFocus,
  onButtonBlur
}: {
  valueDb: number | undefined;
  label: string;
  title: string;
  minDb: number;
  maxDb: number;
  onSet: (db: number) => void | Promise<void>;
  buttonClassName?: string;
  onButtonMouseEnter?: () => void;
  onButtonMouseLeave?: () => void;
  onButtonFocus?: () => void;
  onButtonBlur?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [inputVal, setInputVal] = useState("");

  const handleOpen = (next: boolean) => {
    if (next) {
      setInputVal(valueDb !== undefined ? valueDb.toLocaleString("en-US", { maximumFractionDigits: 1 }) : "0");
    }
    setOpen(next);
  };

  const commit = () => {
    const parsed = Number.parseFloat(inputVal.replace(",", "."));
    if (!Number.isFinite(parsed)) return;
    void onSet(Math.max(minDb, Math.min(maxDb, parsed)));
    setOpen(false);
  };

  const active = valueDb !== undefined && valueDb !== 0;

  return (
    <Popover open={open} onOpenChange={handleOpen}>
      <PopoverTrigger asChild>
        <button
          onMouseEnter={onButtonMouseEnter}
          onMouseLeave={onButtonMouseLeave}
          onFocus={onButtonFocus}
          onBlur={onButtonBlur}
          className={`flex h-12 flex-col items-center justify-center w-full rounded border px-1.5 py-1 select-none transition-colors ${
            valueDb === undefined
              ? "border-border/30 bg-muted/10 opacity-40 pointer-events-none"
              : active
                ? "border-amber-500/65 bg-muted/30 hover:border-amber-400/80"
                : "border-border/65 bg-muted/25 hover:border-amber-500/45 hover:bg-muted/40"
          } ${buttonClassName ?? ""}`}
        >
          <span
            className={`font-mono text-[13px] font-semibold tabular-nums leading-none ${active ? "text-amber-600 dark:text-amber-300" : "text-foreground/90"}`}
          >
            {valueDb !== undefined ? valueDb.toFixed(1) : "~"}
          </span>
          <span className="text-[9px] mt-0.5 tracking-wide text-muted-foreground">{label}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-44 p-0" side="right" align="center">
        <div className="flex items-center justify-between border-b border-border/60 px-3 py-2">
          <span className="text-xs font-semibold">{title}</span>
          <span className="text-[10px] text-muted-foreground">
            {minDb} - {maxDb} dB
          </span>
        </div>
        <div className="px-3 py-3 space-y-2">
          <div className="flex items-center gap-1.5">
            <Input
              autoFocus
              type="number"
              min={minDb}
              max={maxDb}
              step={0.1}
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commit();
                if (e.key === "Escape") setOpen(false);
              }}
              className="h-8 text-sm font-mono tabular-nums"
            />
            <span className="text-xs text-muted-foreground shrink-0 w-5">dB</span>
          </div>
          <div className="flex gap-1.5">
            <Button size="sm" className="flex-1 h-7 text-xs" onClick={commit}>
              Set
            </Button>
            <Button size="sm" variant="outline" className="flex-1 h-7 text-xs" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function PowerModePill({
  mode,
  channelLabel,
  onConfirm,
  triggerClassName,
  onTriggerMouseEnter,
  onTriggerMouseLeave,
  onTriggerFocus,
  onTriggerBlur
}: {
  mode: number | undefined;
  channelLabel: string;
  onConfirm: (mode: number) => void | Promise<void>;
  triggerClassName?: string;
  onTriggerMouseEnter?: () => void;
  onTriggerMouseLeave?: () => void;
  onTriggerFocus?: () => void;
  onTriggerBlur?: () => void;
}) {
  const dict = useI18n();
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingMode, setPendingMode] = useState<number | null>(null);

  const currentMode = mode ?? 0;
  const nextMode = pendingMode ?? currentMode;

  const requestModeChange = (value: string) => {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isInteger(parsed) || parsed === currentMode) return;
    setMenuOpen(false);
    setPendingMode(parsed);
    setConfirmOpen(true);
  };

  const handleConfirm = () => {
    if (pendingMode === null) return;
    void onConfirm(pendingMode);
    setConfirmOpen(false);
    setPendingMode(null);
  };

  const handleConfirmOpen = (open: boolean) => {
    setConfirmOpen(open);
    if (!open) setPendingMode(null);
  };

  return (
    <>
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            disabled={mode === undefined}
            onMouseEnter={onTriggerMouseEnter}
            onMouseLeave={onTriggerMouseLeave}
            onFocus={onTriggerFocus}
            onBlur={onTriggerBlur}
            className={`flex h-12 w-full flex-col items-center justify-center rounded border px-1.5 py-1 select-none transition-colors disabled:pointer-events-none disabled:opacity-50 ${
              mode === undefined
                ? "border-border/30 bg-muted/10 text-muted-foreground/30"
                : "border-border/65 bg-muted/25 text-foreground/85 hover:border-primary/45 hover:bg-muted/40"
            } ${triggerClassName ?? ""}`}
          >
            <span className="font-mono text-[13px] font-semibold tabular-nums leading-none">
              {mode === undefined ? "~" : getPowerModeName(currentMode)}
            </span>
            <span className="mt-0.5 text-[9px] leading-none tracking-wide text-muted-foreground">Mode</span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center" className="w-44">
          <DropdownMenuLabel>{dict.dialogs.heartbeat.outputPowerMode}</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={String(currentMode)} onValueChange={requestModeChange}>
            {POWER_MODE_OPTIONS.map((option) => (
              <DropdownMenuRadioItem key={option} value={String(option)}>
                {getPowerModeName(option)}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <ConfirmActionDialog
        open={confirmOpen}
        onOpenChange={handleConfirmOpen}
        title={dict.dialogs.heartbeat.changePowerModeTitle}
        description={dict.dialogs.heartbeat.changePowerModeDescription
          .replace("{channel}", channelLabel)
          .replace("{mode}", getPowerModeName(nextMode))}
        confirmLabel={dict.dialogs.heartbeat.changePowerModeConfirm}
        onConfirm={handleConfirm}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Inline editable channel name label
// ---------------------------------------------------------------------------

function EditableChannelName({
  name,
  fallback,
  active,
  onRename,
  className
}: {
  name: string | undefined;
  fallback: string;
  active: boolean;
  onRename: (newName: string) => Promise<void>;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const displayName = name ?? fallback;

  const startEdit = () => {
    setDraft(displayName);
    setEditing(true);
  };

  const commit = async () => {
    setEditing(false);
    const trimmed = draft.trim();
    if (trimmed && trimmed !== displayName) {
      await onRename(trimmed);
    }
  };

  if (editing) {
    return (
      <input
        type="text"
        autoFocus
        maxLength={CHANNEL_NAME_MAX_LENGTH}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => void commit()}
        onKeyDown={(e) => {
          if (e.key === "Enter") void commit();
          if (e.key === "Escape") setEditing(false);
        }}
        className={`text-[10px] font-semibold leading-none bg-transparent border-b border-primary outline-none w-32 ${className ?? ""}`}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={startEdit}
      className={`group relative inline-flex items-center text-[10px] font-semibold leading-none hover:underline cursor-pointer ${
        active ? "text-primary" : "text-muted-foreground/70"
      } ${className ?? ""}`}
    >
      {displayName}
      <Pencil className="pointer-events-none absolute left-full top-1/2 ml-1 h-2.5 w-2.5 -translate-y-1/2 opacity-0 transition-opacity group-hover:opacity-60" />
    </button>
  );
}

function outDbScale(): { top: number; bot: number; ticks: number[] } {
  return { top: 0, bot: -40, ticks: [-40, -32, -24, -16, -8, 0] };
}

const IN_DB_TOP = 0;
const IN_DB_BOT = -60;
const IN_SCALE = [-60, -48, -36, -24, -12, 0];

const FLAG_DEFS: { key: keyof ChannelFlags; label: string; color: string }[] = [
  { key: "fault", label: "Fault", color: "border-red-500/60 bg-red-500/15 text-red-400" },
  { key: "load", label: "Load", color: "border-amber-500/60 bg-amber-500/15 text-amber-400" },
  { key: "open", label: "Open", color: "border-orange-500/60 bg-orange-500/15 text-orange-400" },
  { key: "temp", label: "Temp", color: "border-red-500/60 bg-red-500/15 text-red-400" },
  { key: "clip", label: "Clip", color: "border-yellow-500/60 bg-yellow-500/15 text-yellow-400" },
  { key: "standby", label: "Standby", color: "border-blue-500/60 bg-blue-500/15 text-blue-400" },
  { key: "hiZ", label: "Hi Z", color: "border-purple-500/60 bg-purple-500/15 text-purple-400" },
  { key: "bridged", label: "Bridged", color: "border-emerald-500/60 bg-emerald-500/15 text-emerald-400" }
];

function ChannelFlagPills({ flags }: { flags?: ChannelFlags }) {
  if (!flags) return null;
  const active = FLAG_DEFS.filter((d) => flags[d.key] === true);
  if (active.length === 0) return null;
  return (
    <>
      {active.map((d) => (
        <span
          key={d.key}
          className={`inline-flex items-center rounded-full border px-1.5 py-px text-[9px] font-semibold leading-tight ${d.color}`}
        >
          {d.label}
        </span>
      ))}
    </>
  );
}

export function HeartbeatDashboard({
  hb,
  mac,
  ratedRmsV,
  channelParams,
  bridgePairs,
  outputChx,
  channelFlags
}: {
  hb: HeartbeatData;
  mac: string;
  ratedRmsV?: number;
  channelParams?: ChannelParams;
  bridgePairs?: BridgeReadback[];
  outputChx?: number;
  channelFlags?: ChannelFlags[];
}) {
  const dict = useI18n();
  const byMac = useAmpActionLinkStore((state) => state.byMac);
  const linkConfig = getStoredAmpLinkConfig(byMac, mac);
  const f1 = (n: number) => n.toFixed(1);
  const f0 = (n: number) => n.toFixed(0);

  const vu = useVuMeters(mac);
  const {
    setBridgePair,
    muteIn,
    muteOut,
    invertPolarityOut,
    noiseGateOut,
    setVolumeOut,
    setDelayIn,
    setDelayOut,
    setTrimOut,
    setPowerModeOut,
    renameInput,
    renameOutput
  } = useAmpActions();

  const vuOutputDbu = vu?.outputDbu ?? hb.outputDbu.map(() => null);
  const vuInputDbfs = vu?.inputDbfs ?? hb.inputDbfs;
  const { top: OUT_DB_TOP, bot: OUT_DB_BOT, ticks: OUT_SCALE } = outDbScale();

  const LABEL_H = 24;
  // Authoritative channel count: prefer discovery (outputChx) > FC=27 (channelParams) > heartbeat arrays
  const channelCount =
    outputChx && outputChx > 0
      ? outputChx
      : channelParams?.channels.length && channelParams.channels.length > 0
        ? channelParams.channels.length
        : Math.max(hb.outputStates.length, hb.inputStates.length, hb.outputVoltages.length, hb.inputDbfs.length, 1);
  const channelLabels = getChannelLabels(channelCount);
  const outputPairCount = Math.ceil(channelLabels.length / 2);
  const [bridgeConfirmOpen, setBridgeConfirmOpen] = useState(false);
  const [bridgeBusy, setBridgeBusy] = useState(false);
  const [pendingBridgePair, setPendingBridgePair] = useState<BridgePair | null>(null);
  const [pendingBridgeNext, setPendingBridgeNext] = useState<boolean | null>(null);
  const [hoveredLink, setHoveredLink] = useState<{ scope: LinkScope; channel: number } | null>(null);

  const getLinkHoverProps = (scope: LinkScope, channel: number) => ({
    onMouseEnter: () => setHoveredLink({ scope, channel }),
    onMouseLeave: () => setHoveredLink(null),
    onFocus: () => setHoveredLink({ scope, channel }),
    onBlur: () => setHoveredLink(null)
  });

  const isLinkedHovered = (scope: LinkScope, channel: number) => {
    if (!hoveredLink || hoveredLink.scope !== scope) return false;
    return getLinkedChannels(linkConfig, scope, hoveredLink.channel).includes(channel);
  };

  const linkedHoverClass = (scope: LinkScope, channel: number, hoverClass: string) =>
    isLinkedHovered(scope, channel) ? hoverClass : "";

  const pairBridgeState = (pair: number) => bridgePairs?.[pair]?.bridged ?? null;

  const effectivePairBridgeState = (pair: number) => {
    if (bridgeBusy && pendingBridgePair !== null && pendingBridgeNext !== null && pendingBridgePair === pair) {
      return pendingBridgeNext;
    }

    return pairBridgeState(pair);
  };

  const requestBridgeToggle = (pairIndex: number) => {
    const currentState = effectivePairBridgeState(pairIndex);
    if (currentState === null) return;

    setPendingBridgePair(pairIndex);
    setPendingBridgeNext(!currentState);
    setBridgeConfirmOpen(true);
  };

  const handleBridgeDialogOpen = (open: boolean) => {
    if (bridgeBusy) return;
    setBridgeConfirmOpen(open);
    if (!open) {
      setPendingBridgePair(null);
      setPendingBridgeNext(null);
    }
  };

  const handleConfirmBridge = async () => {
    if (pendingBridgePair === null || pendingBridgeNext === null) return;

    setBridgeBusy(true);
    try {
      await setBridgePair(mac, pendingBridgePair, pendingBridgeNext);
    } finally {
      setBridgeBusy(false);
      setBridgeConfirmOpen(false);
      setPendingBridgePair(null);
      setPendingBridgeNext(null);
    }
  };

  const isBridgedSecondColumn = (channelIndex: number) => {
    if (channelIndex % 2 === 0) return false;
    const pairIndex = Math.floor(channelIndex / 2);
    return effectivePairBridgeState(pairIndex) === true;
  };

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex flex-col gap-4 text-xs select-none w-full">
        <section className="flex flex-col gap-1.5">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Input</h3>
          <div className="rounded-lg border border-border/40 bg-muted/5 p-3 overflow-x-auto">
            <div className="flex min-w-fit flex-col gap-2">
              {channelLabels.map((_, i) => {
                const dbfsVal = vuInputDbfs[i];
                const hasSignal = hb.inputStates[i] === 0;
                const isLimit = dbfsVal !== null && dbfsVal > -1;
                return (
                  <div key={i} className="relative">
                    <div className="absolute left-2 top-1 z-10">
                      <EditableChannelName
                        name={channelParams?.channels[i]?.inputName}
                        fallback={`In${i + 1}`}
                        active={hasSignal}
                        onRename={(newName) => renameInput(mac, i, newName)}
                        className="rounded border border-border/50 bg-card/90 px-1.5 py-0.5"
                      />
                    </div>
                    <div className="flex items-center gap-2 rounded-md border border-border/30 bg-muted/5 px-2.5 pb-2 pt-4">
                      <div className="flex flex-col shrink-0" style={{ width: 220 }}>
                        <HorizontalDbMeter
                          value={dbfsVal}
                          dbTop={IN_DB_TOP}
                          dbBottom={IN_DB_BOT}
                          limit={isLimit}
                          width={220}
                          height={28}
                        />
                        <div className="flex justify-between mt-0.5 px-px" style={{ width: 220 }}>
                          {IN_SCALE.map((t) => (
                            <span key={t} className="text-[9px] text-foreground/50 leading-none tabular-nums font-mono">
                              {t}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div
                        className={`flex h-12 w-16 shrink-0 flex-col items-center justify-center rounded border px-1 ${
                          hasSignal ? "border-green-500/40 bg-green-500/10" : "border-border/40 bg-muted/20 opacity-60"
                        }`}
                      >
                        <span className="font-mono text-[13px] font-semibold tabular-nums leading-none">
                          {formatDbfs(dbfsVal)}
                        </span>
                        <span className="text-[9px] text-foreground/65 mt-0.5">dBFS</span>
                      </div>

                      <div className="flex h-12 w-16 shrink-0 select-none flex-col items-center justify-center rounded border border-border/30 bg-muted/10 px-1 text-muted-foreground/55 pointer-events-none">
                        <span className="font-mono text-[13px] font-semibold tabular-nums leading-none">
                          {channelParams?.channels[i]?.gainIn ?? "~"}
                        </span>
                        <span className="text-[9px] text-muted-foreground/75 mt-0.5">Gain dB</span>
                      </div>

                      {(() => {
                        const muted = channelParams?.channels[i]?.muteIn;
                        const canClick = muted !== undefined;
                        return (
                          <button
                            type="button"
                            disabled={!canClick}
                            {...getLinkHoverProps("muteIn", i)}
                            onClick={() => canClick && void muteIn(mac, i, !muted)}
                            className={`flex h-12 w-16 shrink-0 flex-col items-center justify-center rounded border px-1 py-0.5 select-none transition-colors disabled:pointer-events-none disabled:opacity-50 ${
                              muted === true
                                ? "border-destructive/65 bg-destructive/15 text-destructive hover:bg-destructive/20"
                                : muted === false
                                  ? "border-border/50 bg-muted/20 text-foreground/80 hover:border-destructive/45 hover:text-destructive"
                                  : "border-border/30 bg-muted/10 text-muted-foreground/40"
                            } ${linkedHoverClass("muteIn", i, muted === false ? "border-destructive/40 text-destructive/70" : "")}`}
                          >
                            {muted === true ? (
                              <VolumeX className="w-5 h-5" />
                            ) : muted === false ? (
                              <Volume1 className="w-5 h-5" />
                            ) : (
                              <span className="font-mono text-[13px] font-semibold">~</span>
                            )}
                            <span className="text-[9px] leading-none text-muted-foreground mt-0.5">Mute</span>
                          </button>
                        );
                      })()}

                      <div className="w-16 shrink-0">
                        <DelayPopover
                          delayMs={channelParams?.channels[i]?.delayIn}
                          maxMs={100}
                          label="ms in"
                          buttonClassName="!h-12 text-[13px]"
                          onSet={(ms) => setDelayIn(mac, i, ms)}
                        />
                      </div>

                      <div className="w-16 shrink-0">
                        <EqBandDialog
                          triggerLabel="EQ In"
                          title={`Input EQ - ${channelParams?.channels[i]?.inputName ?? channelLabels[i] ?? i + 1}`}
                          triggerClassName={`!h-12 ${linkedHoverClass("inputEq", i, "ring-1 ring-purple-500/40")}`}
                          onTriggerMouseEnter={getLinkHoverProps("inputEq", i).onMouseEnter}
                          onTriggerMouseLeave={getLinkHoverProps("inputEq", i).onMouseLeave}
                          onTriggerFocus={getLinkHoverProps("inputEq", i).onFocus}
                          onTriggerBlur={getLinkHoverProps("inputEq", i).onBlur}
                          mac={mac}
                          channel={i}
                          target="input"
                          bands={channelParams?.channels[i]?.eqIn}
                          allChannelBands={channelParams?.channels.map((c) => c?.eqIn)}
                          channelCount={channelCount}
                          channelNames={channelParams?.channels.map((c) => c?.inputName)}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section className="flex flex-col gap-1.5">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Output</h3>
          <div className="rounded-lg border border-border/40 bg-muted/5 p-3 overflow-x-auto">
            <div className="flex min-w-fit flex-col gap-2">
              {Array.from({ length: outputPairCount }).map((_, pairIndex) => {
                const firstChannel = pairIndex * 2;
                const secondChannel = firstChannel + 1;
                const bridgeState = effectivePairBridgeState(pairIndex);
                const bridgeLabel = bridgeState === true ? "ON" : bridgeState === false ? "OFF" : "?";

                return (
                  <div key={pairIndex} className="flex items-stretch gap-1">
                    <button
                      type="button"
                      disabled={bridgeState === null || bridgeBusy}
                      onClick={() => requestBridgeToggle(pairIndex)}
                      className={`shrink-0 w-6 rounded-md border text-[8px] font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50 flex items-center justify-center ${
                        bridgeState === true
                          ? "border-emerald-500/60 bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25"
                          : "border-border/40 bg-muted/15 text-muted-foreground/70 hover:border-border/60 hover:bg-muted/25"
                      }`}
                    >
                      <span className="[writing-mode:vertical-lr] rotate-180 whitespace-nowrap tracking-wide">
                        {channelLabels[firstChannel]}/{channelLabels[secondChannel]} {bridgeLabel}
                      </span>
                    </button>

                    <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                      {[firstChannel, secondChannel].map((i) => {
                        if (i >= channelLabels.length) return null;
                        const ch = channelLabels[i];
                        const st = hb.outputStates[i] ?? 0;
                        const v = hb.outputVoltages[i];
                        const a = hb.outputCurrents[i];
                        const dbu = vuOutputDbu[i];
                        const temp = hb.temperatures[i] ?? 0;
                        const isLimit = st === 5;
                        const isActive = st === 0 || st === 8;
                        const isDisabledByBridge = isBridgedSecondColumn(i);
                        const dbuVal = dbu === null || dbu <= OUT_DB_BOT ? null : Math.min(dbu, OUT_DB_TOP);

                        const chParam = channelParams?.channels[i];
                        const thresholdLines: { db: number; color: string; label: string }[] = [];

                        if (chParam?.rmsLimiter.enabled) {
                          const d = voltageToMeterDb(chParam.rmsLimiter.thresholdVrms, ratedRmsV);
                          if (d !== null) {
                            thresholdLines.push({
                              db: d,
                              color: COLORS.RMS_LIMITER,
                              label: `RMS ${chParam.rmsLimiter.thresholdVrms.toFixed(2)} Vrms - ${chParam.rmsLimiter.prmsW} W (${d.toFixed(1)} dB)`
                            });
                          }
                        }

                        if (chParam?.peakLimiter.enabled) {
                          const d = voltageToMeterDb(chParam.peakLimiter.thresholdVp, rmsToPeakVoltage(ratedRmsV));
                          if (d !== null) {
                            thresholdLines.push({
                              db: d,
                              color: COLORS.PEAK_LIMITER,
                              label: `Peak ${chParam.peakLimiter.thresholdVp.toFixed(2)} Vp - ${chParam.peakLimiter.ppeakW} W (${d.toFixed(1)} dB)`
                            });
                          }
                        }

                        return (
                          <div key={i} className="relative">
                            <div className="absolute left-2 top-1 z-10 flex items-center gap-1.5">
                              <EditableChannelName
                                name={channelParams?.channels[i]?.outputName}
                                fallback={`Out${ch}`}
                                active={isActive}
                                onRename={(newName) => renameOutput(mac, i, newName)}
                                className="rounded border border-border/50 bg-card/90 px-1.5 py-0.5"
                              />
                              <ChannelFlagPills flags={channelFlags?.find((f) => f.channel === i)} />
                            </div>
                            <div className={isDisabledByBridge ? "opacity-40 pointer-events-none grayscale" : ""}>
                              <div
                                aria-disabled={isDisabledByBridge}
                                className="flex items-center gap-2 rounded-md border border-border/30 bg-muted/5 px-2.5 pb-2 pt-4"
                              >
                                <div className="flex flex-col shrink-0" style={{ width: 220 }}>
                                  <HorizontalDbMeter
                                    value={dbuVal}
                                    dbTop={OUT_DB_TOP}
                                    dbBottom={OUT_DB_BOT}
                                    limit={isLimit}
                                    width={220}
                                    height={28}
                                    thresholdLines={thresholdLines}
                                  />
                                  <div className="flex justify-between mt-0.5 px-px" style={{ width: 220 }}>
                                    {OUT_SCALE.map((t) => (
                                      <span
                                        key={t}
                                        className="text-[9px] text-foreground/50 leading-none tabular-nums font-mono"
                                      >
                                        {t}
                                      </span>
                                    ))}
                                  </div>
                                </div>

                                <div
                                  className={`shrink-0 rounded px-1.5 py-1 text-[11px] font-bold text-center leading-tight ${
                                    isLimit ? "bg-red-500 text-white" : "bg-muted/30 text-foreground/60"
                                  }`}
                                >
                                  LIM
                                </div>

                                <div
                                  className={`flex h-12 w-16 shrink-0 flex-col items-center justify-center rounded border border-border/50 bg-muted/25 ${v <= 0.01 ? "opacity-40" : ""}`}
                                >
                                  <span className="font-mono text-[13px] font-semibold tabular-nums leading-none">
                                    {v > 0.01 ? f1(v) : "0"}
                                  </span>
                                  <span className="text-[9px] text-muted-foreground mt-0.5">V</span>
                                </div>
                                <div
                                  className={`flex h-12 w-16 shrink-0 flex-col items-center justify-center rounded border border-border/50 bg-muted/25 ${a <= 0.01 ? "opacity-40" : ""}`}
                                >
                                  <span className="font-mono text-[13px] font-semibold tabular-nums leading-none">
                                    {a > 0.01 ? f1(a) : "0"}
                                  </span>
                                  <span className="text-[9px] text-muted-foreground mt-0.5">A</span>
                                </div>
                                <div className="flex h-12 w-16 shrink-0 flex-col items-center justify-center rounded border border-border/50 bg-muted/25">
                                  <span
                                    className={`font-mono text-[13px] font-semibold tabular-nums leading-none ${temp > 80 ? "text-red-500" : ""}`}
                                  >
                                    {f0(temp)}
                                  </span>
                                  <span className="text-[9px] text-muted-foreground mt-0.5">°C</span>
                                </div>

                                <div className="w-16 shrink-0">
                                  <FirFilterDialog
                                    mac={mac}
                                    channel={i}
                                    title={`FIR Filter - ${channelParams?.channels[i]?.outputName ?? `Out${channelLabels[i] ?? i + 1}`}`}
                                    channelCount={channelCount}
                                  />
                                </div>

                                <div className="w-16 shrink-0">
                                  <EqBandDialog
                                    triggerLabel="Edit|EQ Out"
                                    title={`Output EQ - ${channelParams?.channels[i]?.outputName ?? `Out${channelLabels[i] ?? i + 1}`}`}
                                    triggerClassName={`!h-12 ${linkedHoverClass("outputEq", i, "ring-1 ring-purple-500/40")}`}
                                    onTriggerMouseEnter={getLinkHoverProps("outputEq", i).onMouseEnter}
                                    onTriggerMouseLeave={getLinkHoverProps("outputEq", i).onMouseLeave}
                                    onTriggerFocus={getLinkHoverProps("outputEq", i).onFocus}
                                    onTriggerBlur={getLinkHoverProps("outputEq", i).onBlur}
                                    mac={mac}
                                    channel={i}
                                    target="output"
                                    bands={channelParams?.channels[i]?.eqOut}
                                    allChannelBands={channelParams?.channels.map((c) => c?.eqOut)}
                                    channelCount={channelCount}
                                    channelNames={channelParams?.channels.map((c) => c?.outputName)}
                                  />
                                </div>
                                <div className="w-16 shrink-0">
                                  <VolumePopover
                                    volumeDb={channelParams?.channels[i]?.volumeOut}
                                    label="Vol dB"
                                    title="Output Volume"
                                    minDb={OUTPUT_VOLUME_MIN_DB}
                                    maxDb={OUTPUT_VOLUME_MAX_DB}
                                    buttonClassName={`!h-12 text-[13px] ${linkedHoverClass("volumeOut", i, "border-primary/40 bg-muted/50")}`}
                                    onButtonMouseEnter={getLinkHoverProps("volumeOut", i).onMouseEnter}
                                    onButtonMouseLeave={getLinkHoverProps("volumeOut", i).onMouseLeave}
                                    onButtonFocus={getLinkHoverProps("volumeOut", i).onFocus}
                                    onButtonBlur={getLinkHoverProps("volumeOut", i).onBlur}
                                    onSet={(db) => setVolumeOut(mac, i, db)}
                                  />
                                </div>
                                <div className="w-16 shrink-0">
                                  <DbPopover
                                    valueDb={channelParams?.channels[i]?.trimOut}
                                    label="Trim dB"
                                    title="Output Trim"
                                    minDb={OUTPUT_TRIM_MIN_DB}
                                    maxDb={OUTPUT_TRIM_MAX_DB}
                                    buttonClassName={`!h-12 text-[13px] ${linkedHoverClass("trimOut", i, (channelParams?.channels[i]?.trimOut ?? 0) !== 0 ? "ring-1 ring-amber-500/45" : "ring-1 ring-amber-500/30")}`}
                                    onButtonMouseEnter={getLinkHoverProps("trimOut", i).onMouseEnter}
                                    onButtonMouseLeave={getLinkHoverProps("trimOut", i).onMouseLeave}
                                    onButtonFocus={getLinkHoverProps("trimOut", i).onFocus}
                                    onButtonBlur={getLinkHoverProps("trimOut", i).onBlur}
                                    onSet={(db) => setTrimOut(mac, i, db)}
                                  />
                                </div>
                                <div className="w-16 shrink-0">
                                  <DelayPopover
                                    delayMs={channelParams?.channels[i]?.delayOut}
                                    maxMs={20}
                                    label="ms out"
                                    buttonClassName={`!h-12 text-[13px] ${linkedHoverClass("delayOut", i, (channelParams?.channels[i]?.delayOut ?? 0) > 0 ? "ring-1 ring-sky-500/45" : "ring-1 ring-sky-500/30")}`}
                                    onButtonMouseEnter={getLinkHoverProps("delayOut", i).onMouseEnter}
                                    onButtonMouseLeave={getLinkHoverProps("delayOut", i).onMouseLeave}
                                    onButtonFocus={getLinkHoverProps("delayOut", i).onFocus}
                                    onButtonBlur={getLinkHoverProps("delayOut", i).onBlur}
                                    onSet={(ms) => setDelayOut(mac, i, ms)}
                                  />
                                </div>
                                {(() => {
                                  const inverted = channelParams?.channels[i]?.invertedOut;
                                  const canClick = inverted !== undefined;
                                  return (
                                    <button
                                      type="button"
                                      disabled={!canClick}
                                      {...getLinkHoverProps("polarityOut", i)}
                                      onClick={() => canClick && void invertPolarityOut(mac, i, !inverted)}
                                      className={`flex h-12 w-16 shrink-0 flex-col items-center justify-center rounded border px-1 py-0.5 select-none transition-colors disabled:pointer-events-none disabled:opacity-50 ${
                                        inverted === true
                                          ? "border-destructive/65 bg-destructive/15 text-destructive hover:bg-destructive/20"
                                          : inverted === false
                                            ? "border-border/50 bg-muted/20 text-foreground/80 hover:border-destructive/45 hover:text-destructive"
                                            : "border-border/30 bg-muted/10 text-muted-foreground/40"
                                      } ${linkedHoverClass("polarityOut", i, inverted === false ? "border-destructive/40 text-destructive/80" : "")}`}
                                    >
                                      {inverted === true ? (
                                        <CircleSlash className="w-5 h-5" />
                                      ) : inverted === false ? (
                                        <Circle className="w-5 h-5" />
                                      ) : (
                                        <span className="font-mono text-[13px] font-semibold">~</span>
                                      )}
                                      <span className="text-[9px] leading-none text-muted-foreground mt-0.5">Pol</span>
                                    </button>
                                  );
                                })()}
                                <div className="w-16 shrink-0">
                                  <PowerModePill
                                    mode={channelParams?.channels[i]?.powerMode}
                                    channelLabel={
                                      channelParams?.channels[i]?.outputName ?? `Out${channelLabels[i] ?? i + 1}`
                                    }
                                    triggerClassName="!h-12 text-[13px]"
                                    onConfirm={(mode) => setPowerModeOut(mac, i, mode)}
                                  />
                                </div>
                                {(() => {
                                  const ng = channelParams?.channels[i]?.noiseGateOut;
                                  const canClick = ng !== undefined;
                                  return (
                                    <button
                                      type="button"
                                      disabled={!canClick}
                                      {...getLinkHoverProps("noiseGateOut", i)}
                                      onClick={() => canClick && void noiseGateOut(mac, i, !ng)}
                                      className={`flex h-12 w-16 shrink-0 flex-col items-center justify-center rounded border px-1 py-0.5 select-none transition-colors disabled:pointer-events-none disabled:opacity-50 ${
                                        ng === true
                                          ? "border-sky-500/65 bg-sky-500/15 text-sky-700 dark:text-sky-300"
                                          : ng === false
                                            ? "border-border/50 bg-muted/20 text-foreground/80 hover:border-sky-500/45 hover:text-sky-700 dark:hover:text-sky-300"
                                            : "border-border/30 bg-muted/10 text-muted-foreground/40"
                                      } ${linkedHoverClass("noiseGateOut", i, ng === false ? "border-sky-500/40 text-sky-400/70" : "")}`}
                                    >
                                      <span className="font-mono text-[13px] font-semibold tabular-nums leading-none">
                                        {ng === true ? "ON" : ng === false ? "OFF" : "~"}
                                      </span>
                                      <span className="text-[9px] leading-none text-muted-foreground mt-0.5">Gate</span>
                                    </button>
                                  );
                                })()}
                                {(() => {
                                  const muted = channelParams?.channels[i]?.muteOut;
                                  const canClick = muted !== undefined;
                                  return (
                                    <button
                                      type="button"
                                      disabled={!canClick}
                                      {...getLinkHoverProps("muteOut", i)}
                                      onClick={() => canClick && void muteOut(mac, i, !muted)}
                                      className={`flex h-12 w-16 shrink-0 flex-col items-center justify-center rounded border px-1 py-0.5 select-none transition-colors disabled:pointer-events-none disabled:opacity-50 ${
                                        muted === true
                                          ? "border-destructive/65 bg-destructive/15 text-destructive hover:bg-destructive/20"
                                          : muted === false
                                            ? "border-border/50 bg-muted/20 text-foreground/80 hover:border-destructive/45 hover:text-destructive"
                                            : "border-border/30 bg-muted/10 text-muted-foreground/40"
                                      } ${linkedHoverClass("muteOut", i, muted === false ? "border-destructive/40 text-destructive/70" : "")}`}
                                    >
                                      {muted === true ? (
                                        <VolumeX className="w-5 h-5" />
                                      ) : muted === false ? (
                                        <Volume1 className="w-5 h-5" />
                                      ) : (
                                        <span className="font-mono text-[13px] font-semibold">~</span>
                                      )}
                                      <span className="text-[9px] leading-none text-muted-foreground mt-0.5">Mute</span>
                                    </button>
                                  );
                                })()}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center flex-wrap text-[10px] text-muted-foreground mt-1">
              <span className="text-muted-foreground">
                PSU
                <span
                  className={`font-semibold tabular-nums font-mono ml-1 ${(hb.temperatures[4] ?? 0) > 80 ? "text-red-500" : ""}`}
                >
                  {f0(hb.temperatures[4] ?? 0)}
                </span>
                <span className="text-[10px] ml-0.5">°C</span>
              </span>
            </div>
          </div>
        </section>
      </div>

      <ConfirmActionDialog
        open={bridgeConfirmOpen}
        onOpenChange={handleBridgeDialogOpen}
        title={dict.dialogs.heartbeat.changeBridgeModeTitle}
        description={
          pendingBridgePair !== null && pendingBridgeNext !== null
            ? dict.dialogs.heartbeat.changeBridgeModeDescription
                .replace(
                  "{state}",
                  pendingBridgeNext ? dict.dialogs.limiterDetails.on : dict.dialogs.limiterDetails.off
                )
                .replace("{pairA}", channelLabels[pendingBridgePair * 2] ?? String(pendingBridgePair * 2 + 1))
                .replace("{pairB}", channelLabels[pendingBridgePair * 2 + 1] ?? String(pendingBridgePair * 2 + 2))
            : dict.dialogs.heartbeat.changeBridgeModeFallback
        }
        confirmLabel={bridgeBusy ? dict.dialogs.heartbeat.applying : dict.dialogs.heartbeat.applyBridgeChange}
        confirmDisabled={bridgeBusy || pendingBridgePair === null || pendingBridgeNext === null}
        onConfirm={handleConfirmBridge}
      />
    </TooltipProvider>
  );
}
