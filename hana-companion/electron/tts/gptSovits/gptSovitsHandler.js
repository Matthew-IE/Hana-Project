const fs = require('fs');
const path = require('path');
const { app } = require('electron');

// Helper to find models
const GPT_SOVITS_ROOT = path.resolve(__dirname, '../../../../python/gpt-sovits');

// Cache for model scans - avoid repeated filesystem access
let modelCache = null;
let modelCacheTime = 0;
const MODEL_CACHE_TTL = 60000; // 60 seconds cache TTL

async function getModels(apiUrl) {
    // Return cached results if still valid
    const now = Date.now();
    if (modelCache && (now - modelCacheTime) < MODEL_CACHE_TTL) {
        return modelCache;
    }

    // Scan directories
    // console.log("Scanning for models in:", GPT_SOVITS_ROOT);
    
    const gptDir = path.join(GPT_SOVITS_ROOT, 'GPT_weights');
    const sovitsDir = path.join(GPT_SOVITS_ROOT, 'SoVITS_weights');
    
    // Also check v2/v3 folders if they exist
    const gptDirV2 = path.join(GPT_SOVITS_ROOT, 'GPT_weights_v2');
    const sovitsDirV2 = path.join(GPT_SOVITS_ROOT, 'SoVITS_weights_v2');
    const gptDirV3 = path.join(GPT_SOVITS_ROOT, 'GPT_weights_v3');
    const sovitsDirV3 = path.join(GPT_SOVITS_ROOT, 'SoVITS_weights_v3');
    
    const pretrainedDir = path.join(GPT_SOVITS_ROOT, 'pretrained_models');

    const getFiles = (dir) => {
        if (!fs.existsSync(dir)) {
            console.log("Directory not found:", dir);
            return [];
        }
        const files = fs.readdirSync(dir).filter(f => !f.startsWith('.'));
        console.log(`Found ${files.length} files in ${dir}`);
        return files;
    };

    const pretrainedFiles = getFiles(pretrainedDir);
    const pretrainedGpt = pretrainedFiles.filter(f => f.endsWith('.ckpt')).map(f => ({ name: f, path: path.join(pretrainedDir, f) }));
    const pretrainedSovits = pretrainedFiles.filter(f => f.endsWith('.pth')).map(f => ({ name: f, path: path.join(pretrainedDir, f) }));

    const gptModels = [
        ...getFiles(gptDir).map(f => ({ name: f, path: path.join(gptDir, f) })),
        ...getFiles(gptDirV2).map(f => ({ name: f, path: path.join(gptDirV2, f) })),
        ...getFiles(gptDirV3).map(f => ({ name: f, path: path.join(gptDirV3, f) })),
        ...pretrainedGpt
    ];

    const sovitsModels = [
        ...getFiles(sovitsDir).map(f => ({ name: f, path: path.join(sovitsDir, f) })),
        ...getFiles(sovitsDirV2).map(f => ({ name: f, path: path.join(sovitsDirV2, f) })),
        ...getFiles(sovitsDirV3).map(f => ({ name: f, path: path.join(sovitsDirV3, f) })),
        ...pretrainedSovits
    ];

    // Cache the results
    modelCache = { gpt: gptModels, sovits: sovitsModels };
    modelCacheTime = Date.now();

    return modelCache;
}

async function setSoVITS(apiUrl, params) {
    // params: { weights_path }
    // API expects GET /set_sovits_weights?weights_path=...
    // Ensure apiUrl ends with / or handle it
    const baseUrl = apiUrl.endsWith('/') ? apiUrl : apiUrl + '/';
    // Force IPv4 to avoid ECONNREFUSED ::1 issues on Node 18+
    const fixedUrl = baseUrl.replace('localhost', '127.0.0.1');
    const url = new URL('set_sovits_weights', fixedUrl);
    
    const pathVal = params.weights_path || params.path || params.sovits_path;
    if (!pathVal) throw new Error("No model path provided");

    url.searchParams.append('weights_path', pathVal); // API v2 usually handles this query param

    console.log(`Setting SoVITS: ${pathVal}`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to set SoVITS weights: ${res.statusText}`);
    return await res.json(); // API returns success message or current weights
}

async function setGPT(apiUrl, params) {
    // params: { weights_path }
    // API expects GET /set_gpt_weights?weights_path=...
    const baseUrl = apiUrl.endsWith('/') ? apiUrl : apiUrl + '/';
    // Force IPv4
    const fixedUrl = baseUrl.replace('localhost', '127.0.0.1');
    const url = new URL('set_gpt_weights', fixedUrl);
    
    const pathVal = params.weights_path || params.path || params.gpt_path;
    if (!pathVal) throw new Error("No model path provided");

    url.searchParams.append('weights_path', pathVal);
    // API v2 doesn't always need version if inferred, but we can pass it
    // if (params.version) {
    //    url.searchParams.append('version', params.version);
    // }
    
    console.log(`Setting GPT: ${pathVal}`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to set GPT weights: ${res.statusText}`);
    return await res.json();
}

const LANG_MAP = {
    'english': 'en',
    'japanese': 'ja',
    'chinese': 'zh',
    'zh': 'zh',
    'en': 'en',
    'ja': 'ja',
    'ko': 'ko',
    'korean': 'ko'
};

async function generateAudio(apiUrl, params) {
    // params: { text, text_lang, ref_audio_path, prompt_text, prompt_lang, ... }
    // API expects POST /tts
    
    const baseUrl = apiUrl.endsWith('/') ? apiUrl : apiUrl + '/';
    // Force IPv4
    const fixedUrl = baseUrl.replace('localhost', '127.0.0.1');
    
    const textLang = (params.text_lang || 'en').toLowerCase();
    const promptLang = (params.prompt_lang || 'en').toLowerCase();

    // OPTIMIZED payload for speed and lower resource usage
    const body = {
        text: params.text,
        text_lang: LANG_MAP[textLang] || textLang,
        ref_audio_path: params.ref_audio_path,
        prompt_text: params.prompt_text || "",
        prompt_lang: LANG_MAP[promptLang] || promptLang,
        // Speed optimizations:
        top_k: params.top_k || 3,           // Reduced from 5 - faster sampling
        top_p: params.top_p || 0.8,         // Reduced from 1 - more focused
        temperature: params.temperature || 0.8, // Slightly lower for consistency
        text_split_method: params.text_split_method || "cut0", // cut0 = no split, fastest for short text
        batch_size: 1,                      // Always 1 for lowest latency
        batch_threshold: 0.5,               // Lower threshold
        speed_factor: params.speed_factor || 1.0,
        streaming_mode: true,               // Always stream for faster first-byte
        media_type: "raw",                  // Raw PCM - no encoding overhead
        parallel_infer: true,               // Enable parallel inference
        repetition_penalty: 1.25,           // Slightly lower for speed
        split_bucket: false,                // Disable bucket splitting for latency
        fragment_interval: 0.2,             // Faster fragment generation
        seed: -1                            // Random seed
    };

    // Only log in debug mode to reduce console overhead
    // console.log("Sending TTS Request:", JSON.stringify(body, null, 2));

    const res = await fetch(new URL('tts', fixedUrl), {
        method: 'POST',
        headers: { 
            'Content-Type': 'application/json',
            'Connection': 'keep-alive'       // Reuse connection
        },
        body: JSON.stringify(body)
    });

    if (!res.ok) {
        const err = await res.text();
        throw new Error(`TTS Generation Failed: ${err}`);
    }

    // Check for JSON error response
    const contentType = res.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
        // Sometimes API returns 200 but body implies error or it's just config
        // But likely it's audio
    }

    if (params.streamCallback && res.body) {
        // Stream Handling
        const reader = res.body.getReader();
        let headerProcessed = false;

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            if (!headerProcessed) {
                // Header stripping logic handled in Main/TTSHandler?
                // Akari handles it in main.js usually, but let's see.
                // Akari's main.js does the stripping. The handler just passes raw chunk.
                // So we pass 'value' (Uint8Array) directly.
                headerProcessed = true;
            }
            
            params.streamCallback(value);
        }
        
        return { streamed: true };
    }

    // Non-streaming (save to file)
    const buffer = await res.arrayBuffer();
    
    if (buffer.byteLength < 100) {
        throw new Error(`TTS generated audio is too small (${buffer.byteLength} bytes). Likely an error.`);
    }

    const tempDir = path.join(app.getPath('userData'), 'temp');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
    
    const fileName = `tts_${Date.now()}.wav`;
    const filePath = path.join(tempDir, fileName);
    
    fs.writeFileSync(filePath, Buffer.from(buffer));
    
    return { audioPath: filePath };
}

module.exports = {
    getModels,
    setSoVITS,
    setGPT,
    generateAudio
};
