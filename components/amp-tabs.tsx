"use client";

import { useState } from "react";
import { useAmpStore } from "@/stores/AmpStore";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  LayoutDashboardIcon,
  GridIcon,
  SlidersHorizontalIcon,
} from "lucide-react";

type AmpSection = "main" | "matrix" | "preferences";

interface AmpTabsProps {
  children?: React.ReactNode;
}

export function AmpTabs({ children }: AmpTabsProps) {
  const { amps, getDisplayName } = useAmpStore();
  const [selectedMac, setSelectedMac] = useState<string | null>(
    amps.length > 0 ? amps[0].mac : null,
  );
  const [activeSection, setActiveSection] = useState<AmpSection>("main");

  if (!amps || amps.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No amps assigned. Add amps to get started.
      </div>
    );
  }

  const selectedAmp = amps.find((a) => a.mac === selectedMac);

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
              <div className="flex items-center gap-2 mb-3">
                <div
                  className={`w-3 h-3 rounded-full ${
                    selectedAmp.reachable ? "bg-green-500" : "bg-red-500"
                  }`}
                />
                <h2 className="text-lg font-semibold">
                  {getDisplayName(selectedAmp)}
                </h2>
              </div>
              <dl className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                <div>
                  <dt className="font-semibold">MAC:</dt>
                  <dd className="font-mono">{selectedAmp.mac}</dd>
                </div>
                <div>
                  <dt className="font-semibold">Version:</dt>
                  <dd>{selectedAmp.version || "—"}</dd>
                </div>
                <div>
                  <dt className="font-semibold">ID:</dt>
                  <dd>{selectedAmp.id || "—"}</dd>
                </div>
                <div>
                  <dt className="font-semibold">Runtime:</dt>
                  <dd>
                    {selectedAmp.run_time !== undefined
                      ? `${Math.floor(selectedAmp.run_time / 60)}h ${
                          selectedAmp.run_time % 60
                        }min`
                      : "—"}
                  </dd>
                </div>
              </dl>
            </TabsContent>
          </Tabs>
        </div>
      )}
    </div>
  );
}
