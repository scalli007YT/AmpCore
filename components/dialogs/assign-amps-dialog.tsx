"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AssignDemoAmpsDialog } from "@/components/dialogs/assign-demo-amps-dialog";
import { Trash2, Plus, Wifi } from "lucide-react";
import { useI18n } from "@/components/layout/i18n-provider";
import { useAssignAmps } from "@/hooks/useAssignAmps";

interface AssignAmpsDialogProps {
  trigger?: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function AssignAmpsDialog({ trigger, open: openProp, onOpenChange }: AssignAmpsDialogProps) {
  const dict = useI18n();
  const {
    amps,
    getDisplayName,
    selectedProject,
    currentProject,
    ipInput,
    setIpInput,
    isSaving,
    isProbing,
    mode,
    setMode,
    scannedDevices,
    isScanning,
    scanError,
    setScanError,
    probeInputByMac,
    setProbeInputByMac,
    isProbingByMac,
    handleAddAmp,
    handleAddFromScan,
    handleDeleteAmp,
    handleScan,
    handleProbeOfflineAmp
  } = useAssignAmps();

  const [internalOpen, setInternalOpen] = useState(false);
  const open = openProp ?? internalOpen;
  const setDialogOpen = (nextOpen: boolean) => {
    if (openProp === undefined) setInternalOpen(nextOpen);
    onOpenChange?.(nextOpen);
  };

  if (!selectedProject) return null;
  if (!currentProject) return null;

  if (currentProject.projectMode === "demo") {
    return <AssignDemoAmpsDialog trigger={trigger} />;
  }

  const handleOpenChange = (nextOpen: boolean) => {
    setDialogOpen(nextOpen);
    if (nextOpen) {
      setMode("scan");
      void handleScan();
    }
  };

  const totalAmps = currentProject.assigned_amps.length;
  const reachableAmps = currentProject.assigned_amps.filter(
    (a) => amps.find((s) => s.mac === a.mac)?.reachable === true
  ).length;
  const statusColor =
    totalAmps === 0
      ? "bg-muted/40"
      : reachableAmps === totalAmps
        ? "bg-green-500"
        : reachableAmps === 0
          ? "bg-red-500"
          : "bg-orange-400";

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline" size="sm" className="gap-2">
            {dict.dialogs.assignAmps.manageAmps}
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              {reachableAmps}/{totalAmps}
              <span className={`inline-block w-2 h-2 rounded-full ${statusColor}`} />
            </span>
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wifi className="h-4 w-4" />
            {dict.dialogs.assignAmps.title}
          </DialogTitle>
          <DialogDescription>{dict.dialogs.assignAmps.description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-sm font-semibold">{dict.dialogs.assignAmps.assignedAmps}</Label>
            {currentProject.assigned_amps.length > 0 ? (
              <div className="border rounded-lg divide-y max-h-64 overflow-y-auto">
                {currentProject.assigned_amps.map((amp) => {
                  const ampInfo = amps.find((a) => a.mac === amp.mac);
                  return (
                    <div key={amp.mac} className="p-3 hover:bg-accent space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="flex items-center gap-3 flex-1 min-w-0 cursor-default">
                              <div className="flex-shrink-0">
                                <div
                                  className={`h-3 w-3 rounded-full ${ampInfo?.reachable ? "bg-green-500" : "bg-red-500"}`}
                                />
                              </div>

                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold">
                                  {ampInfo ? getDisplayName(ampInfo) : dict.dialogs.assignAmps.unknownAmp}
                                </p>
                                <p className="text-xs text-muted-foreground font-mono">{amp.mac}</p>
                                {!ampInfo?.reachable && amp.lastKnownIp && (
                                  <p className="text-xs text-muted-foreground font-mono">{amp.lastKnownIp}</p>
                                )}
                              </div>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent side="left">
                            <p>
                              {dict.dialogs.assignAmps.status}:{" "}
                              {ampInfo?.reachable
                                ? dict.dialogs.assignAmps.reachable
                                : dict.dialogs.assignAmps.unreachable}
                            </p>
                            <p>
                              {dict.dialogs.assignAmps.mac}: {amp.mac}
                            </p>
                            <p>
                              {dict.dialogs.assignAmps.ipAddress}: {ampInfo?.ip ?? amp.lastKnownIp ?? "-"}
                            </p>
                            <p>
                              {dict.dialogs.assignAmps.name}: {ampInfo ? getDisplayName(ampInfo) : "-"}
                            </p>
                            <p>
                              {dict.dialogs.assignAmps.version}: {ampInfo?.version ?? "-"}
                            </p>
                            <p>
                              {dict.dialogs.assignAmps.id}: {ampInfo?.id ?? "-"}
                            </p>
                            <p>
                              {dict.dialogs.assignAmps.runtime}:
                              {ampInfo?.run_time !== undefined
                                ? `${Math.floor(ampInfo.run_time / 60)}h ${ampInfo.run_time % 60}min`
                                : "-"}
                            </p>
                          </TooltipContent>
                        </Tooltip>

                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteAmp(amp.mac)}
                          className="text-destructive hover:text-destructive hover:bg-destructive/10 flex-shrink-0"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>

                      {!ampInfo?.reachable && (
                        <div className="flex items-center gap-2 pl-6">
                          <Input
                            placeholder={dict.dialogs.assignAmps.ipPlaceholder}
                            value={probeInputByMac[amp.mac] ?? ""}
                            onChange={(e) =>
                              setProbeInputByMac((prev) => ({
                                ...prev,
                                [amp.mac]: e.target.value
                              }))
                            }
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                void handleProbeOfflineAmp(amp.mac);
                              }
                            }}
                            className="font-mono text-xs h-7"
                          />
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs px-2"
                            disabled={isProbingByMac[amp.mac] === true}
                            onClick={() => void handleProbeOfflineAmp(amp.mac)}
                          >
                            Probe
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
                {dict.dialogs.assignAmps.noAmpsAssigned}
              </p>
            )}
          </div>

          <div className="border-t pt-4 space-y-3">
            <Label className="text-sm font-semibold">{dict.dialogs.assignAmps.addNewAmp}</Label>

            <div className="flex gap-2">
              <Button
                variant={mode === "scan" ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  setMode("scan");
                  setScanError("");
                }}
                className="flex-1"
              >
                <Wifi className="h-4 w-4 mr-2" />
                {dict.dialogs.assignAmps.scanNetwork}
              </Button>
              <Button
                variant={mode === "manual" ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  setMode("manual");
                  setScanError("");
                }}
                className="flex-1"
              >
                {dict.dialogs.assignAmps.manualEntry}
              </Button>
            </div>

            {mode === "manual" && (
              <div className="space-y-2">
                <div>
                  <Label htmlFor="ip-input" className="text-xs">
                    {dict.dialogs.assignAmps.ipAddress}
                  </Label>
                  <Input
                    id="ip-input"
                    placeholder={dict.dialogs.assignAmps.ipPlaceholder}
                    value={ipInput}
                    onChange={(e) => setIpInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        void handleAddAmp();
                      }
                    }}
                    className="font-mono text-sm"
                  />
                </div>
                <Button onClick={handleAddAmp} disabled={isSaving || isProbing} className="w-full" size="sm">
                  <Plus className="h-4 w-4 mr-2" />
                  {isProbing ? dict.dialogs.assignAmps.probing : dict.dialogs.assignAmps.addAmp}
                </Button>
              </div>
            )}

            {mode === "scan" && (
              <div className="space-y-2">
                <Button onClick={handleScan} disabled={isScanning || isSaving} className="w-full" size="sm">
                  <Wifi className="h-4 w-4 mr-2" />
                  {isScanning ? dict.dialogs.assignAmps.scanning : dict.dialogs.assignAmps.startScan}
                </Button>

                <p className="text-xs text-muted-foreground text-center italic">{dict.dialogs.assignAmps.scanNote}</p>

                {scanError && <p className="text-xs text-destructive text-center">{scanError}</p>}

                {scannedDevices.length > 0 && (
                  <div className="border rounded-lg divide-y max-h-48 overflow-y-auto">
                    {scannedDevices.map((device) => (
                      <div key={device.mac} className="flex items-center justify-between p-3 hover:bg-accent">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold truncate">{device.name}</p>
                          <p className="text-xs text-muted-foreground font-mono">{device.mac}</p>
                          <p className="text-xs text-muted-foreground truncate">{device.ip}</p>
                        </div>
                        <Button
                          onClick={() => handleAddFromScan(device.mac)}
                          disabled={isSaving}
                          size="sm"
                          variant="outline"
                          className="ml-2 flex-shrink-0"
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={isSaving || isScanning}>
              {dict.dialogs.common.cancel}
            </Button>
          </DialogClose>
          <Button onClick={() => setDialogOpen(false)} disabled={isSaving || isScanning}>
            {isSaving ? dict.dialogs.common.saving : dict.dialogs.common.done}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
