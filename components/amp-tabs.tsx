"use client";

import { useState, useEffect } from "react";
import { useAmpStore } from "@/stores/AmpStore";
import { useAmpPresets } from "@/hooks/useAmpPresets";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  LayoutDashboardIcon,
  GridIcon,
  SlidersHorizontalIcon,
} from "lucide-react";

type AmpSection = "main" | "matrix" | "preferences";

export function AmpTabs() {
  const { amps, getDisplayName } = useAmpStore();
  const { fetchPresets, fetching, error: presetsError } = useAmpPresets();
  const [selectedMac, setSelectedMac] = useState<string | null>(
    amps.length > 0 ? amps[0].mac : null,
  );
  const [activeSection, setActiveSection] = useState<AmpSection>("main");

  const selectedAmp = amps.find((a) => a.mac === selectedMac);

  // Auto-fetch presets when the preferences tab is opened for a reachable amp
  // that doesn't have presets loaded yet.
  useEffect(() => {
    if (
      activeSection === "preferences" &&
      selectedAmp?.reachable &&
      selectedAmp.presets === undefined &&
      !fetching
    ) {
      void fetchPresets(selectedAmp.mac);
    }
    // fetchPresets identity is stable (useCallback); fetching guards against double-fire
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSection, selectedMac]);

  if (!amps || amps.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No amps assigned. Add amps to get started.
      </div>
    );
  }

  return (
    <div className="flex gap-4 w-full">
      {/* Vertical amp selector */}
      <div className="flex flex-col gap-1">
        {amps.map((amp) => (
          <button
            key={amp.mac}
            onClick={() => setSelectedMac(amp.mac)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors text-left whitespace-nowrap
              ${
                selectedMac === amp.mac
                  ? "bg-background text-foreground shadow-sm border border-border"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
          >
            <div
              className={`flex-shrink-0 w-2 h-2 rounded-full ${
                amp.reachable ? "bg-green-500" : "bg-red-500"
              }`}
            />
            <span className="truncate">{getDisplayName(amp)}</span>
          </button>
        ))}
      </div>

      {/* Selected amp panel with horizontal section tabs */}
      {selectedAmp && (
        <div className="flex-1 border rounded-lg overflow-hidden">
          <Tabs
            value={activeSection}
            onValueChange={(v) => setActiveSection(v as AmpSection)}
            orientation="horizontal"
            className="flex flex-col"
          >
            <TabsList className="w-full justify-start rounded-none rounded-t-lg border-b h-10 px-2">
              <TabsTrigger value="main">
                <LayoutDashboardIcon />
                Main
              </TabsTrigger>
              <TabsTrigger value="matrix">
                <GridIcon />
                Matrix
              </TabsTrigger>
              <TabsTrigger value="preferences">
                <SlidersHorizontalIcon />
                Preferences
              </TabsTrigger>
            </TabsList>

            <TabsContent value="main" className="p-4 mt-0">
              <p className="text-sm text-muted-foreground">
                Main controls coming soon.
              </p>
            </TabsContent>

            <TabsContent value="matrix" className="p-4 mt-0">
              <p className="text-sm text-muted-foreground">
                Matrix routing coming soon.
              </p>
            </TabsContent>

            <TabsContent value="preferences" className="p-4 mt-0">
              {/* Device identity */}
              <div className="flex items-center gap-2 mb-4">
                <div
                  className={`w-3 h-3 rounded-full ${
                    selectedAmp.reachable ? "bg-green-500" : "bg-red-500"
                  }`}
                />
                <h2 className="text-lg font-semibold">
                  {getDisplayName(selectedAmp)}
                </h2>
              </div>
              <dl className="grid grid-cols-2 gap-2 text-xs text-muted-foreground mb-6">
                <div>
                  <dt className="font-semibold">MAC:</dt>
                  <dd className="font-mono">{selectedAmp.mac}</dd>
                </div>
                <div>
                  <dt className="font-semibold">Version:</dt>
                  <dd>{selectedAmp.version || "---"}</dd>
                </div>
                <div>
                  <dt className="font-semibold">ID:</dt>
                  <dd>{selectedAmp.id || "---"}</dd>
                </div>
                <div>
                  <dt className="font-semibold">Runtime:</dt>
                  <dd>
                    {selectedAmp.run_time !== undefined
                      ? `${Math.floor(selectedAmp.run_time / 60)}h ${selectedAmp.run_time % 60}min`
                      : "---"}
                  </dd>
                </div>
              </dl>

              {/* Presets section */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <h3 className="text-sm font-semibold">Presets</h3>
                  {fetching && (
                    <span className="text-xs text-muted-foreground animate-pulse">
                      Loading...
                    </span>
                  )}
                  {!fetching && selectedAmp.presets !== undefined && (
                    <span className="text-xs text-muted-foreground">
                      {selectedAmp.presets.length} used
                    </span>
                  )}
                </div>

                {presetsError && (
                  <p className="text-xs text-destructive mb-2">
                    {presetsError}
                  </p>
                )}

                {!fetching && !selectedAmp.presets && !presetsError && (
                  <p className="text-xs text-muted-foreground">
                    {selectedAmp.reachable
                      ? "Loading presets..."
                      : "Amp is unreachable — presets unavailable."}
                  </p>
                )}

                {selectedAmp.presets?.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    No presets saved on this device.
                  </p>
                )}

                {selectedAmp.presets && selectedAmp.presets.length > 0 && (
                  <ul className="space-y-1">
                    {selectedAmp.presets.map((preset) => (
                      <li
                        key={preset.slot}
                        className="flex items-center gap-3 rounded-md border px-3 py-1.5 text-sm"
                      >
                        <span className="w-6 text-center text-xs font-mono text-muted-foreground">
                          {preset.slot}
                        </span>
                        <span className="font-medium">{preset.name}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </div>
      )}
    </div>
  );
}
