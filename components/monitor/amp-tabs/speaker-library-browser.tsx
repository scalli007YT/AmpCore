"use client";

import { useEffect, useMemo, useState } from "react";
import { Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useLibraryStore } from "@/stores/LibraryStore";

interface SpeakerLibraryBrowserProps {
  isActive: boolean;
}

export function SpeakerLibraryBrowser({ isActive }: SpeakerLibraryBrowserProps) {
  const files = useLibraryStore((state) => state.files);
  const loading = useLibraryStore((state) => state.loading);
  const error = useLibraryStore((state) => state.error);
  const hasLoaded = useLibraryStore((state) => state.hasLoaded);
  const loadLibrary = useLibraryStore((state) => state.loadLibrary);

  const [brandFilter, setBrandFilter] = useState("");
  const [familyFilter, setFamilyFilter] = useState("");
  const [modelFilter, setModelFilter] = useState("");
  const [waysNoFilter, setWaysNoFilter] = useState("all");

  useEffect(() => {
    if (!isActive || hasLoaded || loading) return;
    void loadLibrary();
  }, [isActive, hasLoaded, loading, loadLibrary]);

  const waysNoOptions = useMemo(() => {
    const unique = new Set<number>();
    files.forEach((file) => unique.add(file.tdNum || 0));
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
      if (waysNoFilter !== "all" && String(file.tdNum || 0) !== waysNoFilter) return false;
      return true;
    });
  }, [files, brandFilter, familyFilter, modelFilter, waysNoFilter]);

  const clearFilters = () => {
    setBrandFilter("");
    setFamilyFilter("");
    setModelFilter("");
    setWaysNoFilter("all");
  };

  return (
    <section className="h-full rounded-md border border-border/50 bg-background/30 p-3">
      <div className="mb-2.5 flex items-center justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <h3 className="text-sm font-semibold">Library</h3>
          {!loading && !error && <span className="text-xs text-muted-foreground">{filteredFiles.length}</span>}
        </div>
        <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => void loadLibrary()}>
          Refresh
        </Button>
      </div>

      <div className="mb-2.5 rounded-md border border-border/50 bg-muted/10 p-3">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="speaker-filter-brand" className="text-xs text-muted-foreground">
              Brand
            </Label>
            <Input
              id="speaker-filter-brand"
              value={brandFilter}
              onChange={(e) => setBrandFilter(e.target.value)}
              placeholder="Filter brand"
              className="h-8"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="speaker-filter-family" className="text-xs text-muted-foreground">
              Family
            </Label>
            <Input
              id="speaker-filter-family"
              value={familyFilter}
              onChange={(e) => setFamilyFilter(e.target.value)}
              placeholder="Filter family"
              className="h-8"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="speaker-filter-model" className="text-xs text-muted-foreground">
              Model
            </Label>
            <Input
              id="speaker-filter-model"
              value={modelFilter}
              onChange={(e) => setModelFilter(e.target.value)}
              placeholder="Filter model"
              className="h-8"
            />
          </div>
        </div>

        <div className="mt-3 flex items-end gap-3">
          <div className="w-40 shrink-0 space-y-1.5">
            <Label className="text-xs text-muted-foreground">Ways N°</Label>
            <Select value={waysNoFilter} onValueChange={setWaysNoFilter}>
              <SelectTrigger className="h-8 w-full">
                <SelectValue placeholder="Any" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any</SelectItem>
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
              Clear filters
            </Button>
          </div>
        </div>
      </div>

      {loading && <p className="text-sm text-muted-foreground">Loading library...</p>}
      {!loading && error && <p className="text-sm text-destructive">{error}</p>}
      {!loading && !error && filteredFiles.length === 0 && (
        <p className="text-sm text-muted-foreground">No library files match the current filters.</p>
      )}

      {!loading && !error && filteredFiles.length > 0 && (
        <div className="overflow-hidden rounded-md border border-border/50">
          <div className="grid grid-cols-[56px_minmax(0,1.3fr)_minmax(0,1.1fr)_minmax(0,1.2fr)_64px_96px] gap-2 border-b border-border/50 bg-muted/20 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            <span className="text-center">Note</span>
            <span>Brand</span>
            <span>Family</span>
            <span>Model</span>
            <span className="text-center">Ways</span>
            <span>Out Type</span>
          </div>
          <TooltipProvider>
            <div className="max-h-[28rem] overflow-y-auto">
              {filteredFiles.map((file) => {
                const note = file.notes?.trim() ?? "";
                const hasNote = note.length > 0 && note.toLowerCase() !== "notes";

                return (
                  <div
                    key={file.name}
                    className="border-b border-border/40 px-3 py-2 text-sm transition-colors hover:bg-muted/20 last:border-b-0"
                  >
                    <div className="grid grid-cols-[56px_minmax(0,1.3fr)_minmax(0,1.1fr)_minmax(0,1.2fr)_64px_96px] gap-2">
                      <div className="flex items-center justify-center">
                        {hasNote ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                className="inline-flex h-6 w-6 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                                aria-label="Show note"
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
                      <span className="text-center font-mono">{file.tdNum || 0}</span>
                      <span className="truncate">{file.ways || "-"}</span>
                    </div>
                    {file.parseError && <div className="mt-1 text-[11px] text-destructive">{file.parseError}</div>}
                  </div>
                );
              })}
            </div>
          </TooltipProvider>
        </div>
      )}
    </section>
  );
}
