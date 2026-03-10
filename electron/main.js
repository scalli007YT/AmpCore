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
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    backgroundColor: "#09090b",
    show: true,
    title: "CVR AMP Controller",
    autoHideMenuBar: true,
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  });

  mainWindow.loadFile(path.join(__dirname, "splash.html"));
}

// --- Lifecycle ------------------------------------------------------------

app.whenReady().then(() => {
  const serverReady = isDev ? waitForDevServer() : startServer();

  createWindow();

  serverReady.then(() => {
    const url = isDev
      ? `http://localhost:${PORT}`
      : `http://127.0.0.1:${PORT}`;

    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.loadURL(url);
  });
});

app.on("window-all-closed", () => {
  if (serverProcess) serverProcess.kill();
  app.quit();
});