"use client";

import { useState } from "react";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useI18n } from "@/components/layout/i18n-provider";

// ---------------------------------------------------------------------------
// Shared types (re-exported so speaker-control-bar can import from here)
// ---------------------------------------------------------------------------

export type SlImportWayPreview = {
  id: string;
  label: string;
  role: string;
  deviceData: {
    physicalChannel: number;
    variant: string;
    hex: string;
    byteLength: number;
    parsed: Record<string, unknown>;
  };
};

export type SlImportParseResult = {
  success: boolean;
  error?: string;
  id: string;
  brand: string;
  family: string;
  model: string;
  notes: string;
  wayLabelsText: string;
  wayCount: number;
  ways: SlImportWayPreview[];
};

export interface SlFolderItem {
  fileName: string;
  result: SlImportParseResult | null;
  error?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface ImportSlFolderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: SlFolderItem[];
  parsing: boolean;
  onSelect: (result: SlImportParseResult, fileName: string) => void;
}

export function ImportSlFolderDialog({ open, onOpenChange, items, parsing, onSelect }: ImportSlFolderDialogProps) {
  const i18n = useI18n();
  const dict = i18n.dialogs.speakerConfig.importSlFolderDialog;

  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);

  const successItems = items.filter((item) => item.result !== null);
  const failedCount = items.length - successItems.length;
  const selectedItem = successItems.find((item) => item.fileName === selectedFileName) ?? null;

  const handleImport = () => {
    if (!selectedItem?.result) return;
    onSelect(selectedItem.result, selectedItem.fileName);
    setSelectedFileName(null);
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) setSelectedFileName(null);
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="w-[90vw] sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{dict.title}</DialogTitle>
          <DialogDescription>
            {parsing ? dict.parsing : dict.desc.replace("{count}", String(items.length))}
          </DialogDescription>
        </DialogHeader>

        {parsing ? (
          <div className="flex items-center justify-center gap-3 py-12 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">{dict.parsing}</span>
          </div>
        ) : items.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">{dict.noFiles}</div>
        ) : (
          <div className="flex flex-col gap-2">
            {failedCount > 0 && (
              <p className="text-xs text-destructive">
                {dict.partialFail.replace("{failed}", String(failedCount)).replace("{total}", String(items.length))}
              </p>
            )}

            <div className="overflow-hidden rounded-md border border-border">
              {/* Table header */}
              <div className="grid grid-cols-[2fr_1fr_2fr_1fr_3rem] gap-2 bg-muted/50 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <span>{dict.colFile}</span>
                <span>{dict.colBrand}</span>
                <span>{dict.colModel}</span>
                <span>{dict.colNotes}</span>
                <span className="text-right">{dict.colWays}</span>
              </div>

              {/* Table rows */}
              <div className="max-h-72 divide-y divide-border overflow-y-auto">
                {items.map((item) => {
                  const ok = item.result !== null;
                  const isSelected = item.fileName === selectedFileName;

                  return (
                    <button
                      key={item.fileName}
                      type="button"
                      disabled={!ok}
                      onClick={() => setSelectedFileName(item.fileName)}
                      className={cn(
                        "grid w-full grid-cols-[2fr_1fr_2fr_1fr_3rem] gap-2 px-3 py-2.5 text-left text-xs transition-colors",
                        ok && !isSelected && "cursor-pointer hover:bg-muted/40",
                        isSelected && "bg-primary/10 ring-1 ring-inset ring-primary/30",
                        !ok && "cursor-not-allowed opacity-40"
                      )}
                    >
                      <span className="flex min-w-0 items-center gap-1.5 font-medium">
                        {ok ? (
                          <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0 text-emerald-500" />
                        ) : (
                          <XCircle className="h-3.5 w-3.5 flex-shrink-0 text-destructive" />
                        )}
                        <span className="truncate">{item.fileName}</span>
                      </span>
                      <span className="text-muted-foreground">{item.result?.brand || "—"}</span>
                      <span>{[item.result?.family, item.result?.model].filter(Boolean).join(" / ") || "—"}</span>
                      <span className="text-muted-foreground italic">{item.result?.notes || "—"}</span>
                      <span className="text-right tabular-nums text-muted-foreground">
                        {item.result ? String(item.result.wayCount) : "—"}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Way labels summary for selected item */}
            {selectedItem?.result?.wayLabelsText && (
              <p className="text-[11px] text-muted-foreground">
                <span className="font-semibold">{dict.colWays}:</span> {selectedItem.result.wayLabelsText}
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
            {dict.cancel}
          </Button>
          <Button type="button" disabled={!selectedItem || parsing} onClick={handleImport}>
            {dict.import}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
