"use client";

import { useState } from "react";
import { useProjectStore } from "@/stores/ProjectStore";
import { useAmpStore } from "@/stores/AmpStore";
import { toast } from "sonner";
import { useI18n } from "@/components/layout/i18n-provider";

export interface ScannedDevice {
  ip: string;
  mac: string;
  name: string;
  deviceVersion: string;
  identifier: string;
  runtime: string;
}

export function useAssignAmps() {
  const dict = useI18n();
  const { selectedProject, projects, addAmpToProject, deleteAmpFromProject, updateAmpLastKnownIp } = useProjectStore();
  const { amps, getDisplayName } = useAmpStore();

  const [ipInput, setIpInput] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isProbing, setIsProbing] = useState(false);
  const [mode, setMode] = useState<"manual" | "scan">("scan");
  const [scannedDevices, setScannedDevices] = useState<ScannedDevice[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState("");
  const [probeInputByMac, setProbeInputByMac] = useState<Record<string, string>>({});
  const [isProbingByMac, setIsProbingByMac] = useState<Record<string, boolean>>({});

  const currentProject = selectedProject ? (projects.find((p) => p.id === selectedProject.id) ?? null) : null;

  const handleAddAmp = async () => {
    if (!selectedProject) return;
    const ip = ipInput.trim();
    if (!ip) {
      toast.error(dict.dialogs.assignAmps.enterIp);
      return;
    }
    if (!/^\d+\.\d+\.\d+\.\d+$/.test(ip)) {
      toast.error(dict.dialogs.assignAmps.invalidIp);
      return;
    }

    setIsProbing(true);
    try {
      const response = await fetch("/api/amp-advanced/probe-ip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ip })
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        toast.error(data.error ?? dict.dialogs.assignAmps.noAmpAtIp);
        return;
      }
      await addAmpToProject(selectedProject.id, data.mac);
      await updateAmpLastKnownIp(data.mac, ip);
      setIpInput("");
      toast.success(`Added ${data.name} (${data.mac})`);
    } catch (error) {
      toast.error(
        `${dict.dialogs.assignAmps.errorAddingAmp}: ${error instanceof Error ? error.message : dict.dialogs.common.unknownError}`
      );
    } finally {
      setIsProbing(false);
    }
  };

  const handleAddFromScan = async (mac: string) => {
    if (!selectedProject) return;
    setIsSaving(true);
    try {
      await addAmpToProject(selectedProject.id, mac);
      setScannedDevices((prev) => prev.filter((d) => d.mac !== mac));
    } catch (error) {
      toast.error(
        `${dict.dialogs.assignAmps.errorAddingAmp}: ${error instanceof Error ? error.message : dict.dialogs.common.unknownError}`
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteAmp = async (mac: string) => {
    if (!selectedProject) return;
    setIsSaving(true);
    try {
      await deleteAmpFromProject(selectedProject.id, mac);
    } catch (error) {
      toast.error(
        `${dict.dialogs.assignAmps.errorDeletingAmp}: ${error instanceof Error ? error.message : dict.dialogs.common.unknownError}`
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleScan = async () => {
    if (!currentProject) return;
    setIsScanning(true);
    setScanError("");
    try {
      const response = await fetch(`/api/scan?projectMode=${encodeURIComponent(currentProject.projectMode ?? "real")}`);
      if (!response.ok) {
        setScanError(dict.dialogs.assignAmps.scanFailedNoDevices);
        setScannedDevices([]);
        return;
      }
      const data = await response.json();
      if (data.devices && Array.isArray(data.devices)) {
        const assignedMacs = currentProject.assigned_amps.map((a) => a.mac.toUpperCase());
        const unassigned = data.devices.filter((d: ScannedDevice) => !assignedMacs.includes(d.mac.toUpperCase()));
        setScannedDevices(unassigned);
        if (unassigned.length === 0) setScanError(dict.dialogs.assignAmps.allDiscoveredAssigned);
      } else {
        setScanError(dict.dialogs.assignAmps.invalidResponseFormat);
      }
    } catch (error) {
      setScanError(
        `${dict.dialogs.assignAmps.scanError}: ${error instanceof Error ? error.message : dict.dialogs.common.unknownError}`
      );
    } finally {
      setIsScanning(false);
    }
  };

  const handleProbeOfflineAmp = async (mac: string) => {
    const ip = (probeInputByMac[mac] ?? "").trim();
    if (!ip) return;
    if (!/^\d+\.\d+\.\d+\.\d+$/.test(ip)) {
      toast.error(dict.dialogs.assignAmps.invalidIp);
      return;
    }

    setIsProbingByMac((prev) => ({ ...prev, [mac]: true }));
    try {
      const response = await fetch("/api/amp-advanced/probe-ip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ip })
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        toast.error(data.error ?? dict.dialogs.assignAmps.noAmpAtIp);
        return;
      }
      if (data.mac.toUpperCase() === mac.toUpperCase()) {
        await updateAmpLastKnownIp(mac, ip);
        setProbeInputByMac((prev) => ({ ...prev, [mac]: "" }));
        toast.success(`Found ${data.name} at ${ip}`);
      } else {
        toast.error(`Found ${data.name} (${data.mac}) at ${ip} - expected ${mac}`);
      }
    } catch (error) {
      toast.error(
        `${dict.dialogs.assignAmps.scanError}: ${error instanceof Error ? error.message : dict.dialogs.common.unknownError}`
      );
    } finally {
      setIsProbingByMac((prev) => ({ ...prev, [mac]: false }));
    }
  };

  return {
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
  };
}
