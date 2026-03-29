const path = require("path");
const { FusesPlugin } = require("@electron-forge/plugin-fuses");
const { FuseV1Options, FuseVersion } = require("@electron/fuses");

const packagerConfig = {
  name: "AmpCore",
  executableName: "AmpCore",
  appBundleId: "com.ampcore.app",
  appCategoryType: "public.app-category.music",
  icon: path.join(__dirname, "public", "logo"),
  asar: {
    unpack: "**/*.node"
  },
  ignore: [
    // Exclude everything except what we explicitly need
    /^\/node_modules$/,
    /^\/app\//,
    /^\/components\//,
    /^\/hooks\//,
    /^\/lib\//,
    /^\/stores\//,
    /^\/storage\//,
    /^\/Releases\//,
    /^\/\.next\/cache/,
    /^\/\.next\/dev/,
    /^\/\.next\/server/,
    /^\/\.next\/types/,
    /^\/\.next\/app-build-manifest\.json$/,
    /^\/\.next\/build-manifest\.json$/,
    /^\/\.next\/package\.json$/,
    /^\/\.next\/react-loadable-manifest\.json$/,
    /^\/\.next\/trace$/,
    /^\/src\//,
    /^\/\.git/,
    /^\/\.github/,
    /^\/\.vscode/,
    /^\/dist/,
    /^\/out/,
    /\.ts$/,
    /tsconfig\.json$/,
    /eslint\.config/,
    /postcss\.config/,
    /tailwind\.config/,
    /prettier/,
    /^\/BUILD\.md$/,
    /^\/README\.md$/,
    /^\/pnpm-workspace\.yaml$/,
    /^\/pnpm-lock\.yaml$/,
    /^\/\.npmrc$/,
    /^\/components\.json$/
  ]
};

module.exports = {
  packagerConfig,

  rebuildConfig: {},

  makers: [
    {
      name: "@electron-forge/maker-squirrel",
      config: {
        name: "AmpCore",
        setupIcon: path.join(__dirname, "public", "logo.ico")
      }
    },
    {
      name: "@electron-forge/maker-zip",
      platforms: ["darwin"]
    },
    {
      name: "@electron-forge/maker-dmg",
      config: {
        name: "AmpCore",
        icon: path.join(__dirname, "public", "logo.icns"),
        format: "ULFO"
      }
    },
    {
      name: "@electron-forge/maker-deb",
      config: {
        options: {
          name: "ampcore",
          productName: "AmpCore",
          icon: path.join(__dirname, "public", "logo.png"),
          categories: ["Audio", "Utility"],
          maintainer: "scalli007"
        }
      }
    }
  ],

  plugins: [
    {
      name: "@electron-forge/plugin-auto-unpack-natives",
      config: {}
    },
    {
      name: "@electron-forge/plugin-fuses",
      config: {
        version: FuseVersion.V1,
        [FuseV1Options.RunAsNode]: false,
        [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
        [FuseV1Options.EnableNodeCliInspectArguments]: false
      }
    }
  ],

  hooks: {
    generateAssets: async () => {
      const { execSync } = require("child_process");
      const fs = require("fs");

      const nextDir = path.join(__dirname, ".next");
      if (fs.existsSync(nextDir)) {
        fs.rmSync(nextDir, { recursive: true, force: true });
        console.log("✓ Cleaned .next directory");
      }

      console.log("Building Next.js application...");
      execSync("pnpm run build", { stdio: "inherit", cwd: __dirname });
      console.log("✓ Next.js build complete");

      // Copy public/ and .next/static/ into standalone dir for Next.js standalone mode.
      const standaloneDir = path.join(__dirname, ".next", "standalone");
      const publicSrc = path.join(__dirname, "public");
      const publicDest = path.join(standaloneDir, "public");
      const staticSrc = path.join(__dirname, ".next", "static");
      const staticDest = path.join(standaloneDir, ".next", "static");

      if (fs.existsSync(publicSrc)) {
        fs.cpSync(publicSrc, publicDest, { recursive: true });
        console.log("✓ Copied public/ into standalone");
      }
      if (fs.existsSync(staticSrc)) {
        fs.cpSync(staticSrc, staticDest, { recursive: true });
        console.log("✓ Copied .next/static/ into standalone");
      }
    }
  }
};
