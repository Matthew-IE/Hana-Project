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
                    
                    // Longer delay to avoid interrupting startup TTS requests
                    // The server loads default models on startup, so this is only needed
                    // if user has custom models selected
                    setTimeout(async () => {
                        const sovitsPath = ttsConf.selectedSovitsPath || ttsConf.sovitsPath;
                        const gptPath = ttsConf.selectedGptPath || ttsConf.gptPath;
    
                        // Skip if using default pretrained models (they're already loaded)
                        const isDefaultSovits = !sovitsPath || sovitsPath.includes('pretrained_models');
                        const isDefaultGpt = !gptPath || gptPath.includes('pretrained_models');
                        
                        if (isDefaultSovits && isDefaultGpt) {
                            console.log("Using default pretrained models, skipping reload.");
                            return;
                        }
                        
                        try {
                            if (sovitsPath && !isDefaultSovits) {
                                await gptSovitsHandler.setSoVITS(apiUrl, { weights_path: sovitsPath });
                                console.log("Set SoVITS model:", sovitsPath);
                            }
                            
                            if (gptPath && !isDefaultGpt) {
                                await gptSovitsHandler.setGPT(apiUrl, { weights_path: gptPath });
                                console.log("Set GPT model:", gptPath);
                            }
                        } catch (e) {
                             console.error("Failed to apply GPT-SoVITS models on startup:", e);
                        }
                    }, 8000); // Longer delay to let initial TTS complete
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
