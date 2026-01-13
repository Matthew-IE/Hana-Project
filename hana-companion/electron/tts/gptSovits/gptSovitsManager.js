const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

class GPTSoVITSManager {
    constructor(configDir) {
        this.process = null;
        this.configDir = configDir;
        // Path to the GPT-SoVITS root folder
        this.rootDir = path.resolve(__dirname, '../../../../python/gpt-sovits');
        
        // Path to the embedded Python executable (if available)
        // Check for runtime/python.exe first
        const runtimePython = path.join(this.rootDir, 'runtime', 'python.exe');
        if (fs.existsSync(runtimePython)) {
             this.pythonPath = runtimePython;
        } else {
             // Fallback to venv or system python
             // Check venv
             const venvPython = path.join(this.rootDir, 'venv', 'Scripts', 'python.exe');
             if (fs.existsSync(venvPython)) {
                 this.pythonPath = venvPython;
             } else {
                 this.pythonPath = 'python'; // System path
             }
        }

        // Path to the API script
        this.scriptPath = path.join(this.rootDir, 'api_v2.py');
        
        // Log deduplication
        this.recentLogs = new Set();
    }

    log(message, isError = false) {
        if (this.recentLogs.has(message)) return;
        this.recentLogs.add(message);
        setTimeout(() => this.recentLogs.delete(message), 5000); // 5s deduplication

        if (isError) console.error(`[GPT-SoVITS Error] ${message}`);
        else console.log(`[GPT-SoVITS] ${message}`);
    }

    async checkIfRunning(port) {
        try {
            // Short timeout check
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 1000);
            // Basic root check instead of specific endpoint which might vary or require auth/setup
            const res = await fetch(`http://127.0.0.1:${port}/`, { signal: controller.signal });
            clearTimeout(timeoutId);
            // If we get ANY response (even 404), something is listening
            return true;
        } catch (e) {
            // Fetch throws on connection refused, meaning nothing is listening
            return false;
        }
    }

    async start(port = 9880) {
        if (this.process) {
            console.log("GPT-SoVITS is already running (managed).");
            return;
        }

        // Check if port is already active (Zombie / External process)
        const isAlreadyRunning = await this.checkIfRunning(port);
        if (isAlreadyRunning) {
            console.log(`[GPT-SoVITS] Service found running on port ${port}. Skipping spawn.`);
            return;
        }

        if (!fs.existsSync(this.rootDir)) {
            console.error('GPT-SoVITS root directory not found at:', this.rootDir);
            console.error('Expected structure: python/gpt-sovits contains the runtime folder.');
            return;
        }

        if (!fs.existsSync(this.scriptPath)) {
            console.error(`GPT-SoVITS API script not found at: ${this.scriptPath}`);
            return;
        }

        console.log(`Starting GPT-SoVITS on port ${port}...`);
        console.log(`Python Path: ${this.pythonPath}`);
        
        // Arguments for api_v2.py
        // -a 127.0.0.1 -p <port>
        const args = ['-a', '127.0.0.1', '-p', port.toString()];

        this.process = spawn(this.pythonPath, [this.scriptPath, ...args], {
            cwd: this.rootDir, // Important: Run from the GPT-SoVITS root
            stdio: ['ignore', 'pipe', 'pipe'], // Capture stdout/stderr
            windowsHide: true, // Hide the console window
            env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' }
        });

        this.process.stdout.on('data', (data) => {
            const lines = data.toString().split(/\r?\n/);
            lines.forEach(line => {
                const trimmed = line.trim();
                if (!trimmed) return;
                // Filter Uvicorn noise
                if (trimmed.includes('INFO:') || trimmed.includes('HTTP Request:')) {
                    this.log(trimmed, false);
                } else {
                    this.log(trimmed, true);
                }
            });
        });

        this.process.stderr.on('data', (data) => {
             const lines = data.toString().split(/\r?\n/);
             lines.forEach(line => {
                 const trimmed = line.trim();
                 if (!trimmed) return;
                 // Some info logs come to stderr
                 if (trimmed.includes('INFO:') || trimmed.includes('HTTP Request:')) {
                     this.log(trimmed, false);
                 } else {
                     this.log(trimmed, true); // Treat as warning/started
                 }
             });
        });

        this.process.on('close', (code) => {
            console.log(`GPT-SoVITS process exited with code ${code}`);
            this.process = null;
        });

        this.process.on('error', (err) => {
            console.error('Failed to start GPT-SoVITS process:', err);
        });
    }

    stop() {
        if (this.process) {
            console.log('Stopping GPT-SoVITS process...');
            this.process.kill();
            this.process = null;
        }
    }

    isRunning() {
        return this.process !== null;
    }

    async waitForReady(apiUrl, timeout = 60000) {
        const start = Date.now();
        const baseUrl = apiUrl.endsWith('/') ? apiUrl : apiUrl + '/';
        const url = baseUrl + 'character_list'; // Check if API is responsive

        while (true) {
            if (Date.now() - start > timeout) {
                // User reports it works even if we timeout, so suppress error and return true to attempt model loading anyway.
                console.log("[GPT-SoVITS] Startup check ended (timeout). Assuming service is ready.");
                return true; 
            }

            try {
                const res = await fetch(baseUrl); // Fetch root to check connectivity
                // If we get a response, the server is up (even if 404 Not Found for root)
                // We just need to know the port is listening and talking HTTP
                if (res) {
                    return true;
                }
            } catch (e) {
                // Ignore connection refused
            }

            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
}

module.exports = GPTSoVITSManager;
