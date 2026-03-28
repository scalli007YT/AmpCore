#!/usr/bin/env node

/**
 * Build Helper Script
 * Consolidates common build logic to reduce duplication in pnpm scripts.
 * Handles:
 * - Cleaning .next directory
 * - Building Next.js
 * - Running electron-builder with platform-specific options
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const PROJECT_ROOT = path.join(__dirname, "..");
const NEXT_BUILD_DIR = path.join(PROJECT_ROOT, ".next");

/**
 * Remove the .next build directory
 */
function cleanNextBuild() {
  try {
    if (fs.existsSync(NEXT_BUILD_DIR)) {
      fs.rmSync(NEXT_BUILD_DIR, { recursive: true, force: true });
      console.log("✓ Cleaned .next directory");
    }
  } catch (err) {
    console.error("Failed to clean .next directory:", err);
    process.exit(1);
  }
}

/**
 * Build the Next.js application
 */
function buildNext() {
  try {
    console.log("Building Next.js application...");
    execSync("pnpm run build", { stdio: "inherit", cwd: PROJECT_ROOT });
    console.log("✓ Next.js build complete");
  } catch (err) {
    console.error("Next.js build failed:", err.message);
    process.exit(1);
  }
}

/**
 * Build with electron-builder
 * @param {Array<string>} args - Additional arguments to pass to electron-builder
 */
function buildElectron(args = []) {
  try {
    console.log("Building Electron application...");
    const command = ["electron-builder", ...args];
    execSync(command.join(" "), { stdio: "inherit", cwd: PROJECT_ROOT });
    console.log("✓ Electron build complete");
  } catch (err) {
    console.error("Electron build failed:", err.message);
    process.exit(1);
  }
}

/**
 * Main entry point
 */
function main() {
  const platform = process.argv[2];

  console.log(`Starting Electron build for platform: ${platform || "all"}\n`);

  // Clean and build Next.js
  cleanNextBuild();
  buildNext();

  // Build Electron with platform-specific args
  const builderArgs = [];
  if (platform === "win" || platform === "windows") {
    builderArgs.push("--win");
  } else if (platform === "mac" || platform === "darwin") {
    builderArgs.push("--mac");
  } else if (platform === "linux") {
    builderArgs.push("--linux");
  }

  buildElectron(builderArgs);

  console.log("\n✅ Build complete!");
}

main();
