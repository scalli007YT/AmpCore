import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";

/** Resolves the persistent storage directory.
 *  In the Electron production build, APP_USER_DATA is set by main.js to
 *  app.getPath("userData") — a writable OS-managed folder that survives updates.
 *  In dev (Next.js only), falls back to <cwd>/storage/projects. */
function getProjectsDir() {
  const base = process.env.APP_USER_DATA ?? process.cwd();
  return path.join(base, "storage", "projects");
}

interface Project {
  id: string;
  name: string;
  description: string;
  updatedAt: string;
  assigned_amps: Array<{
    id: string;
    mac: string;
  }>;
}

export async function GET() {
  try {
    const projectsDir = getProjectsDir();
    await fs.mkdir(projectsDir, { recursive: true });

    // Read all files in the projects directory
    const files = await fs.readdir(projectsDir);

    // Filter for JSON files and read them
    const projects: Project[] = [];
    for (const file of files) {
      if (file.endsWith(".json")) {
        const filePath = path.join(projectsDir, file);
        const content = await fs.readFile(filePath, "utf-8");
        const project = JSON.parse(content) as Project;
        projects.push(project);
      }
    }

    // Sort by updatedAt descending
    projects.sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );

    return NextResponse.json({
      success: true,
      projects,
    });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Failed to load projects",
      },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request) {
  try {
    const body = (await request.json()) as Project;

    if (!body.id) {
      return NextResponse.json(
        { success: false, error: "Project ID is required" },
        { status: 400 },
      );
    }

    const projectsDir = getProjectsDir();
    const filePath = path.join(projectsDir, `${body.id}.json`);

    // Update the updatedAt timestamp
    const updatedProject: Project = {
      ...body,
      updatedAt: new Date().toISOString(),
    };

    // Write the updated project to file
    await fs.writeFile(filePath, JSON.stringify(updatedProject, null, 2));

    return NextResponse.json({
      success: true,
      project: updatedProject,
    });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Failed to save project",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      name: string;
      description?: string;
    };

    if (!body.name?.trim()) {
      return NextResponse.json(
        { success: false, error: "Project name is required" },
        { status: 400 },
      );
    }

    const projectsDir = getProjectsDir();
    await fs.mkdir(projectsDir, { recursive: true });

    const id = uuidv4();
    const newProject: Project = {
      id,
      name: body.name.trim(),
      description: body.description?.trim() ?? "",
      updatedAt: new Date().toISOString(),
      assigned_amps: [],
    };

    const filePath = path.join(projectsDir, `${id}.json`);
    await fs.writeFile(filePath, JSON.stringify(newProject, null, 2));

    return NextResponse.json(
      { success: true, project: newProject },
      { status: 201 },
    );
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Failed to create project",
      },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { success: false, error: "Project ID is required" },
        { status: 400 },
      );
    }

    const projectsDir = getProjectsDir();
    const filePath = path.join(projectsDir, `${id}.json`);

    await fs.unlink(filePath);

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Failed to delete project",
      },
      { status: 500 },
    );
  }
}
