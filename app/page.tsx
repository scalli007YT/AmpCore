"use client";

import { useProjectStore } from "@/stores/ProjectStore";
import { AssignAmpsDialog } from "@/components/assign-amps-dialog";
import { AmpTabs } from "@/components/amp-tabs";

export default function Page() {
  const { selectedProject } = useProjectStore();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">
          {selectedProject
            ? `Project - ${selectedProject.name}`
            : "No Project Selected"}
        </h1>
        {selectedProject && <AssignAmpsDialog />}
      </div>

      {selectedProject && <AmpTabs />}
    </div>
  );
}
