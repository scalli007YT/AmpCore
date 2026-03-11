const { app, BrowserWindow } = require("electron");
const { fork } = require("child_process");
const path = require("path");
const http = require("http");

const PORT = 3000;
const isDev = !!process.env.ELECTRON_DEV;

let mainWindow;
let serverProcess;

// --- Server ---------------------------------------------------------------

/** Dev: poll until the external `next dev` process responds. */
function waitForDevServer() {
  return new Promise((resolve) => {
    const poll = () => {
      http
        .get(`http://localhost:${PORT}/`, (res) => {
          if (res.statusCode < 500) resolve();
          else setTimeout(poll, 300);
        })
        .on("error", () => setTimeout(poll, 300));
    };
    poll();
  });
}

/** Prod: fork server.js — Next.js boots in a child process (non-blocking). */
function startServer() {
  return new Promise((resolve, reject) => {
    serverProcess = fork(path.join(__dirname, "server.js"));

    serverProcess.on("message", (msg) => {
      if (msg.type === "ready") resolve();
      if (msg.type === "error") reject(new Error(msg.message));
    });

    serverProcess.on("exit", (code) => {
      if (code && code !== 0) reject(new Error(`Server exited (${code})`));
    });

    serverProcess.send({
      type: "start",
      appRoot: path.join(__dirname, ".."),
      port: PORT,
      userData: app.getPath("userData"),
    });
  });
}

// --- Window ---------------------------------------------------------------

function createWindow() {
  const { COLORS } = require('../lib/colors.js');
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    backgroundColor: COLORS.WINDOW_BG,
    show: true,
    title: "CVR AMP Controller",
    autoHideMenuBar: true,
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  });

  mainWindow.loadFile(path.join(__dirname, "splash.html"), {
    query: {
      bg: COLORS.SPLASH_BG,
      text: COLORS.SPLASH_TEXT,
      border: COLORS.SPLASH_BORDER,
      borderTop: COLORS.SPLASH_BORDER_TOP,
    },
  });
}

// --- Lifecycle ------------------------------------------------------------

app.whenReady().then(() => {
  const serverReady = isDev ? waitForDevServer() : startServer();

  createWindow();

  serverReady.then(async () => {
    const url = isDev
      ? `http://localhost:${PORT}`
      : `http://127.0.0.1:${PORT}`;

    if (!mainWindow || mainWindow.isDestroyed()) return;

    try {
      // Ask splash page to fade out before navigation.
      const fadeMs = await mainWindow.webContents.executeJavaScript(
        "window.startFadeOut ? window.startFadeOut() : 0",
      );
      setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.loadURL(url);
      }, Number(fadeMs) || 0);
    } catch {
      // If JS execution fails, fall back to immediate navigation.
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.loadURL(url);
    }
  });
});

app.on("window-all-closed", () => {
  if (serverProcess) serverProcess.kill();
  app.quit();
});