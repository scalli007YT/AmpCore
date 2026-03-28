const path = require("path");

/**
 * Icon configuration for electron-builder and app windows.
 * Centralizes icon paths to avoid hardcoding .ico and .icns paths throughout the codebase.
 * 
 * Note: The main build configuration is defined in package.json's "build" field.
 * This file provides a centralized reference for icon paths and can be used for
 * programmatic access to icon paths in other parts of the application.
 */

const iconDir = path.join(__dirname, "..", "public");

const icons = {
  // Main icon (used for default platforms)
  main: path.join(iconDir, "logo"),

  // Platform-specific icons
  windows: path.join(iconDir, "logo.ico"),
  mac: path.join(iconDir, "logo.icns"),

  // App icon (no extension, electron picks the right one)
  appIcon: path.join(iconDir, "logo")
};

/**
 * Get the icon path based on the target platform.
 * @param {string} platform - 'win32', 'darwin', or 'linux'
 * @returns {string} Icon file path
 */
function getIconPath(platform) {
  switch (platform) {
    case "win32":
      return icons.windows;
    case "darwin":
      return icons.mac;
    default:
      return icons.main;
  }
}

module.exports = {
  icons,
  getIconPath
};
