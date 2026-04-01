"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { GripVertical, Info } from "lucide-react";
import Draggable, { type DraggableData, type DraggableEvent } from "react-draggable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { type LibraryFileEntry, useLibraryStore } from "@/stores/LibraryStore";
import { fileKey as getFileKey } from "@/lib/speaker-config";
import { useSpeakerConfigStore } from "@/stores/SpeakerConfigStore";
import { useI18n } from "@/components/layout/i18n-provider";

interface SpeakerLibraryBrowserProps {
  isActive: boolean;
}

interface DragPayload {
  id: string;
  model: string;
  ways: string;
  wayCount: number;
}

interface DraggableLibraryRowProps {
  file: LibraryFileEntry;
  selected: boolean;
  isDragging: boolean;
  dragPayload: DragPayload;
  setSelectedFileId: (fileId: string | null) => void;
  setActiveDraggedItem: (item: DragPayload | null) => void;
  setDragState: React.Dispatch<React.SetStateAction<{ id: string; x: number; y: number } | null>>;
  beginDragPreview: (file: LibraryFileEntry, event: DraggableEvent) => void;
  updateDragPreview: (event: DraggableEvent) => void;
  finishDrag: (payload: DragPayload, event: DraggableEvent) => void;
}

function DraggableLibraryRow({
  file,
  selected,
  isDragging,
  dragPayload,
  setSelectedFileId,
  setActiveDraggedItem,
  setDragState,
  beginDragPreview,
  updateDragPreview,
  finishDrag
}: DraggableLibraryRowProps) {
  const nodeRef = useRef<HTMLDivElement>(null);
  const note = file.notes?.trim() ?? "";
  const hasNote = note.length > 0;
  const waysText = file.wayLabelsText?.trim() || file.ways.map((way) => way.label).join(" & ");
  const fk = getFileKey(file);
  const { showNote, dragTitle } = useI18n().dialogs.speakerConfig.library;

  return (
    <Draggable
      nodeRef={nodeRef}
      axis="both"
      handle="[data-drag-handle='true']"
      position={{ x: 0, y: 0 }}
      onStart={(event) => {
        setSelectedFileId(fk);
        setActiveDraggedItem(dragPayload);
        setDragState({ id: fk, x: 0, y: 0 });
        beginDragPreview(file, event);
      }}
      onDrag={(event, data: DraggableData) => {
        setDragState({ id: fk, x: data.x, y: data.y });
        updateDragPreview(event);
      }}
      onStop={(event) => {
        finishDrag(dragPayload, event);
      }}
    >
      <div
        ref={nodeRef}
        className={[
          "border-b border-border/40 px-3 py-2 text-sm transition-shadow last:border-b-0",
          selected ? "bg-primary/10" : "hover:bg-muted/20",
          isDragging ? "cursor-grabbing opacity-0" : "cursor-pointer"
        ].join(" ")}
        role="button"
        tabIndex={0}
        title={dragTitle}
        onClick={() => setSelectedFileId(fk)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setSelectedFileId(fk);
          }
        }}
      >
        <div className="grid grid-cols-[40px_56px_minmax(0,1fr)_minmax(0,0.9fr)_minmax(0,1fr)_minmax(0,1fr)_56px_110px] gap-2">
          <div
            data-drag-handle="true"
            className={`flex items-center justify-center text-muted-foreground/60 ${isDragging ? "cursor-grabbing" : "cursor-grab"}`}
          >
            <GripVertical className="h-4 w-4" aria-hidden="true" />
          </div>
          <div className="flex items-center justify-center">
            {hasNote ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex h-6 w-6 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    aria-label={showNote}
                    onClick={(event) => event.stopPropagation()}
                  >
                    <Info className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-64 text-xs">
                  {note}
                </TooltipContent>
              </Tooltip>
            ) : (
              <span
                className="inline-flex h-6 w-6 items-center justify-center text-muted-foreground/35"
                aria-hidden="true"
              >
                <Info className="h-3.5 w-3.5" />
              </span>
            )}
          </div>
          <span className="truncate font-medium">{file.brand || "-"}</span>
          <span className="truncate">{file.family || "-"}</span>
          <span className="truncate">{file.model || "-"}</span>
          <span className="truncate">{file.application || "-"}</span>
          <span className="text-center font-mono">{file.wayCount || 0}</span>
          <span className="truncate">{waysText || "-"}</span>
        </div>
        {file.parseError && <div className="mt-1 text-[11px] text-destructive">{file.parseError}</div>}
      </div>
    </Draggable>
  );
}

export function SpeakerLibraryBrowser({ isActive }: SpeakerLibraryBrowserProps) {
  const lib = useI18n().dialogs.speakerConfig.library;
  const files = useLibraryStore((state) => state.files);
  const loading = useLibraryStore((state) => state.loading);
  const error = useLibraryStore((state) => state.error);
  const hasLoaded = useLibraryStore((state) => state.hasLoaded);
  const loadLibrary = useLibraryStore((state) => state.loadLibrary);
  const selectedFileId = useLibraryStore((state) => state.selectedFileId);
  const setSelectedFileId = useLibraryStore((state) => state.setSelectedFileId);
  const setActiveDraggedItem = useSpeakerConfigStore((state) => state.setActiveDraggedItem);
  const setDragHoverChannel = useSpeakerConfigStore((state) => state.setDragHoverChannel);
  const assignItemToOutputs = useSpeakerConfigStore((state) => state.assignItemToOutputs);

  const [brandFilter, setBrandFilter] = useState("");
  const [familyFilter, setFamilyFilter] = useState("");
  const [modelFilter, setModelFilter] = useState("");
  const [waysNoFilter, setWaysNoFilter] = useState("all");
  const [dragState, setDragState] = useState<{ id: string; x: number; y: number } | null>(null);
  const [dragPreview, setDragPreview] = useState<{ file: LibraryFileEntry; x: number; y: number } | null>(null);

  useEffect(() => {
    if (!isActive || hasLoaded || loading) return;
    void loadLibrary();
  }, [isActive, hasLoaded, loading, loadLibrary]);

  const waysNoOptions = useMemo(() => {
    const unique = new Set<number>();
    files.forEach((file) => unique.add(file.wayCount || 0));
    return Array.from(unique).sort((a, b) => a - b);
  }, [files]);

  const filteredFiles = useMemo(() => {
    const brandNeedle = brandFilter.trim().toLowerCase();
    const familyNeedle = familyFilter.trim().toLowerCase();
    const modelNeedle = modelFilter.trim().toLowerCase();

    return files.filter((file) => {
      if (brandNeedle && !file.brand.toLowerCase().includes(brandNeedle)) return false;
      if (familyNeedle && !file.family.toLowerCase().includes(familyNeedle)) return false;
      if (modelNeedle && !file.model.toLowerCase().includes(modelNeedle)) return false;
      if (waysNoFilter !== "all" && String(file.wayCount || 0) !== waysNoFilter) return false;
      return true;
    });
  }, [files, brandFilter, familyFilter, modelFilter, waysNoFilter]);

  const clearFilters = () => {
    setBrandFilter("");
    setFamilyFilter("");
    setModelFilter("");
    setWaysNoFilter("all");
  };

  const getPointerPosition = (event: DraggableEvent): { x: number; y: number } | null => {
    if ("clientX" in event && typeof event.clientX === "number") {
      return { x: event.clientX, y: event.clientY };
    }

    const touchEvent = event as TouchEvent;
    const touch = touchEvent.touches?.[0] ?? touchEvent.changedTouches?.[0];
    if (touch) {
      return { x: touch.clientX, y: touch.clientY };
    }

    return null;
  };

  const getDropTargetAtPoint = (x: number, y: number): HTMLElement | null => {
    const target = document.elementFromPoint(x, y);
    if (!(target instanceof HTMLElement)) return null;
    const dropTarget = target.closest("[data-output-drop-target='true']");
    return dropTarget instanceof HTMLElement ? dropTarget : null;
  };

  const updateHoverTarget = (event: DraggableEvent): void => {
    const pointer = getPointerPosition(event);
    if (!pointer) {
      setDragHoverChannel(null);
      return;
    }

    const dropTarget = getDropTargetAtPoint(pointer.x, pointer.y);
    const channel = dropTarget ? Number(dropTarget.dataset.outputChannel) : Number.NaN;
    setDragHoverChannel(Number.isInteger(channel) ? channel : null);
  };

  const beginDragPreview = (file: LibraryFileEntry, event: DraggableEvent): void => {
    const pointer = getPointerPosition(event);
    if (pointer) {
      setDragPreview({ file, x: pointer.x, y: pointer.y });
    } else {
      setDragPreview({ file, x: 0, y: 0 });
    }
    updateHoverTarget(event);
  };

  const updateDragPreview = (event: DraggableEvent): void => {
    const pointer = getPointerPosition(event);
    if (pointer) {
      setDragPreview((current) => (current ? { ...current, x: pointer.x, y: pointer.y } : current));
    }
    updateHoverTarget(event);
  };

  const finishDrag = (
    payload: { id: string; model: string; ways: string; wayCount: number },
    event: DraggableEvent
  ): void => {
    const pointer = getPointerPosition(event);
    if (pointer) {
      const dropTarget = getDropTargetAtPoint(pointer.x, pointer.y);
      if (dropTarget) {
        const channel = Number(dropTarget.dataset.outputChannel);
        const maxChannels = Number(dropTarget.dataset.outputMax);
        const scope = dropTarget.dataset.outputScope || undefined;

        if (Number.isInteger(channel) && Number.isInteger(maxChannels)) {
          assignItemToOutputs({
            startChannel: channel,
            maxChannels,
            item: payload,
            scope
          });
        }
      }
    }

    setDragHoverChannel(null);
    setActiveDraggedItem(null);
    setDragState(null);
    setDragPreview(null);
  };

  return (
    <section className="flex h-full min-h-0 flex-col rounded-md border border-border/50 bg-background/30 p-3">
      <div className="mb-2.5 flex items-center justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <h3 className="text-sm font-semibold">{lib.title}</h3>
          {!loading && !error && <span className="text-xs text-muted-foreground">{filteredFiles.length}</span>}
        </div>
        <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => void loadLibrary()}>
          {lib.refresh}
        </Button>
      </div>

      <div className="mb-2.5 rounded-md border border-border/50 bg-muted/10 p-3">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="speaker-filter-brand" className="text-xs text-muted-foreground">
              {lib.filterBrandLabel}
            </Label>
            <Input
              id="speaker-filter-brand"
              value={brandFilter}
              onChange={(e) => setBrandFilter(e.target.value)}
              placeholder={lib.filterBrandPlaceholder}
              className="h-8"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="speaker-filter-family" className="text-xs text-muted-foreground">
              {lib.filterFamilyLabel}
            </Label>
            <Input
              id="speaker-filter-family"
              value={familyFilter}
              onChange={(e) => setFamilyFilter(e.target.value)}
              placeholder={lib.filterFamilyPlaceholder}
              className="h-8"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="speaker-filter-model" className="text-xs text-muted-foreground">
              {lib.filterModelLabel}
            </Label>
            <Input
              id="speaker-filter-model"
              value={modelFilter}
              onChange={(e) => setModelFilter(e.target.value)}
              placeholder={lib.filterModelPlaceholder}
              className="h-8"
            />
          </div>
        </div>

        <div className="mt-3 flex items-end gap-3">
          <div className="w-40 shrink-0 space-y-1.5">
            <Label className="text-xs text-muted-foreground">{lib.filterWaysLabel}</Label>
            <Select value={waysNoFilter} onValueChange={setWaysNoFilter}>
              <SelectTrigger className="h-8 w-full">
                <SelectValue placeholder={lib.filterWaysAny} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{lib.filterWaysAny}</SelectItem>
                {waysNoOptions.map((num) => (
                  <SelectItem key={num} value={String(num)}>
                    {num}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="ml-auto">
            <Button size="sm" variant="ghost" className="h-8 px-2 text-xs" onClick={clearFilters}>
              {lib.clearFilters}
            </Button>
          </div>
        </div>
      </div>

      {loading && <p className="text-sm text-muted-foreground">{lib.loading}</p>}
      {!loading && error && <p className="text-sm text-destructive">{error}</p>}
      {!loading && !error && filteredFiles.length === 0 && (
        <p className="text-sm text-muted-foreground">{lib.noResults}</p>
      )}

      {!loading && !error && filteredFiles.length > 0 && (
        <div className="min-h-0 flex-1 overflow-hidden rounded-md border border-border/50">
          <div className="grid grid-cols-[40px_56px_minmax(0,1fr)_minmax(0,0.9fr)_minmax(0,1fr)_minmax(0,1fr)_56px_110px] gap-2 border-b border-border/50 bg-muted/20 px-3 py-2 text-[10px] font-semibold tracking-[0.14em] text-muted-foreground">
            <span className="text-center">{lib.colDrag}</span>
            <span className="text-center">{lib.colNote}</span>
            <span>{lib.colBrand}</span>
            <span>{lib.colFamily}</span>
            <span>{lib.colModel}</span>
            <span>{lib.colApplication}</span>
            <span className="text-center">{lib.colWays}</span>
            <span>{lib.colWaysLabel}</span>
          </div>
          <TooltipProvider>
            <div className="h-full min-h-0 overflow-y-auto">
              {filteredFiles.map((file) => {
                const wayCount = Math.max(1, file.wayCount || file.ways.length || 1);
                const waysText = file.wayLabelsText?.trim() || file.ways.map((way) => way.label).join(" & ");
                const modelLabel = [file.brand, file.model].filter(Boolean).join(" ").trim() || file.id || file.name;
                const fk = getFileKey(file);
                const selected = selectedFileId === fk;
                const dragPayload = {
                  id: fk,
                  model: modelLabel,
                  ways: waysText,
                  wayCount
                };
                const isDragging = dragState?.id === fk;

                return (
                  <DraggableLibraryRow
                    key={fk}
                    file={file}
                    selected={selected}
                    isDragging={isDragging}
                    dragPayload={dragPayload}
                    setSelectedFileId={setSelectedFileId}
                    setActiveDraggedItem={setActiveDraggedItem}
                    setDragState={setDragState}
                    beginDragPreview={beginDragPreview}
                    updateDragPreview={updateDragPreview}
                    finishDrag={finishDrag}
                  />
                );
              })}
            </div>
          </TooltipProvider>
        </div>
      )}
      {dragPreview &&
        createPortal(
          <div
            className="pointer-events-none fixed left-0 top-0 z-[9999] w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-primary/30 bg-background/95 px-3 py-2 shadow-2xl ring-1 ring-black/5 backdrop-blur-sm"
            style={{ transform: `translate(${dragPreview.x + 18}px, ${dragPreview.y + 18}px)` }}
          >
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/12 text-primary">
                <GripVertical className="h-4 w-4" aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-semibold text-foreground">
                    {[dragPreview.file.brand, dragPreview.file.model].filter(Boolean).join(" ") ||
                      dragPreview.file.name}
                  </p>
                  <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                    {dragPreview.file.wayCount || 0} way
                  </span>
                </div>
                <p className="truncate text-xs text-muted-foreground">
                  {[dragPreview.file.family, dragPreview.file.application].filter(Boolean).join(" • ") ||
                    "Speaker preset"}
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {(dragPreview.file.wayLabelsText?.trim() || dragPreview.file.ways.map((way) => way.label).join(" & "))
                    .split("&")
                    .map((label) => label.trim())
                    .filter(Boolean)
                    .slice(0, 4)
                    .map((label) => (
                      <span
                        key={label}
                        className="rounded-full border border-border/60 bg-muted/40 px-2 py-0.5 text-[11px] text-foreground/80"
                      >
                        {label}
                      </span>
                    ))}
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}
    </section>
  );
}
