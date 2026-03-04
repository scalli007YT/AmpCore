"use client";

import { useProjectStore } from "@/lib/store";

export default function Page() {
  const { selectedProject } = useProjectStore();

  return (
    <h1 className="text-2xl font-semibold">
      {selectedProject
        ? `Project - ${selectedProject.name}`
        : "No Project Selected"}
    </h1>
  );
}
