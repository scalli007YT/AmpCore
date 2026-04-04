"use client";

import { useEffect } from "react";
import { AssignAmpsDialog } from "@/components/dialogs/assign-amps-dialog";
import { AssignDemoAmpsDialog } from "@/components/dialogs/assign-demo-amps-dialog";
import { AmpRackSidebar } from "@/components/monitor/amp-rack-sidebar";
import { NoProjectCard } from "@/components/monitor/no-project-card";
import { useProjectStore } from "@/stores/ProjectStore";
import { useTabStore } from "@/stores/TabStore";
import type { Dictionary } from "@/lib/i18n/dictionaries";

interface HealthPageProps {
  dictionary: Dictionary["monitor"];
}

export function HealthPage({ dictionary }: HealthPageProps) {
  const { selectedProject } = useProjectStore();
  const setCurrentView = useTabStore((state) => state.setCurrentView);

  useEffect(() => {
    setCurrentView("health");
  }, [setCurrentView]);

  return (
    <div className="flex min-h-0 flex-1 flex-col space-y-4">
      {selectedProject && (
        <section className="rounded-lg border border-border/50 bg-card/30 px-4 py-3 sm:px-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h1 className="text-xl font-semibold sm:text-2xl">{selectedProject.name}</h1>

            <div className="flex flex-wrap items-center gap-2">
              {selectedProject.projectMode === "demo" ? <AssignDemoAmpsDialog /> : <AssignAmpsDialog />}
            </div>
          </div>
        </section>
      )}

      <div className="flex min-h-0 flex-1">
        {!selectedProject ? (
          <NoProjectCard />
        ) : (
          <div className="grid min-h-0 w-full flex-1 gap-3 xl:grid-cols-[220px_minmax(0,1fr)]">
            <AmpRackSidebar dictionary={dictionary} />

            <section className="flex min-h-0 items-center justify-center rounded-lg border border-dashed border-border/50 bg-card/10 p-8">
              <p className="text-sm text-muted-foreground">Health content coming soon.</p>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
