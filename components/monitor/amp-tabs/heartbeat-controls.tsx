"use client";

import { useState } from "react";
import type { ChannelFlags } from "@/stores/AmpStore";
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
import { ConfirmActionDialog } from "@/components/dialogs/confirm-action-dialog";
import { CHANNEL_NAME_MAX_LENGTH } from "@/lib/constants";
import { convertDelayUnits, type DelayUnit } from "@/lib/generic";
import { getPowerModeName } from "@/lib/parse-channel-data";
import { useI18n } from "@/components/layout/i18n-provider";
import { Pencil } from "lucide-react";

const POWER_MODE_OPTIONS = [0, 1, 2] as const;

// ---------------------------------------------------------------------------
// Delay helpers
// ---------------------------------------------------------------------------

type DelayDraft = { ms: string; meters: string; feet: string };

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

// ---------------------------------------------------------------------------
// DelayPopover
// ---------------------------------------------------------------------------

export function DelayPopover({
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
    if (next) setDraft(formatDelayDraft(delayMs ?? 0));
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
            {(
              [
                ["ms", "ms", maxMs, 0.1],
                ["meters", "m", maxDelayUnits.meters, 0.01],
                ["feet", "ft", maxDelayUnits.feet, 0.01]
              ] as const
            ).map(([unit, suffix, max, step]) => (
              <div key={unit} className="flex items-center gap-1.5">
                <Input
                  autoFocus={unit === "ms"}
                  type="number"
                  min={0}
                  max={max}
                  step={step}
                  value={draft[unit]}
                  onChange={(e) => updateDraft(unit, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commit();
                    if (e.key === "Escape") setOpen(false);
                  }}
                  className="h-8 text-sm font-mono tabular-nums"
                />
                <span className="text-xs text-muted-foreground shrink-0 w-7">{suffix}</span>
              </div>
            ))}
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

// ---------------------------------------------------------------------------
// VolumePopover
// ---------------------------------------------------------------------------

export function VolumePopover({
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
    if (next)
      setInputVal(volumeDb !== undefined ? volumeDb.toLocaleString("en-US", { maximumFractionDigits: 1 }) : "0");
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

// ---------------------------------------------------------------------------
// DbPopover
// ---------------------------------------------------------------------------

export function DbPopover({
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
    if (next) setInputVal(valueDb !== undefined ? valueDb.toLocaleString("en-US", { maximumFractionDigits: 1 }) : "0");
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

// ---------------------------------------------------------------------------
// PowerModePill
// ---------------------------------------------------------------------------

export function PowerModePill({
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
// EditableChannelName
// ---------------------------------------------------------------------------

export function EditableChannelName({
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

// ---------------------------------------------------------------------------
// Scale constants & ChannelFlagPills
// ---------------------------------------------------------------------------

export function outDbScale(): { top: number; bot: number; ticks: number[] } {
  return { top: 0, bot: -40, ticks: [-40, -32, -24, -16, -8, 0] };
}

export const IN_DB_TOP = 0;
export const IN_DB_BOT = -60;
export const IN_SCALE = [-60, -48, -36, -24, -12, 0];

const FLAG_DEFS: { key: keyof ChannelFlags; label: string; color: string }[] = [
  { key: "fault", label: "Fault", color: "border-red-500/60 bg-red-500/15 text-red-400" },
  { key: "open", label: "Open", color: "border-orange-500/60 bg-orange-500/15 text-orange-400" },
  { key: "temp", label: "Temp", color: "border-red-500/60 bg-red-500/15 text-red-400" },
  { key: "clip", label: "Clip", color: "border-yellow-500/60 bg-yellow-500/15 text-yellow-400" },
  { key: "standby", label: "Standby", color: "border-blue-500/60 bg-blue-500/15 text-blue-400" },
  { key: "hiZ", label: "Hi Z", color: "border-purple-500/60 bg-purple-500/15 text-purple-400" },
  { key: "bridged", label: "Bridged", color: "border-emerald-500/60 bg-emerald-500/15 text-emerald-400" }
];

export function ChannelFlagPills({ flags }: { flags?: ChannelFlags }) {
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
