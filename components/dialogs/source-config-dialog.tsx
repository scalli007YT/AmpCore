"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import type { ChannelInputSource, ChannelParam } from "@/stores/AmpStore";
import type { SourceCapabilities } from "@/lib/source-capabilities";
import { isSourceEnabled } from "@/lib/source-capabilities";
import { useAmpActions } from "@/hooks/useAmpActions";
import {
  BACKUP_THRESHOLD_MAX_DB,
  BACKUP_THRESHOLD_MIN_DB,
  SOURCE_DELAY_MAX_MS,
  SOURCE_DELAY_MIN_MS,
  SOURCE_TRIM_MAX_DB,
  SOURCE_TRIM_MIN_DB
} from "@/lib/validation/amp-actions";
import { Button } from "@/components/ui/button";
import { ChannelButtonGroup } from "@/components/custom/channel-button-group";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useI18n } from "@/components/layout/i18n-provider";
import { SlidersHorizontalIcon } from "lucide-react";

type SourceKey = "analog" | "dante" | "aes3" | "backup";
type PrimarySourceKey = Exclude<SourceKey, "backup">;
type BackupVariant = "dual" | "triple";

const SOURCE_ORDER: SourceKey[] = ["analog", "dante", "aes3", "backup"];

const SOURCE_LABEL: Record<SourceKey, string> = {
  analog: "Analog",
  dante: "Dante",
  aes3: "AES3",
  backup: "Backup"
};

function getPriorityKeys(capabilities?: SourceCapabilities): PrimarySourceKey[] {
  const keys: PrimarySourceKey[] = ["analog"];
  if (capabilities?.hasDante) keys.push("dante");
  if (capabilities?.hasAes3) keys.push("aes3");
  if (keys.length === 1 && capabilities?.hasBackup) keys.push("dante");
  return keys;
}

function getBackupVariant(capabilities?: SourceCapabilities): BackupVariant {
  return capabilities?.hasDante && capabilities?.hasAes3 ? "triple" : "dual";
}

function getSourceCode(key: PrimarySourceKey, capabilities?: SourceCapabilities): 0 | 1 | 2 {
  if (key === "analog") return 0;
  if (key === "dante") return 1;
  return capabilities?.hasDante ? 2 : 1;
}

function getSourceLabel(key: PrimarySourceKey): string {
  return SOURCE_LABEL[key];
}

function normalizePriorityOrder(
  order: Array<"analog" | "dante" | "aes3"> | undefined,
  availableKeys: PrimarySourceKey[]
): PrimarySourceKey[] {
  const normalized = order?.filter((key): key is PrimarySourceKey => availableKeys.includes(key)) ?? [];
  return Array.from(new Set([...normalized, ...availableKeys]));
}

function normalizeSources(ch: ChannelParam, capabilities?: SourceCapabilities) {
  const mapped = new Map(ch.sourceInputs.map((item) => [item.key, item]));
  const availablePriorityKeys = getPriorityKeys(capabilities);

  return SOURCE_ORDER.map((key) => {
    const source = mapped.get(key);
    if (source) {
      if (key !== "backup") return source;

      const priorityOrder = normalizePriorityOrder(source.backup?.priorityOrder, availablePriorityKeys);
      return {
        ...source,
        backup: {
          enabled: source.backup?.enabled ?? source.selected,
          thresholdDb: source.backup?.thresholdDb ?? -80,
          priorityOrder,
          activeSourceKey: source.backup?.activeSourceKey ?? priorityOrder[0] ?? "analog"
        }
      };
    }

    return {
      key,
      type: SOURCE_LABEL[key],
      delay: 0,
      trim: 0,
      selected: false,
      ...(key === "backup"
        ? {
            backup: {
              enabled: false,
              thresholdDb: -80,
              priorityOrder: availablePriorityKeys,
              activeSourceKey: availablePriorityKeys[0] ?? "analog"
            }
          }
        : {})
    } satisfies ChannelInputSource;
  });
}

export function SourceConfigDialog({
  channels,
  mac,
  capabilities,
  trigger,
  initialChannel = 0
}: {
  channels: ChannelParam[];
  mac: string;
  capabilities?: SourceCapabilities;
  trigger?: ReactNode;
  initialChannel?: number;
}) {
  const dict = useI18n();
  const { setSourceType, setSourceDelay, setSourceTrim, setBackupConfig, setAnalogType } = useAmpActions();
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [selectedChannelIndex, setSelectedChannelIndex] = useState(0);

  // Optimistic card-selection: updated immediately on success, before the next poll arrives.
  const [localSelectedKeys, setLocalSelectedKeys] = useState<Record<number, SourceKey>>({});

  const sourceFamilyByKey: Partial<Record<SourceKey, 0 | 1 | 2>> = {
    analog: 0,
    dante: 1,
    aes3: 2
  };

  const runWithPending = async (key: string, action: () => Promise<void>): Promise<boolean> => {
    setPendingKey(key);
    try {
      await action();
      return true;
    } catch {
      return false;
    } finally {
      setPendingKey((current) => (current === key ? null : current));
    }
  };

  const analogInputCount = capabilities?.analogInputCount ?? channels.length;
  const analogOptionCount = Math.max(1, Math.min(16, analogInputCount));

  useEffect(() => {
    if (channels.length === 0) {
      if (selectedChannelIndex !== 0) {
        setSelectedChannelIndex(0);
      }
      return;
    }

    if (selectedChannelIndex >= channels.length) {
      setSelectedChannelIndex(channels.length - 1);
    }
  }, [channels.length, selectedChannelIndex]);

  useEffect(() => {
    if (channels.length === 0) {
      setSelectedChannelIndex(0);
      return;
    }

    const nextChannelIndex = Math.max(0, Math.min(initialChannel, channels.length - 1));
    setSelectedChannelIndex(nextChannelIndex);
  }, [channels.length, initialChannel]);

  const getAnalogSelection = (sourceTypeLabel: string): string => {
    const match = /-(\d+)$/.exec(sourceTypeLabel);
    if (!match) return "1";
    const idx = Number.parseInt(match[1], 10);
    if (Number.isNaN(idx)) return "1";
    return String(Math.max(1, Math.min(analogOptionCount, idx)));
  };

  const availablePriorityKeys = getPriorityKeys(capabilities);
  const backupVariant = getBackupVariant(capabilities);
  const activeChannel = channels[selectedChannelIndex] ?? channels[0] ?? null;

  return (
    <Dialog>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs hover:bg-primary/10 hover:text-primary">
            <SlidersHorizontalIcon className="size-3.5" />
            {dict.dialogs.sourceConfig.trigger}
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="sm:max-w-[1120px]">
        <DialogHeader className="pb-2">
          <div className="relative min-h-8 pr-10">
            <div className="flex h-8 items-center gap-3">
              <SlidersHorizontalIcon className="h-4 w-4" />
              <DialogTitle className="text-sm font-semibold">{dict.dialogs.sourceConfig.title}</DialogTitle>
            </div>
            {channels.length > 1 && (
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
                <ChannelButtonGroup
                  channelCount={channels.length}
                  value={Math.min(selectedChannelIndex, Math.max(channels.length - 1, 0))}
                  onValueChange={setSelectedChannelIndex}
                  size="sm"
                />
              </div>
            )}
          </div>
        </DialogHeader>

        <div className="max-h-[70vh] overflow-auto p-3">
          <div className="mx-auto w-fit min-w-[980px] space-y-3">
            {activeChannel &&
              (() => {
                const channel = activeChannel;
                const sources = normalizeSources(channel, capabilities);
                const backupSource = sources.find((source) => source.key === "backup");
                const backupState = backupSource?.backup;
                const priorityOrder = normalizePriorityOrder(backupState?.priorityOrder, availablePriorityKeys);
                const priority1 = priorityOrder[0] ?? "analog";
                const priority2 = priorityOrder[1] ?? priority1;
                const priority3 = priorityOrder[2];
                const priorityOrderKey = priorityOrder.join("-");

                return (
                  <div key={channel.channel} className="grid grid-cols-4 gap-2">
                    {sources.map((source) => {
                      const enabled = isSourceEnabled(capabilities, source.key);
                      const editable = enabled && source.key !== "backup";
                      const isBackup = source.key === "backup";
                      const isAnalog = source.key === "analog";
                      const modePending = pendingKey === `mode-${channel.channel}-${source.key}`;
                      const delayPending = pendingKey === `delay-${channel.channel}-${source.key}`;
                      const trimPending = pendingKey === `trim-${channel.channel}-${source.key}`;
                      const analogPending = pendingKey === `analog-${channel.channel}`;
                      const thresholdPending = pendingKey === `backup-threshold-${channel.channel}`;
                      const priorityPending = pendingKey === `backup-priority-${channel.channel}`;
                      const primaryKey = source.key === "backup" ? null : (source.key as PrimarySourceKey);

                      const localKey = localSelectedKeys[channel.channel];
                      const isSelected = localKey !== undefined ? localKey === source.key : source.selected;
                      const cardInteractive = enabled && !modePending && !isSelected;

                      const activateCard = async () => {
                        if (!enabled) return;
                        if (isBackup) {
                          await setBackupConfig(
                            mac,
                            channel.channel,
                            true,
                            backupVariant,
                            getSourceCode(priority1, capabilities),
                            backupState?.thresholdDb ?? -80,
                            backupVariant === "triple" ? getSourceCode(priority2, capabilities) : undefined
                          );
                          setLocalSelectedKeys((prev) => ({ ...prev, [channel.channel]: "backup" }));
                          return;
                        }

                        if (!primaryKey) return;
                        await setSourceType(mac, channel.channel, getSourceCode(primaryKey, capabilities));
                        setLocalSelectedKeys((prev) => ({ ...prev, [channel.channel]: primaryKey }));
                        if (backupState?.enabled) {
                          await setBackupConfig(
                            mac,
                            channel.channel,
                            false,
                            backupVariant,
                            getSourceCode(priority1, capabilities),
                            backupState.thresholdDb,
                            backupVariant === "triple" ? getSourceCode(priority2, capabilities) : undefined
                          );
                        }
                      };

                      return (
                        <div
                          key={`${channel.channel}-${source.key}`}
                          className={`rounded-md border p-2 transition-[border-color,background-color,box-shadow,opacity,transform] ${
                            isSelected
                              ? "border-primary/80 bg-primary/10 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.05)]"
                              : isBackup
                                ? "border-dashed border-border/60 bg-muted/10"
                                : "border-border/60 bg-background"
                          } ${
                            cardInteractive
                              ? "cursor-pointer hover:-translate-y-px hover:border-primary/60 hover:bg-primary/5 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                              : "cursor-default"
                          } ${enabled ? "opacity-100" : "opacity-45"}`}
                          aria-disabled={!enabled}
                          role={enabled ? "button" : undefined}
                          tabIndex={enabled ? 0 : -1}
                          onClick={(e) => {
                            if (!enabled || isSelected) return;
                            const target = e.target as HTMLElement;
                            if (target.closest("button,input,[role='option'],[role='listbox'],[role='combobox']"))
                              return;
                            void runWithPending(`mode-${channel.channel}-${source.key}`, activateCard);
                          }}
                          onKeyDown={(e) => {
                            if (!enabled || isSelected) return;
                            if (e.key !== "Enter" && e.key !== " ") return;
                            e.preventDefault();
                            void runWithPending(`mode-${channel.channel}-${source.key}`, activateCard);
                          }}
                        >
                          {isAnalog ? (
                            <div className="mb-2 h-7">
                              <Select
                                value={getAnalogSelection(source.type)}
                                onValueChange={(next) => {
                                  const parsed = Number.parseInt(next, 10);
                                  if (Number.isNaN(parsed)) return;
                                  void runWithPending(`analog-${channel.channel}`, async () => {
                                    await setAnalogType(mac, channel.channel, Math.max(0, parsed - 1));
                                  });
                                }}
                                disabled={!enabled || analogPending}
                              >
                                <SelectTrigger className="h-7 w-full text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {Array.from({ length: analogOptionCount }).map((_, idx) => (
                                    <SelectItem key={idx} value={String(idx + 1)}>
                                      Analog-{idx + 1}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          ) : (
                            <div className="mb-2 h-7 flex items-center gap-2">
                              <span
                                className={`h-3 w-3 rounded-full border transition-colors ${
                                  isSelected
                                    ? enabled
                                      ? "border-primary bg-primary"
                                      : "border-muted-foreground bg-muted-foreground"
                                    : cardInteractive
                                      ? "border-primary/60"
                                      : "border-muted-foreground/50"
                                }`}
                              />
                              <span className="text-xs font-semibold">{source.type}</span>
                              {!enabled && (
                                <span className="ml-auto text-[10px] uppercase tracking-wide text-muted-foreground">
                                  {dict.dialogs.sourceConfig.off}
                                </span>
                              )}
                            </div>
                          )}

                          {isBackup ? (
                            <div className="space-y-1 text-xs text-muted-foreground">
                              <div className="flex items-center justify-between gap-2 rounded border border-border/50 px-2 py-1">
                                <span>{dict.dialogs.sourceConfig.backupActive}</span>
                                <span className="font-medium text-foreground">
                                  {getSourceLabel(backupState?.activeSourceKey ?? priority1)}
                                </span>
                              </div>

                              <div className="flex items-center justify-between gap-2 rounded border border-border/50 px-2 py-1">
                                <span>{dict.dialogs.sourceConfig.backupFirst}</span>
                                <Select
                                  key={`p1-${channel.channel}-${priorityOrderKey}`}
                                  defaultValue={priority1}
                                  disabled={!enabled || priorityPending}
                                  onValueChange={(next) => {
                                    const nextFirst = next as PrimarySourceKey;
                                    const reordered = normalizePriorityOrder(
                                      [nextFirst, ...priorityOrder],
                                      availablePriorityKeys
                                    );
                                    const nextPriority1 = reordered[0] ?? nextFirst;
                                    const nextPriority2 = reordered[1] ?? nextPriority1;
                                    void runWithPending(`backup-priority-${channel.channel}`, async () => {
                                      await setBackupConfig(
                                        mac,
                                        channel.channel,
                                        backupState?.enabled ?? source.selected,
                                        backupVariant,
                                        getSourceCode(nextPriority1, capabilities),
                                        backupState?.thresholdDb ?? -80,
                                        backupVariant === "triple"
                                          ? getSourceCode(nextPriority2, capabilities)
                                          : undefined
                                      );
                                    });
                                  }}
                                >
                                  <SelectTrigger className="h-6 w-28 text-right text-[11px]">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {availablePriorityKeys.map((key) => (
                                      <SelectItem key={key} value={key}>
                                        {getSourceLabel(key)}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>

                              {backupVariant === "triple" && (
                                <div className="flex items-center justify-between gap-2 rounded border border-border/50 px-2 py-1">
                                  <span>{dict.dialogs.sourceConfig.backupSecond}</span>
                                  <Select
                                    key={`p2-${channel.channel}-${priorityOrderKey}`}
                                    defaultValue={priority2}
                                    disabled={!enabled || priorityPending}
                                    onValueChange={(next) => {
                                      const nextSecond = next as PrimarySourceKey;
                                      const reordered = normalizePriorityOrder(
                                        [priority1, nextSecond, ...priorityOrder],
                                        availablePriorityKeys
                                      );
                                      const nextPriority1 = reordered[0] ?? priority1;
                                      const nextPriority2 = reordered[1] ?? nextSecond;
                                      void runWithPending(`backup-priority-${channel.channel}`, async () => {
                                        await setBackupConfig(
                                          mac,
                                          channel.channel,
                                          backupState?.enabled ?? source.selected,
                                          backupVariant,
                                          getSourceCode(nextPriority1, capabilities),
                                          backupState?.thresholdDb ?? -80,
                                          getSourceCode(nextPriority2, capabilities)
                                        );
                                      });
                                    }}
                                  >
                                    <SelectTrigger className="h-6 w-28 text-right text-[11px]">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {availablePriorityKeys.map((key) => (
                                        <SelectItem key={key} value={key}>
                                          {getSourceLabel(key)}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                              )}

                              {backupVariant === "triple" && priority3 && (
                                <div className="flex items-center justify-between gap-2 rounded border border-border/50 px-2 py-1">
                                  <span>{dict.dialogs.sourceConfig.backupThird}</span>
                                  <span className="font-medium text-foreground">{getSourceLabel(priority3)}</span>
                                </div>
                              )}

                              <div className="flex items-center justify-between gap-2 rounded border border-border/50 px-2 py-1">
                                <span>{dict.dialogs.sourceConfig.backupThreshold}</span>
                                <Input
                                  key={`backup-threshold-${channel.channel}-${backupState?.thresholdDb ?? -80}`}
                                  type="number"
                                  step="1"
                                  disabled={!enabled || thresholdPending}
                                  defaultValue={String(backupState?.thresholdDb ?? -80)}
                                  className="h-6 w-24 text-right text-[11px]"
                                  onBlur={(e) => {
                                    const parsed = Number.parseInt(e.target.value, 10);
                                    if (Number.isNaN(parsed)) {
                                      e.target.value = String(backupState?.thresholdDb ?? -80);
                                      return;
                                    }
                                    const clamped = Math.max(
                                      BACKUP_THRESHOLD_MIN_DB,
                                      Math.min(BACKUP_THRESHOLD_MAX_DB, parsed)
                                    );
                                    e.target.value = String(clamped);
                                    void (async () => {
                                      const ok = await runWithPending(
                                        `backup-threshold-${channel.channel}`,
                                        async () => {
                                          await setBackupConfig(
                                            mac,
                                            channel.channel,
                                            backupState?.enabled ?? source.selected,
                                            backupVariant,
                                            getSourceCode(priority1, capabilities),
                                            clamped,
                                            backupVariant === "triple"
                                              ? getSourceCode(priority2, capabilities)
                                              : undefined
                                          );
                                        }
                                      );
                                      if (!ok) {
                                        e.target.value = String(backupState?.thresholdDb ?? -80);
                                      }
                                    })();
                                  }}
                                />
                              </div>
                            </div>
                          ) : (
                            <div className="space-y-1 text-xs text-muted-foreground">
                              <div className="flex items-center justify-between gap-2 rounded border border-border/50 px-2 py-1">
                                <span>{dict.dialogs.sourceConfig.delay}</span>
                                <Input
                                  key={`delay-${channel.channel}-${source.key}-${source.delay}`}
                                  type="number"
                                  step="0.01"
                                  disabled={!editable || delayPending}
                                  defaultValue={String(source.delay)}
                                  className="h-6 w-24 text-right text-[11px]"
                                  onBlur={(e) => {
                                    const parsed = Number.parseFloat(e.target.value);
                                    if (Number.isNaN(parsed)) {
                                      e.target.value = String(source.delay);
                                      return;
                                    }
                                    const clamped = Math.max(
                                      SOURCE_DELAY_MIN_MS,
                                      Math.min(SOURCE_DELAY_MAX_MS, parsed)
                                    );
                                    e.target.value = String(clamped);
                                    const sourceFamily = sourceFamilyByKey[source.key];
                                    if (sourceFamily === undefined) return;
                                    void (async () => {
                                      const ok = await runWithPending(
                                        `delay-${channel.channel}-${source.key}`,
                                        async () => {
                                          await setSourceDelay(
                                            mac,
                                            channel.channel,
                                            sourceFamily,
                                            clamped,
                                            source.trim
                                          );
                                        }
                                      );
                                      if (!ok) {
                                        e.target.value = String(source.delay);
                                      }
                                    })();
                                  }}
                                />
                              </div>

                              <div className="flex items-center justify-between gap-2 rounded border border-border/50 px-2 py-1">
                                <span>{dict.dialogs.sourceConfig.trim}</span>
                                <Input
                                  key={`trim-${channel.channel}-${source.key}-${source.trim}`}
                                  type="number"
                                  step="0.1"
                                  disabled={!editable || trimPending}
                                  defaultValue={String(source.trim)}
                                  className="h-6 w-24 text-right text-[11px]"
                                  onBlur={(e) => {
                                    const parsed = Number.parseFloat(e.target.value);
                                    if (Number.isNaN(parsed)) {
                                      e.target.value = String(source.trim);
                                      return;
                                    }
                                    const clamped = Math.max(SOURCE_TRIM_MIN_DB, Math.min(SOURCE_TRIM_MAX_DB, parsed));
                                    e.target.value = String(clamped);
                                    const sourceFamily = sourceFamilyByKey[source.key];
                                    if (sourceFamily === undefined) return;
                                    void (async () => {
                                      const ok = await runWithPending(
                                        `trim-${channel.channel}-${source.key}`,
                                        async () => {
                                          await setSourceTrim(
                                            mac,
                                            channel.channel,
                                            sourceFamily,
                                            clamped,
                                            source.delay
                                          );
                                        }
                                      );
                                      if (!ok) {
                                        e.target.value = String(source.trim);
                                      }
                                    })();
                                  }}
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
