const { app, BrowserWindow, ipcMain, Tray, Menu, globalShortcut } = require('electron');
const path = require('path');
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');

// --- Configuration ---
const PORT = 3000; // REST API + WebSocket port
const USER_DATA_PATH = app.getPath('userData');
const CONFIG_DIR = path.join(USER_DATA_PATH, 'config');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

// Ensure directories exist
if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });

// Default Config
let appConfig = {
  vrmPath: 'model/Hana.vrm', // Default to bundled model
  alwaysOnTop: true,
  clickThrough: false, // Default to false to allow initial interaction
  scale: 1.0,
  position: { x: 0, y: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  idleIntensity: 1.0,
  windowBounds: { width: 400, height: 600, x: undefined, y: undefined }, // Default bounds
  showBorder: false,
  lookAtCursor: false, // Default off
  eyeTrackingSensitivity: 0.1,
  randomLookInterval: { min: 1.0, max: 4.0 },
  randomLookRadius: 5.0,
  subtitle: {
    fontSize: 24,
    color: '#ffffff',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    bottomOffset: 80,
    maxWidth: 80,
    padding: 20,
    borderRadius: 10,
    animate: true,
    typewriterDelay: 30
  }
};

// Load Config
if (fs.existsSync(CONFIG_FILE)) {
  try {
    const saved = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    appConfig = { 
        ...appConfig, 
        ...saved,
        subtitle: { ...appConfig.subtitle, ...(saved.subtitle || {}) }
    };
    if (!appConfig.windowBounds) appConfig.windowBounds = { width: 400, height: 600 };
  } catch (e) {
    console.error("Failed to load config", e);
  }
}

let saveTimeout = null;
function saveConfig() {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
      try {
          fs.writeFileSync(CONFIG_FILE, JSON.stringify(appConfig, null, 2));
      } catch (e) {
          console.error("Failed to save config", e);
      }
  }, 1000);
}

// --- Server & WebSocket ---
const serverApp = express();
serverApp.use(cors());
serverApp.use(bodyParser.json());
// Serve static assets if needed
serverApp.use(express.static(path.join(__dirname, '../public')));

const server = http.createServer(serverApp);
const wss = new WebSocket.Server({ server });

function broadcast(data) {
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(data));
        }
    });
}

wss.on('connection', (ws) => {
    ws.send(JSON.stringify({ type: 'config-update', payload: appConfig }));
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            if (data.type === 'update-config') {
                appConfig = { ...appConfig, ...data.payload };
                saveConfig();
                broadcast({ type: 'config-update', payload: appConfig });
                applyWindowSettings();
            } else if (data.type === 'debug-command') {
                // Relay debug commands to all clients (Renderer)
                broadcast(data);
            } else if (data.type === 'app-command' && data.command === 'quit') {
                app.quit();
            }
        } catch (e) { console.error(e); }
    });
});

serverApp.get('/api/config', (req, res) => res.json(appConfig));
serverApp.post('/api/config', (req, res) => {
    appConfig = { ...appConfig, ...req.body };
    saveConfig();
    broadcast({ type: 'config-update', payload: appConfig });
    applyWindowSettings();
    res.json(appConfig);
});

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

// --- Electron Window ---
let mainWindow;
let tray;

function createWindow() {
  const { width, height, x, y } = appConfig.windowBounds;
  
  mainWindow = new BrowserWindow({
    width: width || 400,
    height: height || 600,
    x, y,
    frame: false,
    transparent: true,
    hasShadow: false,
    resizable: true,
    alwaysOnTop: appConfig.alwaysOnTop,
    icon: path.join(__dirname, '../public/Hana.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false 
    }
  });

  const saveBounds = () => {
    if (mainWindow) {
      appConfig.windowBounds = mainWindow.getBounds();
      saveConfig();
    }
  };
  mainWindow.on('resized', saveBounds);
  mainWindow.on('moved', saveBounds);

  // Load Content
  if (process.env.NODE_ENV === 'development' || process.argv.includes('--dev')) {
      mainWindow.loadURL('http://localhost:5173'); 
  } else {
      // In production, assume build is in dist or handled otherwise
      // For now we setup as if dev-like structure or serve static file
      mainWindow.loadURL(`http://localhost:${PORT}/index.html`); // Use express static if built
  }
  
  mainWindow.setIgnoreMouseEvents(appConfig.clickThrough, { forward: true });

  mainWindow.on('closed', () => {
      mainWindow = null;
  });
}

function applyWindowSettings() {
  if (!mainWindow) return;
  mainWindow.setAlwaysOnTop(appConfig.alwaysOnTop, 'screen-saver');
  mainWindow.setIgnoreMouseEvents(appConfig.clickThrough, { forward: true });
}

let settingsWindow;
function createSettingsWindow() {
    if (settingsWindow) {
        settingsWindow.focus();
        return;
    }

    settingsWindow = new BrowserWindow({
        width: 800,
        height: 600,
        title: "Hana Controller",
        icon: path.join(__dirname, '../public/Hana.ico'),
        autoHideMenuBar: true,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true
        }
    });

    if (process.env.NODE_ENV === 'development' || process.argv.includes('--dev')) {
        settingsWindow.loadURL('http://localhost:3002');
    } else {
        // In prod, this would likely be a file path or served by express
        settingsWindow.loadURL(`http://localhost:${PORT}/controller/index.html`); 
    }

    settingsWindow.on('closed', () => {
        settingsWindow = null;
    });
}

app.whenReady().then(() => {
  createWindow();

  // Register F8 for Click-Through Toggle
  globalShortcut.register('F8', () => {
      appConfig.clickThrough = !appConfig.clickThrough;
      saveConfig();
      broadcast({ type: 'config-update', payload: { clickThrough: appConfig.clickThrough } });
      applyWindowSettings();
      console.log(`Click-through toggled to: ${appConfig.clickThrough}`);
  });
  
  // Tray
  const iconPath = path.join(__dirname, '../public/Hana.ico');
  
  if (fs.existsSync(iconPath)) {
      tray = new Tray(iconPath);
      const contextMenu = Menu.buildFromTemplate([
        { label: 'Open Settings', click: createSettingsWindow },
        { type: 'separator' },
        { label: 'Exit', click: () => app.quit() }
      ]);

      tray.setToolTip('Hana Companion');
      tray.setContextMenu(contextMenu);
  }

  app.on('will-quit', () => {
    globalShortcut.unregisterAll();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.on('set-ignore-mouse-events', (event, ignore, options) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) win.setIgnoreMouseEvents(ignore, options);
});

ipcMain.on('window-move', (event, { dx, dy }) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) {
        const [x, y] = win.getPosition();
        win.setPosition(x + dx, y + dy);
    }
});
