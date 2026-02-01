const { app, BrowserWindow, ipcMain, Tray, Menu, globalShortcut, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const bodyParser = require('body-parser');
const os = require('os');
const { uIOhook, UiohookKey } = require('uiohook-napi');
const pythonManager = require('./ai/pythonManager');
const TTSHandler = require('./tts/ttsHandler');

// --- Configuration ---
const PORT = 3000; // REST API + WebSocket port
const USER_DATA_PATH = app.getPath('userData');
const CONFIG_DIR = path.join(USER_DATA_PATH, 'config');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');
const ttsManager = new TTSHandler(CONFIG_DIR);

// Ensure directories exist
if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });

// Efficient deep merge for config updates (avoids spread operator overhead)
function deepMerge(target, source) {
    if (!source) return target;
    const result = { ...target };
    for (const key of Object.keys(source)) {
        if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
            result[key] = deepMerge(target[key] || {}, source[key]);
        } else {
            result[key] = source[key];
        }
    }
    return result;
}

// Default Config
// I picked these values by rolling a d20. Deal with it.
// If you break this, you buy me a coffee.
let appConfig = {
  vrmPath: 'model/Hana.vrm', // Default to bundled model
  alwaysOnTop: true, // She demands to be the center of attention
  clickThrough: false, // Default to false to allow initial interaction
  scale: 1.0,
  position: { x: 0, y: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  idleIntensity: 1.0,
  windowBounds: { width: 400, height: 600, x: undefined, y: undefined }, // Default bounds
  showBorder: false, // No borders, we are boundless
  lookAtCursor: false, // Default off
  eyeTrackingSensitivity: 0.1,
  randomLookInterval: { min: 1.0, max: 4.0 },
  randomLookRadius: 5.0,
  lipSyncSensitivity: 3.0, // Mouth movement sensitivity (1-5)
  // Shading configuration
  shading: {
    mode: 'default',        // 'default' or 'toon'
    lightIntensity: 1.0,    // Main directional light
    ambientIntensity: 0.4,  // Ambient light fill
    shadowDarkness: 120,    // 0-255, lower = darker toon shadows
    saturationBoost: 1.0,   // Color saturation multiplier
    lightX: 1.0,            // Light direction X
    lightY: 1.0,            // Light direction Y
    lightZ: 1.0,            // Light direction Z
  },
  voiceEnabled: true,
  pushToTalk: false, // Default off
  pushToTalkKey: 'v', // Default key, V for Voice (Original, I know)
  aiEnabled: true,
  expressiveAnimation: false, // New Advanced Feature
  ollamaModel: "llama3",
  audioDeviceIndex: null, // Default to system default
  systemPrompt: "You are Hana, a helpful and cute desktop companion.",
  dialogueSpeed: 50,
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
  },
  // TTS Settings
  tts: {
    enabled: false,
    autoLaunch: false,
    baseUrl: "http://localhost:9872/",
    installPath: "",
    deviceMode: "auto",
    
    selectedSovitsPath: "",
    selectedGptPath: "",
    selectedT2sPath: "", // V2
    
    refAudioPath: path.join(__dirname, '../public/voice/HanaVoice.wav'),
    auxRefAudioPaths: [],
    promptText: "Wow, this would be the perfect location for shooting a film.",
    promptLang: "English",
    textLang: "English",
    
    howToCut: "cut5",
    topK: 5,
    topP: 1,
    temperature: 1,
    speed: 1.0,
    fragmentInterval: 0.3,
    
    v2BatchSize: 1,
    v2ParallelInfer: true,
    v2SplitBucket: true,
    v2RepetitionPenalty: 1.35,
    v2Seed: -1,
    v2KeepRandom: true,
    
    // Performance Toggles
    streaming_mode: true, // Explicitly enable
    media_type: "ogg", // Ogg is strictly smaller/faster for streaming usually
    
    volume: 1.0,
    queueInsteadOfInterrupt: false
  }
};

// Load Config
if (fs.existsSync(CONFIG_FILE)) {
  try {
    const saved = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    // Merge carefully, like mixing potions in a cauldron
    appConfig = { 
        ...appConfig, 
        ...saved,
        // Ensure nested configs are merged properly
        tts: { ...appConfig.tts, ...(saved.tts || {}) },
        subtitle: { ...appConfig.subtitle, ...(saved.subtitle || {}) },
        shading: { ...appConfig.shading, ...(saved.shading || {}) }
    };
    if (!appConfig.windowBounds) appConfig.windowBounds = { width: 400, height: 600 };
    // Set proper defaults if missing
    if (!appConfig.voice) appConfig.voice = {};
    appConfig.voice.enabled = appConfig.voiceEnabled !== undefined ? appConfig.voiceEnabled : true;
    appConfig.voice.pttKey = appConfig.pushToTalkKey || 'v';
    appConfig.voice.mode = appConfig.pushToTalk ? 'ptt' : 'vad'; // Map old check to new structure logic
  } catch (e) {
    console.error("Failed to load config, using defaults because I'm clumsy", e);
  }
}

let saveTimeout = null;
let lastSaveHash = null;  // Track config changes to avoid redundant saves
let saveScheduled = false;

function saveConfig() {
  if (saveScheduled) return;
  saveScheduled = true;
  if (saveTimeout) clearTimeout(saveTimeout);
  // Debounce save with longer delay for better batching
  saveTimeout = setTimeout(() => {
      saveScheduled = false;
      try {
          // Fast hash using config structure keys + critical values
          const hash = `${appConfig.scale}-${appConfig.alwaysOnTop}-${appConfig.tts?.enabled}-${appConfig.shading?.mode}`;
          if (hash === lastSaveHash) return;  // Skip if unchanged
          
          lastSaveHash = hash;
          
          // Normalize legacy keys
          appConfig.pushToTalkKey = appConfig.voice.pttKey;
          appConfig.pushToTalk = appConfig.voice.mode === 'ptt';
          appConfig.voiceEnabled = appConfig.voice.enabled;

          fs.writeFileSync(CONFIG_FILE, JSON.stringify(appConfig, null, 2));
      } catch (e) {
          console.error("Failed to save config", e);
      }
  }, 2000);  // Increased to 2s for better batching
}

// Throttled broadcast to reduce WebSocket spam
let broadcastQueue = new Map();
let broadcastTimeout = null;

// Critical message types that should be sent immediately without throttling
const IMMEDIATE_BROADCAST_TYPES = new Set([
    'tts:audio',
    'ai-event', 
    'ptt-status',
    'voice:devices',
    'transcription',
    'error'
]);

function broadcast(data) {
    // Send critical messages immediately
    if (IMMEDIATE_BROADCAST_TYPES.has(data.type)) {
        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify(data));
            }
        });
        return;
    }
    
    // Merge same-type messages, keeping latest (for config updates, etc.)
    broadcastQueue.set(data.type, data);
    
    if (!broadcastTimeout) {
        broadcastTimeout = setTimeout(() => {
            broadcastQueue.forEach((msg) => {
                wss.clients.forEach(client => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify(msg));
                    }
                });
            });
            broadcastQueue.clear();
            broadcastTimeout = null;
        }, 16);  // ~60fps max broadcast rate
    }
}

// --- PTT Logic (Akari Port) ---
function registerPTT() {
    globalShortcut.unregisterAll();
    
    // Always register F8 for Click-Through via Electron (simpler for toggle keys)
    globalShortcut.register('F8', () => {
        appConfig.clickThrough = !appConfig.clickThrough;
        saveConfig();
        broadcast({ type: 'config-update', payload: { clickThrough: appConfig.clickThrough } });
        applyWindowSettings();
        console.log(`Click-through toggled to: ${appConfig.clickThrough}`);
    });

    uIOhook.stop();
    uIOhook.removeAllListeners('mousedown');
    uIOhook.removeAllListeners('mouseup');
    uIOhook.removeAllListeners('keydown');
    uIOhook.removeAllListeners('keyup');

    if (appConfig.voice.enabled && appConfig.pushToTalk && appConfig.voice.pttKey) {
        try {
            let isRecording = false;
            const key = appConfig.voice.pttKey; // e.g., "V", "Mouse4", "Space"
            console.log(`[PTT] Registering hook for: ${key}`);

            // Map Key Names to uIOhook codes
            // Because uIOhook returns raw scancodes/keycodes, we need to match them.
            // This is a minimal map.
            const targetKeyCode = (() => {
                // If it's a mouse key, we handle it separately below.
                if (key.startsWith('Mouse')) return null;

                // Simple Char Mapping
                if (key.length === 1) {
                     const char = key.toUpperCase();
                     if (UiohookKey[char]) return UiohookKey[char];
                     // Fallback for numbers
                     if (!isNaN(parseInt(char))) return UiohookKey[`N${char}`] || UiohookKey[char];
                }
                
                // Specific Keys
                const map = {
                    'Space': UiohookKey.Space,
                    'Enter': UiohookKey.Enter,
                    'Tab': UiohookKey.Tab,
                    'Escape': UiohookKey.Escape,
                    'Backspace': UiohookKey.Backspace,
                    'CapsLock': UiohookKey.CapsLock,
                    'F1': UiohookKey.F1, 'F2': UiohookKey.F2, 'F3': UiohookKey.F3,
                    'F4': UiohookKey.F4, 'F5': UiohookKey.F5, 'F6': UiohookKey.F6,
                    'F7': UiohookKey.F7, 'F8': UiohookKey.F8, 'F9': UiohookKey.F9,
                    'F10': UiohookKey.F10, 'F11': UiohookKey.F11, 'F12': UiohookKey.F12,
                    'ControlLeft': UiohookKey.Ctrl, 'ControlRight': UiohookKey.Ctrl, // Approx
                    'ShiftLeft': UiohookKey.Shift, 'ShiftRight': UiohookKey.Shift,
                    'AltLeft': UiohookKey.Alt, 'AltRight': UiohookKey.Alt,
                };
                
                // Try "KeyV" format
                if (key.startsWith('Key')) {
                    const char = key.replace('Key', '').toUpperCase();
                    if (UiohookKey[char]) return UiohookKey[char];
                }

                return map[key] || map[key.replace('Key', '')];
            })();

            const targetMouseBtn = (() => {
                 if (!key.startsWith('Mouse')) return null;
                 const mouseMap = {
                    'MouseLeft': 1, 'MouseRight': 2, 'MouseMiddle': 3,
                    // Swap 4/5 because uIOhook often sees Back as 5
                    'Mouse4': 5, 'Mouse5': 4
                 };
                 // Allow fallback to raw number if user put "Mouse6" etc
                 if (mouseMap[key]) return mouseMap[key];
                 const bareNum = parseInt(key.replace('Mouse', ''));
                 return isNaN(bareNum) ? null : bareNum; 
            })();

            // Common Start/Stop Handlers
            const startPTT = (source) => {
                if (!isRecording) {
                    // console.log(`[PTT] Started (${source})`);
                    isRecording = true;
                    broadcast({ type: 'ptt-status', payload: { active: true } });
                    pythonManager.send('voice:start');
                }
            };

            const stopPTT = (source) => {
                if (isRecording) {
                    // console.log(`[PTT] Stopped (${source})`);
                    isRecording = false;
                    broadcast({ type: 'ptt-status', payload: { active: false } });
                    pythonManager.send('voice:stop');
                }
            };
            
            // Register Mouse
            if (targetMouseBtn) {
                 uIOhook.on('mousedown', (e) => {
                     // Log button for debugging
                     if (e.button === targetMouseBtn) startPTT('Mouse');
                 });
                 uIOhook.on('mouseup', (e) => {
                     if (e.button === targetMouseBtn) stopPTT('Mouse');
                 });
            }

            // Register Keyboard
            if (targetKeyCode) {
                 uIOhook.on('keydown', (e) => {
                     // console.log(`[uIOhook] Debug: Key ${e.keycode} Pressed`);
                     if (e.keycode === targetKeyCode) startPTT('Key');
                 });
                 uIOhook.on('keyup', (e) => {
                     if (e.keycode === targetKeyCode) stopPTT('Key');
                 });
            } else if (!targetMouseBtn) {
                console.warn(`[PTT] Could not map key: ${key}. Using uIOhook fallback logging.`);
                // Fallback: Log everything to help user find the code
                uIOhook.on('keydown', (e) => console.log(`[PTT Debug] KeyDown Code: ${e.keycode} (Target invalid)`));
                uIOhook.on('mousedown', (e) => console.log(`[PTT Debug] MouseDown Button: ${e.button}`));
            }

            uIOhook.start();

        } catch (e) {
            console.error("Failed to register PTT hooks", e);
        }
    }
}

// --- Server & WebSocket ---
const serverApp = express();
serverApp.use(cors());
serverApp.use(bodyParser.json());
// Serve static assets if needed
serverApp.use(express.static(path.join(__dirname, '../public')));

// Store pending TTS requests like squirrel caching nuts
// Key: uuid, Value: TTS Params
const ttsQueue = new Map();

serverApp.get('/tts-stream/:id', async (req, res) => {
    const id = req.params.id;
    const params = ttsQueue.get(id);

    if (!params) {
        return res.status(404).send("TTS Job not found. Maybe it ran away?");
    }
    
    // Clean up cache because we are efficient
    ttsQueue.delete(id);

    try {
        // Build API URL
        const apiUrl = appConfig.tts.baseUrl || "http://127.0.0.1:9880";

        // Set proper headers
        res.setHeader('Content-Type', 'audio/wav'); 
        
        // Use the new Manager
        await ttsManager.generateAudio(apiUrl, {
            ...params,
            streamCallback: (chunk) => {
                res.write(chunk);
            }
        });
        
        res.end();
        
    } catch (e) {
        console.error("Stream Proxy Failed:", e);
        if(!res.headersSent) res.status(500).send("Stream Failed");
        else res.end();
    }
});

const server = http.createServer(serverApp);
const wss = new WebSocket.Server({ server });

// broadcast function moved above for throttling

wss.on('connection', (ws) => {
    ws.send(JSON.stringify({ type: 'config-update', payload: appConfig }));
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            if (data.type === 'update-config') {
                // Deep merge nested objects to preserve existing properties
                const payload = data.payload;
                if (payload.shading) {
                    payload.shading = { ...appConfig.shading, ...payload.shading };
                }
                if (payload.tts) {
                    payload.tts = { ...appConfig.tts, ...payload.tts };
                }
                if (payload.subtitle) {
                    payload.subtitle = { ...appConfig.subtitle, ...payload.subtitle };
                }
                if (payload.position) {
                    payload.position = { ...appConfig.position, ...payload.position };
                }
                if (payload.rotation) {
                    payload.rotation = { ...appConfig.rotation, ...payload.rotation };
                }
                
                appConfig = { ...appConfig, ...payload };
                
                // Sync legacy fields for PTT logic (Handle both flat and nested updates)
                const voiceUpdate = payload.voice || {};
                const flatPttKey = payload.pushToTalkKey;
                const flatPttEnabled = payload.pushToTalk;

                if (flatPttKey !== undefined) {
                    if (!appConfig.voice) appConfig.voice = {};
                    appConfig.voice.pttKey = flatPttKey;
                }
                if (flatPttEnabled !== undefined) {
                    if (!appConfig.voice) appConfig.voice = {};
                    appConfig.pushToTalk = flatPttEnabled;
                    appConfig.voice.mode = flatPttEnabled ? 'ptt' : 'vad';
                }
                
                // If nested voice update came in, ensure legacy fields match (optional, but good for consistency)
                if (voiceUpdate.pttKey !== undefined) {
                    appConfig.pushToTalkKey = voiceUpdate.pttKey;
                }

                saveConfig();
                broadcast({ type: 'config-update', payload: appConfig });
                applyWindowSettings();
                
                // Re-register PTT immediately if any voice/ptt related config changed
                if (flatPttEnabled !== undefined || flatPttKey !== undefined || voiceUpdate.pttKey !== undefined || voiceUpdate.enabled !== undefined) {
                    registerPTT();
                }
                
                // Re-register PTT since config changed
                if (data.payload.pushToTalk !== undefined || data.payload.pushToTalkKey !== undefined) {
                    registerPTT();
                }

                // Sync PTT config to Python (Still needed? Python inputs are disabled, but config might be useful)
                // pythonManager.send('config:update', appConfig);

            } else if (data.type === 'debug-command') {
                // Relay debug commands to all clients (Renderer)
                broadcast(data);
            } else if (data.type === 'app-command' && data.command === 'quit') {
                console.log('Quit command received. Stopping all services...');
                pythonManager.stop();
                ttsManager.stop();
                
                // Give processes a moment to terminate before quitting
                setTimeout(() => {
                    app.quit();
                }, 500);
            } else if (data.type === 'ui:pick-file') {
                 // Handle File Picker Request from Controller
                 const win = BrowserWindow.getFocusedWindow() || mainWindow;
                 if (win) {
                     dialog.showOpenDialog(win, {
                         properties: ['openFile'],
                         filters: data.filters || []
                     }).then(result => {
                         if (!result.canceled && result.filePaths.length > 0) {
                             broadcast({ 
                                 type: 'ui:pick-file-result',
                                 requestId: data.requestId, 
                                 path: result.filePaths[0] 
                             });
                         }
                     });
                 }
            } else if (data.type.startsWith('voice:') || data.type.startsWith('ai:') || data.type.startsWith('tts:')) {
                handleAICommand(data);
            }
        } catch (e) { console.error(e); }
    });
});


serverApp.get('/api/config', (req, res) => res.json(appConfig));
serverApp.post('/api/config', (req, res) => {
    // Deep merge nested objects to preserve existing properties
    if (req.body.shading) {
        req.body.shading = { ...appConfig.shading, ...req.body.shading };
    }
    if (req.body.tts) {
        req.body.tts = { ...appConfig.tts, ...req.body.tts };
    }
    if (req.body.subtitle) {
        req.body.subtitle = { ...appConfig.subtitle, ...req.body.subtitle };
    }
    if (req.body.position) {
        req.body.position = { ...appConfig.position, ...req.body.position };
    }
    if (req.body.rotation) {
        req.body.rotation = { ...appConfig.rotation, ...req.body.rotation };
    }
    
    appConfig = { ...appConfig, ...req.body };
    saveConfig();
    broadcast({ type: 'config-update', payload: appConfig });
    applyWindowSettings();
    res.json(appConfig);
});

// Audio Upload Endpoint
serverApp.post('/api/voice/upload', bodyParser.raw({ type: 'audio/wav', limit: '50mb' }), (req, res) => {
    try {
        // Temporary file? More like permanent clutter if the OS doesn't clean it up.
        const audioBuffer = req.body;
        const tempPath = path.join(os.tmpdir(), `hana_rec_${Date.now()}.wav`);
        fs.writeFileSync(tempPath, audioBuffer);
        
        console.log(`Received audio (${audioBuffer.length} bytes). Saved to ${tempPath}. Sending transcribe command...`);
        pythonManager.send('transcribe:file', { filepath: tempPath });
        
        res.json({ success: true });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message });
    }
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

  // Aggressively force 'screen-saver' level to stay on top of fullscreen games
  // Reduced polling frequency to lower CPU usage
  const keepOnTop = () => {
      if (mainWindow && appConfig.alwaysOnTop) {
          mainWindow.setAlwaysOnTop(true, "screen-saver");
      }
  };
  keepOnTop();
  setInterval(keepOnTop, 10000); // Increased to 10s to reduce CPU overhead

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
            contextIsolation: true,
            backgroundThrottling: false 
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
  pythonManager.start();
  
  if (appConfig.tts.enabled) {
      console.log("Starting TTS Manager...");
      ttsManager.start(appConfig);
  }

  // Initialize Input Hooks
  registerPTT();
  
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
    console.log('App will-quit: Cleaning up all processes...');
    globalShortcut.unregisterAll();
    uIOhook.stop();
    
    // Stop all Python processes
    pythonManager.stop();
    ttsManager.stop();
    
    console.log('Cleanup complete.');
  });
  
  app.on('quit', () => {
    console.log('App quit event. Forcing exit...');
    
    const isDev = process.env.NODE_ENV === 'development' || process.argv.includes('--dev');
    
    if (process.platform === 'win32' && isDev) {
        // In dev mode, kill processes on our dev ports synchronously
        const devPorts = [5173, 3002, 3003]; // Vite dev server ports only
        
        devPorts.forEach(port => {
            try {
                // Find and kill process on this port
                execSync(`powershell -Command "Get-NetTCPConnection -LocalPort ${port} -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"`, { 
                    timeout: 2000,
                    windowsHide: true,
                    stdio: 'ignore'
                });
            } catch (e) {
                // Ignore errors - process might already be dead
            }
        });
    }
    
    // Force immediate exit
    process.exit(0);
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// --- TTS Logic ---
// Scanning for models like a detective looking for lost keys
async function scanForModels(baseDir) {
    // Locate the mothership (Project Root)
    // We are in /hana-companion/electron/main.js, so we jump up two levels like Mario
    const root = path.resolve(__dirname, '../../'); 
    
    // Where could they be? Hiding in the fridge?
    const searchPaths = [
        path.join(root, 'GPT-SoVITS'),            // The OG folder
        path.join(root, 'python', 'gpt-sovits'),  // The sneaky python sub-folder
        path.join(root, 'gpt-sovits')             // The lowercase rebel
    ];
    
    // If the user gave us a map, check that first
    if (baseDir && fs.existsSync(baseDir)) searchPaths.unshift(baseDir);

    const gpt = new Set();
    const sovits = new Set();

    console.log(`[TTS Scan] Searching via paths: ${JSON.stringify(searchPaths)}`);

    const walk = (dir) => {
        if (!fs.existsSync(dir)) return;
        try {
            const files = fs.readdirSync(dir);
            for (const f of files) {
                const full = path.join(dir, f);
                const stat = fs.statSync(full);
                if (stat.isDirectory()) {
                    // Don't look in these places, they are scary or boring
                    if (f !== 'node_modules' && f !== '.git' && f !== '__pycache__' && f !== 'runtime') walk(full);
                } else {
                    // Ooh, shiny files!
                    if (f.endsWith('.ckpt')) gpt.add(full);
                    else if (f.endsWith('.pth')) {
                         const lower = f.toLowerCase();
                         // Is it a SoVITS content file?
                         if (lower.includes('sovits') || lower.includes('s2') || lower.includes('g_')) sovits.add(full);
                    }
                }
            }
        } catch (e) { 
            // Ghost in the machine?
            console.error(`[TTS Scan] Failed to read ${dir}: ${e.message}`);
        }
    };

    searchPaths.forEach(p => walk(p));
    
    const results = { gpt: Array.from(gpt), sovits: Array.from(sovits) };
    console.log(`[TTS Scan] Found ${results.gpt.length} GPT and ${results.sovits.length} SoVITS models. Time to party.`);
    return results;
}

async function performTTS(params) {
    console.log("Generating TTS for:", params.text);
    
    // Map full language names to codes expected by V2
    const langMap = {
        "English": "en",
        "Chinese": "zh",
        "Japanese": "ja",
        "Korean": "ko",
        "Mixed": "auto"
    };

    const mapLang = (l) => langMap[l] || l || "en";
    
    // Map params to API V2 schema
    const apiParams = {
        text: params.text,
        text_lang: mapLang(params.text_lang),
        ref_audio_path: params.ref_audio_path,
        prompt_text: params.prompt_text || "",
        prompt_lang: mapLang(params.prompt_lang),
        speed_factor: params.speed_factor || 1.0,
        temperature: params.temperature || 1.0,
        top_k: params.top_k || 5,
        top_p: params.top_p || 1.0,
        text_split_method: params.cut_method || params.howToCut || "cut0", // Default to cut0 for streaming
        batch_size: 1, // FORCE 1 for latency
        split_bucket: params.split_bucket || true,
        parallel_infer: true, // FORCE Parallel
        repetition_penalty: params.repetition_penalty || 1.35,
        media_type: "wav", // WAV is uncompressed (faster initiation than OGG/AAC on localhost)
        streaming_mode: true
    };

    try {
        // Generate a random ID for this request
        const crypto = require('crypto');
        const id = crypto.randomUUID();
        
        console.log(`[TTS] Queued stream ID: ${id} with split method: ${apiParams.text_split_method}`);

        // Cache parameters for the stream endpoint
        ttsQueue.set(id, apiParams);
        
        // Construct the sexy URL
        const streamUrl = `http://localhost:${PORT}/tts-stream/${id}`;
        
        // Broadcast the URL immediately. The browser will request it, triggering the stream.
        // Look ma, no hands! (No waiting for full generation)
        broadcast({ type: 'tts:audio', payload: { result: streamUrl, text: params.text } });
        
    } catch (e) {
        console.error("TTS Gen Failed:", e);
        broadcast({ type: 'error', payload: { text: "TTS Failed: " + e.message } });
    }
}

// --- IPC Commands ---

// 1. Voice & AI Bridge
let pythonInitialized = false;

pythonManager.on('message', (msg) => {
    // Handling Initial Connection
    if (msg.type === 'status' && msg.payload.text === 'Ready') {
         // Only log and sync config ONCE at startup to avoid annoyance
         if (!pythonInitialized) {
             console.log("Python Backend Ready. Syncing Config...");
             pythonManager.send('config:update', appConfig);
             if (appConfig.audioDeviceIndex !== null) {
                pythonManager.send('voice:set-device', { index: appConfig.audioDeviceIndex });
             }
             pythonInitialized = true;
         }
    }

    // Broadcast back to Renderer and Controller
    // We use 'subtype' to avoid overwriting the main 'type' field which routes the message in renderer
    broadcast({ type: 'ai-event', subtype: msg.type, payload: msg.payload });

    // Main Process Logic (Auto-Reply)
    if (msg.type === 'transcription') {
        const text = msg.payload.text;
        if (text && appConfig.aiEnabled) {
             let prompt = appConfig.systemPrompt;
             
             // Inject instructions for Expressive Animation if enabled
             if (appConfig.expressiveAnimation) {
                 prompt += `\n[INSTRUCTION]: You are powered by a simulated neural engine. 
                 At the end of your response, you MUST append a distinct mood tag in this format: [Mood: Valence, Arousal].
                 - Valence: -1.0 (Negative/Sad) to 1.0 (Positive/Happy).
                 - Arousal: -1.0 (Low Energy/Sleepy) to 1.0 (High Energy/Excited).
                 
                 Examples:
                 "I am so happy to see you!" [Mood: 0.9, 0.8]
                 "I'm feeling a bit tired today..." [Mood: 0.1, -0.8]
                 "That makes me really angry!" [Mood: -0.9, 0.9]
                 
                 Also continue to use gesture tags like [nod], [shake], [tilt_question], [happy_bounce], [lean_forward], [excited] separately if needed.
                 Use them naturally.`;
             }

             pythonManager.send('ai:send', {
                 prompt: text,
                 model: appConfig.ollamaModel,
                 systemPrompt: prompt
             });
        }
    } else if (msg.type === 'ai:response') {
        // Auto-TTS Trigger
        if (appConfig.tts.enabled) {
            let text = msg.payload.text;
            
            // Strip mood tags from speech (e.g., "[Mood: 0.8, 0.5]")
            text = text.replace(/\s*\[Mood:\s*[\d.-]+,\s*[\d.-]+\]\s*/gi, '').trim();
            
            // Build TTS Params
            const params = {
                text: text,
                text_lang: appConfig.tts.textLang,
                ref_audio_path: appConfig.tts.refAudioPath,
                aux_ref_audio_paths: appConfig.tts.auxRefAudioPaths,
                prompt_lang: appConfig.tts.promptLang,
                prompt_text: appConfig.tts.promptText,
                top_k: appConfig.tts.topK,
                top_p: appConfig.tts.topP,
                temperature: appConfig.tts.temperature,
                cut_method: appConfig.tts.howToCut,
                speed_factor: appConfig.tts.speed,
                fragment_interval: appConfig.tts.fragmentInterval,
                batch_size: appConfig.tts.v2BatchSize,
                split_bucket: appConfig.tts.v2SplitBucket,
                parallel_infer: appConfig.tts.v2ParallelInfer,
                repetition_penalty: appConfig.tts.v2RepetitionPenalty,
                seed: appConfig.tts.v2Seed,
                keep_random: appConfig.tts.v2KeepRandom
            };
            performTTS(params);
        }
    } else if (msg.type === 'voice:devices') {
        // Forward devices list to controller/renderer
        broadcast(msg);
    } else if (msg.type === 'tts:status' || msg.type === 'tts:models' || msg.type === 'tts:audio') {
        broadcast(msg);
    }
});

// Handle commands from Controller (via WS) or Renderer (via IPC) that need to go to Python
function handleAICommand(command) {
    if (command.type.startsWith('tts:')) {
         const payload = command.payload || {};
         if (command.type === 'tts:scan-models') {
             scanForModels(payload.base_path).then(models => {
                 broadcast({ type: 'tts:models', payload: models });
             });
         } else if (command.type === 'tts:launch') {
             try {
                 ttsManager.start(appConfig);
                 broadcast({ type: 'tts:status', payload: { connected: true, msg: "Backend Started" } });
             } catch (e) {
                 broadcast({ type: 'tts:status', payload: { connected: false, msg: e.message } });
             }
         } else if (command.type === 'tts:restart') {
             try {
                 ttsManager.stop();
                 // Give it a second to release the port and make peace with its ancestors
                 setTimeout(() => {
                     ttsManager.start(appConfig);
                     broadcast({ type: 'tts:status', payload: { connected: true, msg: "Backend Restarted" } });
                 }, 1500);
             } catch (e) {
                 broadcast({ type: 'tts:status', payload: { connected: false, msg: e.message } });
             }
         } else if (command.type === 'tts:connect') {
             if (payload.ip) appConfig.tts.baseUrl = payload.ip;
             broadcast({ type: 'tts:status', payload: { connected: true, msg: "API URL Set" } });
         } else if (command.type === 'tts:set-weights') {
             const apiUrl = appConfig.tts.baseUrl || "http://127.0.0.1:9880";
             Promise.all([
                 ttsManager.setGPT(apiUrl, { weights_path: payload.gpt_path }),
                 ttsManager.setSoVITS(apiUrl, { weights_path: payload.sovits_path })
             ])
             .then(() => broadcast({ type: 'tts:weights-status', payload: { success: true } }))
             .catch(e => broadcast({ type: 'tts:weights-status', payload: { success: false, msg: e.message } }));
         } else if (command.type === 'tts:speak') {
             performTTS(payload);
         }
         return;
    }

    if (command.type === 'voice:start') {
        // Ensure device is set before starting (redundant but safe)
        pythonManager.send('voice:set-device', { index: appConfig.audioDeviceIndex });
        pythonManager.send('voice:start');
    } else if (command.type === 'voice:stop') {
        pythonManager.send('voice:stop');
    } else if (command.type === 'voice:get-devices') {
        pythonManager.send('voice:get-devices');
    } else if (command.type === 'voice:set-device') {
         // The Controller sends { type: 'voice:set-device', index: 1 } (flattened)
         // Check both locations to be safe
         const val = (command.payload && command.payload.index) !== undefined 
             ? command.payload.index 
             : command.index;
             
         appConfig.audioDeviceIndex = val;
         saveConfig();
         broadcast({ type: 'config-update', payload: { audioDeviceIndex: appConfig.audioDeviceIndex } });
         pythonManager.send('voice:set-device', { index: appConfig.audioDeviceIndex });
    } else if (command.type === 'ai:reset') {
        // Reset context logic if implemented
    }
}

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
