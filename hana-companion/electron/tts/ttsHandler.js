const GPTSoVITSManager = require('./gptSovits/gptSovitsManager');
const gptSovitsHandler = require('./gptSovits/gptSovitsHandler');

class TTSHandler {
    constructor(configDir) {
        this.gptSovits = new GPTSoVITSManager(configDir);
        this.activeProvider = null;
    }

    start(config) {
        // ALWAYS use GPT-SoVITS
        this.activeProvider = this.gptSovits;
        
        // Map Hana config to Akari style
        // Hana: config.tts.baseUrl, config.tts.selectedSovitsPath
        // Akari: config.tts.apiUrl, config.tts.sovitsPath
        
        const ttsConf = config.tts;
        const apiUrl = ttsConf.baseUrl || ttsConf.apiUrl || 'http://127.0.0.1:9880';
        
        let port = 9880;
        try {
            const url = new URL(apiUrl);
            port = parseInt(url.port) || 9880;
        } catch (e) {}

        this.gptSovits.start(port).then(() => {
            // Wait for server to be ready and set models
            this.gptSovits.waitForReady(apiUrl).then(ready => {
                if (ready) {
                    console.log("GPT-SoVITS server is ready. Setting models...");
                    
                    // Add a small delay like Akari just in case
                    setTimeout(async () => {
                        const sovitsPath = ttsConf.selectedSovitsPath || ttsConf.sovitsPath;
                        const gptPath = ttsConf.selectedGptPath || ttsConf.gptPath;
    
                        // Only set if paths are valid strings (not empty)
                        // AND if the file actually exists (Akari doesn't check fs here, but safer to do sc)
                        
                        try {
                            if (sovitsPath) {
                                await gptSovitsHandler.setSoVITS(apiUrl, { weights_path: sovitsPath });
                                console.log("Set SoVITS model:", sovitsPath);
                            }
                            
                            if (gptPath) {
                                await gptSovitsHandler.setGPT(apiUrl, { weights_path: gptPath });
                                console.log("Set GPT model:", gptPath);
                            }
                        } catch (e) {
                             console.error("Failed to apply GPT-SoVITS models on startup:", e);
                        }
                    }, 2000);
                }
            });
        });
    }

    stop() {
        if (this.gptSovits.process) this.gptSovits.stop();
        this.activeProvider = null;
    }

    isRunning() {
        if (this.activeProvider === this.gptSovits) {
            return !!this.gptSovits.process;
        }
        return false;
    }

    async getModels(apiUrl) {
        return gptSovitsHandler.getModels(apiUrl);
    }

    async setSoVITS(apiUrl, params) {
        return gptSovitsHandler.setSoVITS(apiUrl, params);
    }

    async setGPT(apiUrl, params) {
        return gptSovitsHandler.setGPT(apiUrl, params);
    }

    async generateAudio(apiUrl, params) {
        return gptSovitsHandler.generateAudio(apiUrl, params);
    }
}

module.exports = TTSHandler;
