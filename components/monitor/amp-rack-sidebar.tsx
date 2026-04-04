"use client";

import type { DragEvent } from "react";
import { useEffect, useState } from "react";
import { GripVertical } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { AssignAmpsDialog } from "@/components/dialogs/assign-amps-dialog";
import { AssignDemoAmpsDialog } from "@/components/dialogs/assign-demo-amps-dialog";
import { useAmpStore } from "@/stores/AmpStore";
import { useProjectStore } from "@/stores/ProjectStore";
import { useTabStore } from "@/stores/TabStore";
import type { Dictionary } from "@/lib/i18n/dictionaries";

interface AmpRackSidebarProps {
  dictionary: Dictionary["monitor"];
}

export function AmpRackSidebar({ dictionary }: AmpRackSidebarProps) {
  const { selectedProject, reorderAssignedAmps } = useProjectStore();
  const { amps, getDisplayName } = useAmpStore();
  const selectedMac = useTabStore((state) => state.selectedAmpMac);
  const setSelectedMac = useTabStore((state) => state.setSelectedAmpMac);

  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [draggedRackMac, setDraggedRackMac] = useState<string | null>(null);
  const [dragOverRackMac, setDragOverRackMac] = useState<string | null>(null);
  const [isReorderingRack, setIsReorderingRack] = useState(false);

  useEffect(() => {
    if (!amps.length) {
      if (selectedMac !== null) setSelectedMac(null);
      return;
    }

    if (!selectedMac || !amps.some((amp) => amp.mac === selectedMac)) {
      setSelectedMac(amps[0].mac);
    }
  }, [amps, selectedMac, setSelectedMac]);

  if (!selectedProject) {
    return null;
  }

  const canReorderRack = selectedProject.assigned_amps.length > 1 && !isReorderingRack;

  const handleRackDragStart = (event: DragEvent<HTMLButtonElement>, mac: string) => {
    event.dataTransfer.effectAllowed = "move";
    setDraggedRackMac(mac);
  };

  const handleRackDragOver = (event: DragEvent<HTMLDivElement>, mac: string) => {
    if (!canReorderRack) return;
    event.preventDefault();

    if (draggedRackMac && draggedRackMac !== mac) {
      setDragOverRackMac(mac);
    }
  };

  const handleRackDrop = async (event: DragEvent<HTMLDivElement>, targetMac: string) => {
    if (!canReorderRack) return;
    event.preventDefault();

    if (!draggedRackMac || draggedRackMac === targetMac) {
      setDraggedRackMac(null);
      setDragOverRackMac(null);
      return;
    }

    const currentOrder = selectedProject.assigned_amps.map((amp) => amp.mac);
    const fromIndex = currentOrder.findIndex((mac) => mac.toUpperCase() === draggedRackMac.toUpperCase());
    const toIndex = currentOrder.findIndex((mac) => mac.toUpperCase() === targetMac.toUpperCase());

    if (fromIndex < 0 || toIndex < 0) {
      setDraggedRackMac(null);
      setDragOverRackMac(null);
      return;
    }

    const nextOrder = [...currentOrder];
    const [moved] = nextOrder.splice(fromIndex, 1);
    nextOrder.splice(toIndex, 0, moved);

    setIsReorderingRack(true);
    try {
      await reorderAssignedAmps(selectedProject.id, nextOrder);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to reorder amps");
    } finally {
      setIsReorderingRack(false);
      setDraggedRackMac(null);
      setDragOverRackMac(null);
    }
  };

  const clearRackDragState = () => {
    setDraggedRackMac(null);
    setDragOverRackMac(null);
  };

  return (
    <aside className="max-h-48 overflow-y-auto rounded-lg border border-border/50 bg-card/25 p-2 xl:max-h-none">
      <div className="mb-2 flex items-center justify-between border-b border-border/50 px-2 pb-2">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] leading-tight whitespace-normal break-words text-muted-foreground">
            {dictionary.ampTabs.ampRack}
          </p>
        </div>

        {selectedProject.projectMode === "demo" ? (
          <AssignDemoAmpsDialog
            trigger={
              <Button size="sm" variant="outline" className="h-8 px-2 text-xs">
                {dictionary.ampTabs.assignAction}
              </Button>
            }
          />
        ) : (
          <AssignAmpsDialog
            open={assignDialogOpen}
            onOpenChange={setAssignDialogOpen}
            trigger={
              <Button size="sm" variant="outline" className="h-8 px-2 text-xs">
                {dictionary.ampTabs.assignAction}
              </Button>
            }
          />
        )}
      </div>

      <div className="space-y-1.5">
        {amps.map((amp) => {
          const selected = selectedMac === amp.mac;
          return (
            <div
              key={amp.mac}
              onDragOver={(event) => handleRackDragOver(event, amp.mac)}
              onDrop={(event) => void handleRackDrop(event, amp.mac)}
              onDragLeave={() => {
                if (dragOverRackMac === amp.mac) {
                  setDragOverRackMac(null);
                }
              }}
              className={`relative rounded-md ${dragOverRackMac === amp.mac ? "bg-accent/70" : ""}`}
            >
              {canReorderRack && (
                <button
                  type="button"
                  draggable
                  onDragStart={(event) => handleRackDragStart(event, amp.mac)}
                  onDragEnd={clearRackDragState}
                  className="absolute left-2 top-1/2 z-10 flex h-4 w-4 -translate-y-1/2 items-center justify-center bg-transparent p-0 text-muted-foreground outline-none cursor-grab active:cursor-grabbing"
                  aria-label="Reorder amp"
                >
                  <GripVertical className="h-4 w-4" />
                </button>
              )}

              <Button
                variant={selected ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setSelectedMac(amp.mac)}
                className={`h-11 w-full justify-start gap-2.5 whitespace-nowrap font-medium ${canReorderRack ? "pl-8 pr-2.5" : "px-2.5"}`}
              >
                <div
                  className={`h-2 w-2 flex-shrink-0 rounded-full ${amp.reachable ? "bg-emerald-500" : "bg-rose-500"}`}
                />
                <div className="min-w-0 text-left">
                  <p className="truncate text-xs font-semibold">{getDisplayName(amp)}</p>
                  <p className="truncate text-[10px] opacity-70">{amp.mac}</p>
                </div>
              </Button>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
