const { spawn, execSync } = require('child_process');
const path = require('path');
const EventEmitter = require('events');
const { app } = require('electron');

class PythonManager extends EventEmitter {
    constructor() {
        super();
        this.process = null;
        this.pythonPath = this.detectPythonPath();
        this.scriptPath = path.join(__dirname, '../../../python/main.py');
        this.shuttingDown = false;
    }

    detectPythonPath() {
        // Production vs Dev path logic
        // For now, assume a venv at workspace root/python/venv
        // In dev, we are in hana-companion/electron/ai, so root is ../../../
        // This path traversal is giving me vertigo
        const venvPath = path.join(__dirname, '../../../python/venv/Scripts/python.exe');
        return venvPath;
        // NOTE: If venv doesn't exist, this will fail. 
        // We might want to fallback to 'python' for dev convenience if user hasn't set up venv yet
    }

    start() {
        if (this.process) return;

        console.log(`Starting Python service at: ${this.pythonPath}`);
        console.log(`Script: ${this.scriptPath}`);

        this.process = spawn(this.pythonPath, [this.scriptPath], {
            cwd: path.dirname(this.scriptPath),
            stdio: ['pipe', 'pipe', 'pipe'] // Stdin, Stdout, Stderr
        });

        this.process.stdout.on('data', (data) => {
            const lines = data.toString().split('\n');
            lines.forEach(line => {
                if (!line.trim()) return;
                try {
                    const msg = JSON.parse(line);
                    this.emit('message', msg);
                } catch (e) {
                    // Python probably printed a stack trace or a print() meant for debugging
                    console.log('Python Stdout (Raw):', line);
                }
            });
        });

        this.process.stderr.on('data', (data) => {
            // Python stderr is used for logging to separate it from the stdout JSON stream
            // We log it as 'log' instead of 'error' so it doesn't look scary in the console
            // unless it actually contains the word "Error" or "Traceback"
            const text = data.toString();
            if (text.toLowerCase().includes('error') || text.includes('Traceback')) {
                 console.error('Python Error:', text);
            } else {
                 console.log('Python Log:', text);
            }
        });

        this.process.on('close', (code) => {
            console.log(`Python process exited with code ${code}`);
            this.process = null;
            if (!this.shuttingDown) {
                console.log("Restarting Python service in 2s...");
                // Have you tried turning it off and on again?
                setTimeout(() => this.start(), 2000);
            }
        });
        
        // ...
    }

    stop() {
        this.shuttingDown = true;
        if (this.process) {
            const pid = this.process.pid;
            console.log(`Stopping Python process (PID: ${pid})...`);
            
            // On Windows, use taskkill to kill the entire process tree
            if (process.platform === 'win32') {
                try {
                    execSync(`taskkill /pid ${pid} /T /F`, { 
                        timeout: 5000, 
                        windowsHide: true,
                        stdio: 'ignore'
                    });
                } catch (e) {
                    // Process might already be dead
                }
            } else {
                // On Unix, kill the process group
                try {
                    process.kill(-pid, 'SIGTERM');
                } catch (e) {
                    this.process.kill('SIGTERM');
                }
            }
            this.process = null;
        }
    }

    send(type, payload = {}) {
        if (!this.process) return;
        const msg = JSON.stringify({ type, payload }) + '\n';
        // console.log(`Sending to Python: ${msg}`); // Uncomment for extreme debug
        this.process.stdin.write(msg);
    }
}

module.exports = new PythonManager();
