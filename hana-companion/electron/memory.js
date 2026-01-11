const fs = require('fs');
const path = require('path');

class MemoryManager {
    constructor(userDataPath) {
        this.memoryFile = path.join(userDataPath, 'memory.json');
        this.maxContextMessages = 20; // Limit loaded memory to last 20 messages to save context
        this.memoryCache = null;
    }

    getMemory() {
        if (this.memoryCache) return this.memoryCache;

        try {
            if (fs.existsSync(this.memoryFile)) {
                const data = fs.readFileSync(this.memoryFile, 'utf8');
                this.memoryCache = JSON.parse(data);
                return this.memoryCache;
            }
        } catch (e) {
            console.error("Failed to read memory file:", e);
        }
        this.memoryCache = [];
        return this.memoryCache;
    }

    addToMemory(role, content) {
        try {
            let memory = this.getMemory();
            memory.push({ role, content, timestamp: Date.now() });
            
            // Limit memory size to prevent performance degradation
            if (memory.length > 100) {
                memory = memory.slice(-100);
            }
            
            // Update cache
            this.memoryCache = memory;
            
            // Write to disk asynchronously to avoid blocking
            fs.writeFile(this.memoryFile, JSON.stringify(memory, null, 2), (err) => {
                if (err) console.error("Failed to save memory async:", err);
            });
        } catch (e) {
            console.error("Failed to add to memory:", e);
        }
    }

    getContext() {
        const memory = this.getMemory();
        // Return last N messages, excluding timestamps
        return memory.slice(-this.maxContextMessages).map(m => ({
            role: m.role,
            content: m.content
        }));
    }

    clearMemory() {
        try {
            this.memoryCache = [];
            fs.writeFileSync(this.memoryFile, '[]');
        } catch (e) {
            console.error("Failed to clear memory:", e);
        }
    }
}

module.exports = MemoryManager;
