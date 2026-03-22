"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useProjectStore } from "@/stores/ProjectStore";
import { useAmpStore } from "@/stores/AmpStore";
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
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Trash2, Plus, Sparkles } from "lucide-react";
import { useI18n } from "@/components/layout/i18n-provider";

interface ScannedDevice {
  ip: string;
  mac: string;
  name: string;
  deviceVersion: string;
  identifier: string;
  runtime: string;
}

interface AssignDemoAmpsDialogProps {
  trigger?: ReactNode;
}

export function AssignDemoAmpsDialog({ trigger }: AssignDemoAmpsDialogProps) {
  const dict = useI18n();
  const { selectedProject, projects, addAmpToProject, deleteAmpFromProject } = useProjectStore();
  const { amps, getDisplayName } = useAmpStore();
  const [open, setOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingOptions, setIsLoadingOptions] = useState(false);
  const [demoOptions, setDemoOptions] = useState<ScannedDevice[]>([]);
  const [loadError, setLoadError] = useState<string>("");

  if (!selectedProject) return null;
  const currentProject = projects.find((project) => project.id === selectedProject.id);
  if (!currentProject) return null;

  const assignedMacSet = useMemo(
    () => new Set(currentProject.assigned_amps.map((amp) => amp.mac.toUpperCase())),
    [currentProject.assigned_amps]
  );

  const availableOptions = useMemo(
    () => demoOptions.filter((device) => !assignedMacSet.has(device.mac.toUpperCase())),
    [demoOptions, assignedMacSet]
  );

  const loadDemoOptions = async () => {
    setIsLoadingOptions(true);
    setLoadError("");
    try {
      const response = await fetch("/api/scan?projectMode=demo");
      const data = (await response.json()) as {
        success?: boolean;
        error?: string;
        devices?: ScannedDevice[];
      };

      if (!response.ok) {
        setLoadError(data.error ?? "Failed to load demo amplifiers");
        setDemoOptions([]);
        return;
      }

      if (Array.isArray(data.devices)) {
        setDemoOptions(data.devices);
      } else {
        setDemoOptions([]);
      }
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Failed to load demo amplifiers");
      setDemoOptions([]);
    } finally {
      setIsLoadingOptions(false);
    }
  };

  const handleAddAmp = async (mac: string) => {
    setIsSaving(true);
    try {
      await addAmpToProject(selectedProject.id, mac);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : dict.dialogs.common.unknownError);
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddAll = async () => {
    if (availableOptions.length === 0) return;
    setIsSaving(true);
    setLoadError("");
    try {
      for (const device of availableOptions) {
        await addAmpToProject(selectedProject.id, device.mac);
      }
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : dict.dialogs.common.unknownError);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteAmp = async (mac: string) => {
    setIsSaving(true);
    try {
      await deleteAmpFromProject(selectedProject.id, mac);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : dict.dialogs.common.unknownError);
    } finally {
      setIsSaving(false);
    }
  };

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen) {
      void loadDemoOptions();
    }
  };

  const totalAmps = currentProject.assigned_amps.length;
  const reachableAmps = currentProject.assigned_amps.filter(
    (amp) => amps.find((runtimeAmp) => runtimeAmp.mac === amp.mac)?.reachable === true
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
            Demo Amps
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              {reachableAmps}/{totalAmps}
              <span className={`inline-block h-2 w-2 rounded-full ${statusColor}`} />
            </span>
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            Assign Demo Amplifiers
          </DialogTitle>
          <DialogDescription>This project is in demo mode. You can assign only simulated amplifiers.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Label className="text-sm font-semibold">Project Mode</Label>
              <Badge variant="secondary">Demo</Badge>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void loadDemoOptions()}
              disabled={isLoadingOptions || isSaving}
            >
              {isLoadingOptions ? "Refreshing..." : "Refresh Catalog"}
            </Button>
          </div>

          <Separator />

          <div className="space-y-2">
            <Label className="text-sm font-semibold">Assigned Demo Amps</Label>
            {currentProject.assigned_amps.length === 0 ? (
              <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
                No demo amps assigned yet
              </p>
            ) : (
              <div className="max-h-56 space-y-2 overflow-y-auto">
                {currentProject.assigned_amps.map((amp) => {
                  const ampInfo = amps.find((runtimeAmp) => runtimeAmp.mac === amp.mac);
                  return (
                    <div key={amp.mac} className="flex items-center justify-between rounded-md border p-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{ampInfo ? getDisplayName(ampInfo) : amp.mac}</p>
                        <p className="font-mono text-xs text-muted-foreground">{amp.mac}</p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void handleDeleteAmp(amp.mac)}
                        disabled={isSaving}
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <Separator />

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold">Available Demo Amps</Label>
              <Button
                variant="default"
                size="sm"
                onClick={() => void handleAddAll()}
                disabled={isSaving || availableOptions.length === 0}
              >
                <Plus className="mr-2 h-4 w-4" />
                Add All
              </Button>
            </div>

            {availableOptions.length === 0 ? (
              <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
                {isLoadingOptions ? "Loading demo amplifiers..." : "All demo amplifiers are already assigned"}
              </p>
            ) : (
              <div className="max-h-56 space-y-2 overflow-y-auto">
                {availableOptions.map((device) => (
                  <div key={device.mac} className="flex items-center justify-between rounded-md border p-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{device.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{device.deviceVersion}</p>
                      <p className="font-mono text-xs text-muted-foreground">{device.mac}</p>
                    </div>
                    <Button
                      onClick={() => void handleAddAmp(device.mac)}
                      size="sm"
                      variant="outline"
                      disabled={isSaving}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {loadError ? <p className="text-center text-xs text-destructive">{loadError}</p> : null}
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={isSaving || isLoadingOptions}>
              {dict.dialogs.common.cancel}
            </Button>
          </DialogClose>
          <DialogClose asChild>
            <Button disabled={isSaving || isLoadingOptions}>{dict.dialogs.common.done}</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
