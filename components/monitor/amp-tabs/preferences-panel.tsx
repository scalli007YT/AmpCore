"use client";

import { useState, useEffect, useRef } from "react";
import type { Amp, AmpPreset, ChannelParam } from "@/stores/AmpStore";
import type { AmpOptions } from "@/stores/AmpOptionStore";
import { useAmpOptionStore } from "@/stores/AmpOptionStore";
import { useAmpPresets } from "@/hooks/useAmpPresets";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ConfirmActionDialog } from "@/components/dialogs/confirm-action-dialog";
import { CopyJsonButton, JsonTree, type JsonValue } from "@/components/monitor/amp-tabs/json-viewer";
import { ChevronRight, Download, Upload, Trash2, RotateCcw } from "lucide-react";
import { formatRuntime } from "@/lib/generic";
import { PRESET_SLOT_MAX } from "@/lib/constants";
import { useI18n } from "@/components/layout/i18n-provider";

type PresetFilter = "all" | "used" | "empty";

interface PreferencesPanelProps {
  amp: Amp;
  ampOptions: AmpOptions;
  effectiveChannels: ChannelParam[];
  getDisplayName: (amp: Amp) => string;
}

export function PreferencesPanel({ amp, ampOptions, effectiveChannels, getDisplayName }: PreferencesPanelProps) {
  const dict = useI18n();
  const {
    fetchPresets,
    refreshCurrentPreset,
    recallPreset,
    storePreset,
    clearAllPresets,
    factoryReset,
    muteOutputsForExport,
    exportSdFile,
    importSdFile,
    fetching,
    recallingSlot,
    storingSlot,
    resetting,
    transferring,
    error: presetsError
  } = useAmpPresets();

  const sdFileInputRef = useRef<HTMLInputElement>(null);

  const [activePreset, setActivePreset] = useState<AmpPreset | null>(null);
  const [recallDialogOpen, setRecallDialogOpen] = useState(false);
  const [storeDialogOpen, setStoreDialogOpen] = useState(false);
  const [storePresetName, setStorePresetName] = useState("");
  const [clearAllDialogOpen, setClearAllDialogOpen] = useState(false);
  const [factoryResetDialogOpen, setFactoryResetDialogOpen] = useState(false);
  const [selectedExportSlot, setSelectedExportSlot] = useState<number | null>(null);
  const [exportConfirmDialogOpen, setExportConfirmDialogOpen] = useState(false);
  const [muteBeforeExport, setMuteBeforeExport] = useState(true);
  const [presetFilter, setPresetFilter] = useState<PresetFilter>("used");

  // Build preset slot list
  const presetNameBySlot = new Map<number, string>((amp.presets ?? []).map((p) => [p.slot, p.name]));
  const presetSlots: AmpPreset[] =
    amp.presets !== undefined
      ? Array.from({ length: PRESET_SLOT_MAX }, (_, i) => {
          const slot = i + 1;
          return { slot, name: presetNameBySlot.get(slot) ?? "" };
        })
      : [];
  const usedPresetCount = (amp.presets ?? []).filter((p) => p.name.trim().length > 0).length;
  const shownPresetSlots = presetSlots.filter((preset) => {
    if (presetFilter === "used") return preset.name.trim().length > 0;
    if (presetFilter === "empty") return preset.name.trim().length === 0;
    return true;
  });

  // Build channel debug trees
  const preferenceChannelTrees = effectiveChannels.map((channel) => {
    const flags = amp.channelFlags?.find((flag) => flag.channel === channel.channel) ?? null;
    return {
      meta: { channel: channel.channel, inputName: channel.inputName, outputName: channel.outputName },
      input: {
        gainIn: channel.gainIn,
        muteIn: channel.muteIn,
        delayIn: channel.delayIn,
        source: {
          sourceTypeCode: channel.sourceTypeCode,
          sourceType: channel.sourceType,
          sourceDelay: channel.sourceDelay,
          sourceTrim: channel.sourceTrim,
          sourceInputs: channel.sourceInputs
        }
      },
      output: {
        volumeOut: channel.volumeOut,
        trimOut: channel.trimOut,
        muteOut: channel.muteOut,
        noiseGateOut: channel.noiseGateOut,
        delayOut: channel.delayOut,
        invertedOut: channel.invertedOut,
        powerMode: channel.powerMode
      },
      limiters: { rmsLimiter: channel.rmsLimiter, peakLimiter: channel.peakLimiter },
      matrix: channel.matrix,
      eq: { in: channel.eqIn, out: channel.eqOut },
      flags
    } as unknown as JsonValue;
  });

  // Reset dialog state when amp changes
  useEffect(() => {
    setActivePreset(null);
    setRecallDialogOpen(false);
    setStoreDialogOpen(false);
    setStorePresetName("");
    setClearAllDialogOpen(false);
    setFactoryResetDialogOpen(false);
    setSelectedExportSlot(null);
    setExportConfirmDialogOpen(false);
  }, [amp.mac]);

  return (
    <div className="space-y-5">
      {/* Presets */}
      <section>
        <ConfirmActionDialog
          open={recallDialogOpen}
          onOpenChange={setRecallDialogOpen}
          title={dict.dialogs.presets.recallTitle}
          description={
            activePreset
              ? dict.dialogs.presets.recallDescription
                  .replace("{slot}", String(activePreset.slot))
                  .replace(
                    "{name}",
                    activePreset.name.trim().length > 0 ? activePreset.name : `Slot ${activePreset.slot}`
                  )
              : dict.dialogs.presets.recallFallbackDescription
          }
          confirmLabel={
            recallingSlot === activePreset?.slot ? dict.dialogs.presets.recalling : dict.dialogs.presets.recall
          }
          confirmDisabled={
            !amp.reachable || activePreset === null || activePreset.name.trim().length === 0 || recallingSlot !== null
          }
          onConfirm={async () => {
            if (!activePreset) return;
            const ok = await recallPreset(amp.mac, activePreset.slot, activePreset.name);
            if (ok) setRecallDialogOpen(false);
          }}
        />

        <ConfirmActionDialog
          open={storeDialogOpen}
          onOpenChange={(open) => {
            setStoreDialogOpen(open);
            if (!open && activePreset) setStorePresetName(activePreset.name);
          }}
          title={dict.dialogs.presets.storeTitle}
          description={
            activePreset
              ? dict.dialogs.presets.storeDescription.replace("{slot}", String(activePreset.slot))
              : dict.dialogs.presets.storeFallbackDescription
          }
          confirmLabel={storingSlot === activePreset?.slot ? dict.dialogs.presets.storing : dict.dialogs.presets.store}
          confirmDisabled={
            !amp.reachable || activePreset === null || storingSlot !== null || storePresetName.trim().length === 0
          }
          onConfirm={async () => {
            if (!activePreset) return;
            const ok = await storePreset(amp.mac, activePreset.slot, storePresetName);
            if (ok) setStoreDialogOpen(false);
          }}
        >
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">{dict.dialogs.presets.presetName}</label>
            <Input
              value={storePresetName}
              onChange={(e) => setStorePresetName(e.target.value)}
              placeholder={dict.dialogs.presets.presetNamePlaceholder}
              maxLength={32}
            />
            <p className="text-[11px] text-muted-foreground text-right">{storePresetName.length}/32</p>
          </div>
        </ConfirmActionDialog>

        <div className="flex items-center justify-between mb-2.5">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold">{dict.monitor.ampTabs.presets}</h3>
            {fetching && (
              <span className="text-xs text-muted-foreground animate-pulse">{dict.monitor.ampTabs.loading}</span>
            )}
            {!fetching && amp.presets !== undefined && (
              <span className="text-xs text-muted-foreground">
                {dict.monitor.ampTabs.usedCount.replace("{count}", String(usedPresetCount))}
              </span>
            )}
          </div>
          {amp.presets !== undefined && (
            <div className="flex items-center gap-1.5">
              <Button
                size="sm"
                variant={presetFilter === "all" ? "default" : "outline"}
                className="h-6 px-2 text-xs"
                onClick={() => setPresetFilter("all")}
              >
                {dict.monitor.ampTabs.filterAll}
              </Button>
              <Button
                size="sm"
                variant={presetFilter === "used" ? "default" : "outline"}
                className="h-6 px-2 text-xs"
                onClick={() => setPresetFilter("used")}
              >
                {dict.monitor.ampTabs.filterUsed}
              </Button>
              <Button
                size="sm"
                variant={presetFilter === "empty" ? "default" : "outline"}
                className="h-6 px-2 text-xs"
                onClick={() => setPresetFilter("empty")}
              >
                {dict.monitor.ampTabs.filterEmpty}
              </Button>
            </div>
          )}
        </div>

        {presetsError && <p className="text-xs text-destructive mb-2">{presetsError}</p>}

        {!fetching && !amp.presets && !presetsError && (
          <p className="text-xs text-muted-foreground">
            {amp.reachable ? dict.monitor.ampTabs.loadingPresets : dict.monitor.ampTabs.presetsUnavailable}
          </p>
        )}

        {amp.presets !== undefined && (
          <div className="overflow-hidden rounded-md border border-border/50">
            <ul className="divide-y divide-border/40 max-h-[360px] overflow-y-auto">
              {shownPresetSlots.map((preset) => (
                <li key={preset.slot} className="list-none group">
                  <div
                    className={`flex w-full items-center gap-3 px-3 py-2 text-sm text-left transition-colors select-none hover:bg-accent ${!amp.reachable ? "pointer-events-none opacity-50" : ""}`}
                  >
                    <span className="w-5 text-center text-xs font-mono text-muted-foreground">{preset.slot}</span>
                    <span
                      className={`flex-1 min-w-0 truncate ${preset.name.trim().length === 0 ? "text-muted-foreground italic" : ""}`}
                    >
                      {preset.name.trim().length > 0 ? preset.name : dict.monitor.ampTabs.emptySlotLabel}
                    </span>
                    <div className="flex items-center gap-1.5 opacity-0 transition-opacity group-hover:opacity-100">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 text-xs px-2"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActivePreset(preset);
                          setStorePresetName(preset.name);
                          setStoreDialogOpen(true);
                        }}
                      >
                        {dict.dialogs.presets.store}
                      </Button>
                      <Button
                        size="sm"
                        className="h-6 text-xs px-2"
                        disabled={preset.name.trim().length === 0}
                        onClick={(e) => {
                          e.stopPropagation();
                          setActivePreset(preset);
                          setRecallDialogOpen(true);
                        }}
                      >
                        {dict.dialogs.presets.recall}
                      </Button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* Device Actions */}
      <section>
        {/* Hidden file input for .sd import */}
        <input
          ref={sdFileInputRef}
          type="file"
          accept=".sd,.sp"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            e.target.value = "";
            await importSdFile(amp.mac, file);
          }}
        />

        {/* Clear All / Factory Reset confirmation dialogs */}
        <ConfirmActionDialog
          open={exportConfirmDialogOpen}
          onOpenChange={setExportConfirmDialogOpen}
          title={dict.dialogs.presets.exportSdTitle}
          description={(() => {
            const preset = (amp.presets ?? []).find((p) => p.slot === selectedExportSlot);
            return dict.dialogs.presets.exportSdConfirmDescription
              .replace("{slot}", String(selectedExportSlot ?? ""))
              .replace("{name}", preset?.name ?? "");
          })()}
          confirmLabel={transferring ? dict.dialogs.presets.exportSdExporting : dict.dialogs.presets.exportSdButton}
          confirmDisabled={!amp.reachable || transferring || selectedExportSlot === null}
          onConfirm={async () => {
            if (selectedExportSlot === null) return;
            const preset = (amp.presets ?? []).find((p) => p.slot === selectedExportSlot);
            const channelIndices = effectiveChannels.map((c) => c.channel);
            setExportConfirmDialogOpen(false);
            if (muteBeforeExport) {
              const muteOk = await muteOutputsForExport(amp.mac, channelIndices);
              if (!muteOk) return;
            }
            await recallPreset(amp.mac, selectedExportSlot, preset?.name);
            await new Promise((r) => setTimeout(r, 600));
            await exportSdFile(amp.mac, preset?.name);
          }}
        >
          <div className="flex items-center gap-2 pt-1">
            <Checkbox
              id="mute-before-export"
              checked={muteBeforeExport}
              onCheckedChange={(v) => setMuteBeforeExport(v === true)}
            />
            <label htmlFor="mute-before-export" className="text-xs text-muted-foreground cursor-pointer select-none">
              {dict.dialogs.presets.exportSdMuteOutputs}
            </label>
          </div>
        </ConfirmActionDialog>

        <ConfirmActionDialog
          open={clearAllDialogOpen}
          onOpenChange={setClearAllDialogOpen}
          title={dict.dialogs.presets.clearAllTitle}
          description={dict.dialogs.presets.clearAllDescription.replace("{count}", String(usedPresetCount))}
          confirmLabel={resetting ? dict.dialogs.presets.clearingAll : dict.dialogs.presets.clearAll}
          confirmDisabled={!amp.reachable || resetting}
          destructive
          onConfirm={async () => {
            const ok = await clearAllPresets(amp.mac);
            if (ok) setClearAllDialogOpen(false);
          }}
        />

        <ConfirmActionDialog
          open={factoryResetDialogOpen}
          onOpenChange={setFactoryResetDialogOpen}
          title={dict.dialogs.presets.factoryResetTitle}
          description={dict.dialogs.presets.factoryResetDescription}
          confirmLabel={resetting ? dict.dialogs.presets.factoryResetting : dict.dialogs.presets.factoryReset}
          confirmDisabled={!amp.reachable || resetting}
          destructive
          onConfirm={async () => {
            const ok = await factoryReset(amp.mac);
            if (ok) setFactoryResetDialogOpen(false);
          }}
        />

        <h3 className="text-sm font-semibold mb-2.5">{dict.dialogs.presets.deviceActions}</h3>
        <div className="overflow-hidden rounded-md border border-border/50 divide-y divide-border/40">
          {/* Export .sd */}
          <div
            className={`flex items-center justify-between gap-2 px-3 py-2.5 ${!amp.reachable ? "opacity-50 pointer-events-none" : ""}`}
          >
            <div className="flex items-center gap-2 min-w-0 shrink-0">
              <Download className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="text-sm">{dict.dialogs.presets.exportSdTitle}</span>
            </div>
            <div className="flex items-center gap-1.5">
              {(() => {
                const usedPresets = (amp.presets ?? []).filter((p) => p.name.trim().length > 0);
                return (
                  <Select
                    value={selectedExportSlot !== null ? String(selectedExportSlot) : ""}
                    onValueChange={(v) => setSelectedExportSlot(Number(v))}
                    disabled={!amp.reachable || transferring || usedPresets.length === 0}
                  >
                    <SelectTrigger className="h-7 text-xs w-40">
                      <SelectValue
                        placeholder={
                          usedPresets.length === 0
                            ? dict.dialogs.presets.exportSdNoPresets
                            : dict.dialogs.presets.exportSdSelectSlot
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {usedPresets.map((p) => (
                        <SelectItem key={p.slot} value={String(p.slot)}>
                          {p.slot}. {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                );
              })()}
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs px-2 shrink-0"
                disabled={!amp.reachable || transferring || selectedExportSlot === null}
                onClick={() => setExportConfirmDialogOpen(true)}
              >
                {transferring ? dict.dialogs.presets.exportSdExporting : dict.dialogs.presets.exportSdButton}
              </Button>
            </div>
          </div>

          {/* Import .sd */}
          <div
            className={`flex items-center justify-between px-3 py-2.5 ${!amp.reachable ? "opacity-50 pointer-events-none" : ""}`}
          >
            <div className="flex items-center gap-2 min-w-0">
              <Upload className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="text-sm truncate">{dict.dialogs.presets.importSdTitle}</span>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs px-2 shrink-0 ml-2"
              disabled={!amp.reachable || transferring}
              onClick={() => sdFileInputRef.current?.click()}
            >
              {transferring ? dict.dialogs.presets.importSdImporting : dict.dialogs.presets.importSdButton}
            </Button>
          </div>

          {/* Clear All Presets */}
          <div
            className={`flex items-center justify-between px-3 py-2.5 ${!amp.reachable ? "opacity-50 pointer-events-none" : ""}`}
          >
            <div className="flex items-center gap-2 min-w-0">
              <Trash2 className="h-3.5 w-3.5 text-destructive shrink-0" />
              <span className="text-sm text-destructive truncate">{dict.dialogs.presets.clearAllTitle}</span>
            </div>
            <Button
              size="sm"
              variant="destructive"
              className="h-7 text-xs px-2 shrink-0 ml-2"
              disabled={!amp.reachable || resetting || usedPresetCount === 0}
              onClick={() => setClearAllDialogOpen(true)}
            >
              {dict.dialogs.presets.clearAll}
            </Button>
          </div>

          {/* Factory Reset */}
          <div
            className={`flex items-center justify-between px-3 py-2.5 ${!amp.reachable ? "opacity-50 pointer-events-none" : ""}`}
          >
            <div className="flex items-center gap-2 min-w-0">
              <RotateCcw className="h-3.5 w-3.5 text-destructive shrink-0" />
              <span className="text-sm text-destructive truncate">{dict.dialogs.presets.factoryResetTitle}</span>
            </div>
            <Button
              size="sm"
              variant="destructive"
              className="h-7 text-xs px-2 shrink-0 ml-2"
              disabled={!amp.reachable || resetting}
              onClick={() => setFactoryResetDialogOpen(true)}
            >
              {dict.dialogs.presets.factoryReset}
            </Button>
          </div>
        </div>
      </section>

      {/* Options */}
      <section>
        <h3 className="text-sm font-semibold mb-2.5">{dict.monitor.ampTabs.options}</h3>
        <div className="overflow-hidden rounded-md border border-border/50 divide-y divide-border/40">
          <div className="flex items-center justify-between px-3 py-2.5">
            <Label htmlFor={`debug-mode-${amp.mac}`} className="text-sm cursor-pointer">
              {dict.monitor.ampTabs.debugMode}
            </Label>
            <Checkbox
              id={`debug-mode-${amp.mac}`}
              checked={ampOptions.debugMode}
              onCheckedChange={(checked) =>
                useAmpOptionStore.getState().setOption(amp.mac, "debugMode", checked === true)
              }
            />
          </div>
          <div className="flex items-center justify-between px-3 py-2 opacity-50 pointer-events-none">
            <Label className="text-sm">{dict.monitor.ampTabs.limiterVoltageOffset}</Label>
            <div className="flex items-center gap-1.5">
              <Input
                type="number"
                step="0.1"
                placeholder="0.0"
                disabled
                className="w-20 h-7 text-sm text-right"
                value=""
              />
              <span className="text-xs text-muted-foreground">V</span>
            </div>
          </div>
          <div className="flex items-center justify-between px-3 py-2">
            <Label htmlFor={`limiter-offset-${amp.mac}`} className="text-sm">
              {dict.monitor.ampTabs.limiterLineVoltageOffset}
            </Label>
            <div className="flex items-center gap-1.5">
              <Input
                id={`limiter-offset-${amp.mac}`}
                type="number"
                min={0}
                max={1.5}
                step="0.1"
                placeholder="0.0"
                className="w-20 h-7 text-sm text-right"
                value={ampOptions.limiterLineVoltageOffset}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  useAmpOptionStore
                    .getState()
                    .setOption(amp.mac, "limiterLineVoltageOffset", Number.isFinite(val) ? val : 0);
                }}
              />
              <span className="text-xs text-muted-foreground">V</span>
            </div>
          </div>
        </div>
      </section>

      {/* Debug: Device Info + Channel Data — only shown when debug mode is on */}
      {ampOptions.debugMode && (
        <div className="border-t pt-4">
          <h3 className="text-sm font-semibold mb-3">{dict.monitor.ampTabs.debugInfo}</h3>

          <Collapsible defaultOpen={false} className="mb-3">
            <CollapsibleTrigger className="flex w-full items-center gap-2 rounded-md px-1 py-1 text-left hover:bg-muted/50 transition-colors [&[data-state=open]>svg]:rotate-90">
              <ChevronRight className="shrink-0 h-3.5 w-3.5 text-muted-foreground transition-transform duration-200" />
              <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${amp.reachable ? "bg-green-500" : "bg-red-500"}`} />
              <span className="text-sm font-semibold">{getDisplayName(amp)}</span>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <dl className="grid grid-cols-2 gap-2 text-xs text-muted-foreground mt-3 px-1">
                <div>
                  <dt className="font-semibold">MAC:</dt>
                  <dd className="font-mono">{amp.mac}</dd>
                </div>
                <div>
                  <dt className="font-semibold">Version:</dt>
                  <dd>{amp.version || "---"}</dd>
                </div>
                <div>
                  <dt className="font-semibold">ID:</dt>
                  <dd>{amp.id || "---"}</dd>
                </div>
                <div>
                  <dt className="font-semibold">Runtime:</dt>
                  <dd>{amp.run_time !== undefined ? formatRuntime(amp.run_time) : "---"}</dd>
                </div>
                <div>
                  <dt className="font-semibold">Rated Output:</dt>
                  <dd>{amp.ratedRmsV !== undefined ? `${amp.ratedRmsV} V RMS` : "---"}</dd>
                </div>
                <div>
                  <dt className="font-semibold">Analog_signal_Input_chx:</dt>
                  <dd>{amp.analog_signal_input_chx !== undefined ? amp.analog_signal_input_chx : "---"}</dd>
                </div>
                <div>
                  <dt className="font-semibold">Output_chx:</dt>
                  <dd>{amp.output_chx !== undefined ? amp.output_chx : "---"}</dd>
                </div>
                <div>
                  <dt className="font-semibold">Digital_signal_input_chx:</dt>
                  <dd>
                    {amp.basic_info?.Digital_signal_input_chx !== undefined
                      ? amp.basic_info.Digital_signal_input_chx
                      : "---"}
                  </dd>
                </div>
                <div>
                  <dt className="font-semibold">Gain_max:</dt>
                  <dd>{amp.gain_max !== undefined ? amp.gain_max : "---"}</dd>
                </div>
                <div>
                  <dt className="font-semibold">Machine_state:</dt>
                  <dd>{amp.machine_state !== undefined ? amp.machine_state : "---"}</dd>
                </div>
                <div>
                  <dt className="font-semibold">Rotary_lock:</dt>
                  <dd>{amp.locked === undefined ? "---" : amp.locked ? "Locked" : "Unlocked"}</dd>
                </div>
                <div>
                  <dt className="font-semibold">Standby:</dt>
                  <dd>{amp.standby === undefined ? "---" : amp.standby ? "Standby" : "Normal"}</dd>
                </div>
              </dl>
            </CollapsibleContent>
          </Collapsible>

          {amp.channelParams && (
            <Collapsible defaultOpen={false}>
              <div className="flex items-center justify-between">
                <CollapsibleTrigger className="flex items-center gap-1.5 rounded-md px-1 py-1 text-left hover:bg-muted/50 transition-colors [&[data-state=open]>svg]:rotate-90">
                  <ChevronRight className="shrink-0 h-3.5 w-3.5 text-muted-foreground transition-transform duration-200" />
                  <span className="text-sm font-semibold">{dict.monitor.ampTabs.channelData}</span>
                </CollapsibleTrigger>
                <CopyJsonButton data={preferenceChannelTrees ?? effectiveChannels} />
              </div>
              <CollapsibleContent>
                <div className="space-y-2 mt-3">
                  {effectiveChannels.map((channel, idx) => (
                    <JsonTree
                      key={channel.channel}
                      label={dict.monitor.ampTabs.channelLabel
                        .replace("{channel}", String(channel.channel))
                        .replace("{input}", channel.inputName)
                        .replace("{output}", channel.outputName)}
                      value={(preferenceChannelTrees?.[idx] ?? channel) as unknown as JsonValue}
                    />
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}
        </div>
      )}
    </div>
  );
}
