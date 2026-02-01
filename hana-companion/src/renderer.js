import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import { loadMixamoAnimation } from './mixamo.js';
import { ProceduralAnimator } from './animation/ProceduralAnimator.js';

// --- Scene Setup ---
// If you gaze long into the abyss, the abyss gazes also into you. 
// Or in this case, a 3D anime girl gazes into you.
const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();

// Camera
// The all-seeing eye
const camera = new THREE.PerspectiveCamera(30, window.innerWidth / window.innerHeight, 0.1, 20.0);
camera.position.set(0.0, 1.0, 5.0);

// Renderer - OPTIMIZED for performance
// Adaptive pixel ratio based on device capability
const getOptimalPixelRatio = () => {
    const dpr = window.devicePixelRatio || 1;
    // Cap at 1.5 for better performance on high-DPI displays
    // Most users won't notice difference above 1.5 for VRM models
    return Math.min(dpr, 1.5);
};

const renderer = new THREE.WebGLRenderer({ 
    alpha: true, 
    antialias: false,  // Disable AA - use FXAA post-process if needed for better perf
    powerPreference: 'high-performance',  // Request high-performance GPU
    stencil: false,    // Not needed for simple VRM rendering
    depth: true
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(getOptimalPixelRatio());

// WebGL optimizations
renderer.physicallyCorrectLights = false;  // Disable PBR for speed
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;  // Skip tone mapping

container.appendChild(renderer.domElement);

// Light
// Let there be light (and shadows if we were brave enough)
const light = new THREE.DirectionalLight(0xffffff, 1.0);
light.position.set(1.0, 1.0, 1.0).normalize();
scene.add(light);

// Add ambient light for toon shading
const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
scene.add(ambientLight);

// Clock
// Tick tock, Mr. Wick
const clock = new THREE.Clock();

// Pre-allocated vectors to reduce GC pressure in animation loop
const _tempVec3 = new THREE.Vector3();
const _tempVec3B = new THREE.Vector3();
const _tempMatrix4 = new THREE.Matrix4();

// --- Toon Shading ---
let currentShadingMode = 'default';
let originalMaterials = new Map(); // Store original materials for reverting
let currentShadingConfig = {
    mode: 'default',
    lightIntensity: 1.0,
    ambientIntensity: 0.4,
    shadowDarkness: 120,
    saturationBoost: 1.0,
    lightX: 1.0,
    lightY: 1.0,
    lightZ: 1.0,
};

// Create a gradient map based on shadowDarkness setting
function createToonGradientMap(shadowDarkness = 120) {
    // 2-tone sharp gradient for cel shading effect
    // shadowDarkness: 0 = pitch black shadows, 255 = no shadow difference
    const shadowValue = Math.max(0, Math.min(255, Math.round(shadowDarkness)));
    
    // Create a small texture with shadow and lit values (RGBA format for Three.js 0.160+)
    const size = 4;
    const data = new Uint8Array(size * 4); // RGBA format
    
    // First half is shadow, second half is full lit
    for (let i = 0; i < size; i++) {
        const idx = i * 4;
        if (i < size / 2) {
            // Shadow zone
            data[idx] = shadowValue;     // R
            data[idx + 1] = shadowValue; // G
            data[idx + 2] = shadowValue; // B
            data[idx + 3] = 255;         // A
        } else {
            // Lit zone
            data[idx] = 255;     // R
            data[idx + 1] = 255; // G
            data[idx + 2] = 255; // B
            data[idx + 3] = 255; // A
        }
    }
    
    const gradientMap = new THREE.DataTexture(data, size, 1, THREE.RGBAFormat);
    gradientMap.minFilter = THREE.NearestFilter;
    gradientMap.magFilter = THREE.NearestFilter;
    gradientMap.needsUpdate = true;
    
    return gradientMap;
}

// Custom toon material with configurable settings
function createToonMaterial(originalMaterial, config) {
    let baseColor = new THREE.Color(0xffffff);
    let mainTexture = null;
    let alphaMap = null;
    let alphaTest = 0;
    let transparent = false;
    let opacity = 1.0;
    let side = THREE.FrontSide;
    
    // Extract properties from various material types (including ShaderMaterial/MToonMaterial)
    if (originalMaterial.color) {
        baseColor = originalMaterial.color.clone();
    } else if (originalMaterial.uniforms?.litFactor?.value) {
        // MToonMaterial stores color in uniforms
        baseColor = originalMaterial.uniforms.litFactor.value.clone();
    } else if (originalMaterial.uniforms?.diffuse?.value) {
        baseColor = originalMaterial.uniforms.diffuse.value.clone();
    }
    
    // Get texture
    if (originalMaterial.map) {
        mainTexture = originalMaterial.map;
    } else if (originalMaterial.uniforms?.map?.value) {
        mainTexture = originalMaterial.uniforms.map.value;
    }
    
    // Get alpha properties
    if (originalMaterial.alphaMap) {
        alphaMap = originalMaterial.alphaMap;
    } else if (originalMaterial.uniforms?.alphaMap?.value) {
        alphaMap = originalMaterial.uniforms.alphaMap.value;
    }
    
    alphaTest = originalMaterial.alphaTest || 0;
    transparent = originalMaterial.transparent || alphaTest > 0;
    opacity = originalMaterial.opacity !== undefined ? originalMaterial.opacity : 1.0;
    side = originalMaterial.side !== undefined ? originalMaterial.side : THREE.FrontSide;
    
    const shadowDark = config.shadowDarkness !== undefined ? config.shadowDarkness : 120;
    const satBoost = config.saturationBoost || 1.0;
    
    const toonMaterial = new THREE.MeshToonMaterial({
        color: baseColor,
        map: mainTexture,
        gradientMap: createToonGradientMap(shadowDark),
        side: side,
        transparent: transparent,
        opacity: opacity,
        alphaTest: alphaTest,
    });
    
    if (alphaMap) {
        toonMaterial.alphaMap = alphaMap;
    }
    
    // Inject saturation adjustment into the shader
    if (satBoost !== 1.0) {
        toonMaterial.onBeforeCompile = (shader) => {
            shader.uniforms.saturationBoost = { value: satBoost };
            
            // Add uniform declaration
            shader.fragmentShader = 'uniform float saturationBoost;\n' + shader.fragmentShader;
            
            // Inject saturation adjustment before final output
            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <dithering_fragment>',
                `
                // Saturation boost
                float gray = dot(gl_FragColor.rgb, vec3(0.299, 0.587, 0.114));
                gl_FragColor.rgb = mix(vec3(gray), gl_FragColor.rgb, saturationBoost);
                
                #include <dithering_fragment>
                `
            );
        };
        // Needed for onBeforeCompile to take effect on each instance
        toonMaterial.customProgramCacheKey = () => `toon_sat_${satBoost}`;
    }
    
    return toonMaterial;
}

// Check if a mesh/material should be skipped for toon shading
function shouldSkipToonShading(object, material) {
    const name = (object.name || '').toLowerCase();
    const matName = (material.name || '').toLowerCase();
    
    // Skip eyes, face details, and other special parts
    const skipPatterns = [
        'eye', 'iris', 'pupil', 'cornea', 'sclera',
        'highlight', 'reflection', 'glow', 'emission',
        'tear', 'teeth', 'tongue', 'mouth_inside',
        'face_shadow', 'blush', 'cheek'
    ];
    
    for (const pattern of skipPatterns) {
        if (name.includes(pattern) || matName.includes(pattern)) {
            return true;
        }
    }
    
    // Skip emissive materials (often used for eyes) - but only if strongly emissive
    if (material.emissive && material.emissive.getHex() > 0x333333) {
        return true;
    }
    
    return false;
}

function applyToonShading(vrm, config) {
    if (!vrm || !vrm.scene) return;
    
    let appliedCount = 0;
    let skippedCount = 0;
    
    vrm.scene.traverse((object) => {
        if (object.isMesh && object.material) {
            const materials = Array.isArray(object.material) ? object.material : [object.material];
            const newMaterials = [];
            
            materials.forEach((mat, index) => {
                const key = `${object.uuid}_${index}`;
                if (!originalMaterials.has(key)) {
                    originalMaterials.set(key, mat);
                }
                
                // Log material types for debugging
                console.log(`[Toon] Material: ${mat.name || 'unnamed'}, type: ${mat.type}, object: ${object.name}`);
                
                // Skip special materials (eyes, highlights, etc.)
                if (shouldSkipToonShading(object, mat)) {
                    newMaterials.push(mat); // Keep original
                    skippedCount++;
                } else {
                    newMaterials.push(createToonMaterial(mat, config));
                    appliedCount++;
                }
            });
            
            object.material = newMaterials.length === 1 ? newMaterials[0] : newMaterials;
        }
    });
    
    console.log(`[Renderer] Toon shading applied to ${appliedCount} materials (skipped ${skippedCount}), shadowDarkness=${config.shadowDarkness}, saturationBoost=${config.saturationBoost}`);
}

function removeToonShading(vrm) {
    if (!vrm || !vrm.scene) return;
    
    vrm.scene.traverse((object) => {
        if (object.isMesh && object.material) {
            const materials = Array.isArray(object.material) ? object.material : [object.material];
            const restoredMaterials = [];
            
            materials.forEach((mat, index) => {
                const key = `${object.uuid}_${index}`;
                if (originalMaterials.has(key)) {
                    restoredMaterials.push(originalMaterials.get(key));
                } else {
                    restoredMaterials.push(mat);
                }
            });
            
            object.material = restoredMaterials.length === 1 ? restoredMaterials[0] : restoredMaterials;
        }
    });
    
    console.log('[Renderer] Toon shading removed');
}

// Update lighting based on config
function updateLighting(config) {
    if (config.lightIntensity !== undefined) {
        light.intensity = config.lightIntensity;
    }
    if (config.ambientIntensity !== undefined) {
        ambientLight.intensity = config.ambientIntensity;
    }
    if (config.lightX !== undefined || config.lightY !== undefined || config.lightZ !== undefined) {
        const x = config.lightX !== undefined ? config.lightX : 1.0;
        const y = config.lightY !== undefined ? config.lightY : 1.0;
        const z = config.lightZ !== undefined ? config.lightZ : 1.0;
        light.position.set(x, y, z).normalize();
    }
}

// Main function to update all shading settings
function updateShading(config) {
    if (!config) return;
    
    const newConfig = { ...currentShadingConfig, ...config };
    const modeChanged = newConfig.mode !== currentShadingMode;
    
    // Check if toon-specific settings changed (compare BEFORE updating currentShadingConfig)
    const settingsChanged = (
        newConfig.shadowDarkness !== currentShadingConfig.shadowDarkness ||
        newConfig.saturationBoost !== currentShadingConfig.saturationBoost
    );
    
    console.log('[Shading] Update:', {
        mode: newConfig.mode,
        modeChanged,
        settingsChanged,
        shadowDarkness: newConfig.shadowDarkness,
        saturationBoost: newConfig.saturationBoost,
        hasVrm: !!currentVrm
    });
    
    // Always update lighting first
    updateLighting(newConfig);
    
    // Handle mode changes
    if (modeChanged) {
        console.log('[Shading] Mode changed to:', newConfig.mode);
        currentShadingMode = newConfig.mode;
        currentShadingConfig = newConfig;
        
        if (currentVrm) {
            if (newConfig.mode === 'toon') {
                applyToonShading(currentVrm, newConfig);
            } else {
                removeToonShading(currentVrm);
            }
        }
    } else if (settingsChanged && currentShadingMode === 'toon' && currentVrm) {
        // Re-apply toon shading with new settings
        console.log('[Shading] Toon settings changed, re-applying...');
        currentShadingConfig = newConfig;
        removeToonShading(currentVrm);
        applyToonShading(currentVrm, newConfig);
    } else {
        currentShadingConfig = newConfig;
    }
}

// VRM
let currentVrm = undefined;
let mixer = undefined;
let lastLoadedPath = '';
let baseRotation = new THREE.Euler();
let proceduralAnimator = new ProceduralAnimator(); // Initialize Animator

let currentConfig = {
    scale: 1.0,
    position: { x: 0, y: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    lookAtCursor: false,
    eyeTrackingSensitivity: 0.1,
    randomLookRadius: 5.0
};
let currentIdleAction = undefined;
let lookAtTarget = new THREE.Object3D();
scene.add(lookAtTarget);

const IDLE_ANIMATIONS = [
    '/animations/Idle.fbx',
    '/animations/Idle2.fbx', // The sequel is never as good as the original
    '/animations/Idle3.fbx',
    // '/animations/Thinking.fbx', // Thinking hurts. Disable for now.
];
const THINKING_ANIMATION_URL = '/animations/Thinking.fbx';
let isThinking = false;

// --- Audio System ---
const audioQueue = [];
let isPlayingAudio = false;
let currentAudio = null;

// Lip Sync
let audioContext = null;
let analyser = null;
let dataArray = null;

function initAudioContext() {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)({
            latencyHint: 'interactive',  // Lower latency
            sampleRate: 44100  // Standard sample rate
        });
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 128;  // Reduced from 256 - faster FFT
        analyser.smoothingTimeConstant = 0.5;  // Faster response
        const bufferLength = analyser.frequencyBinCount;
        dataArray = new Uint8Array(bufferLength);
    }
    if (audioContext.state === 'suspended') {
        audioContext.resume();
    }
}


function queueAudio(item) {
    // Determine if item is string or object
    if (typeof item === 'string') {
        audioQueue.push({ path: item });
    } else {
        audioQueue.push(item);
    }
    processAudioQueue();
}

function processAudioQueue() {
    console.log('[Audio] Processing queue, length:', audioQueue.length, 'isPlaying:', isPlayingAudio);
    if (isPlayingAudio || audioQueue.length === 0) return;

    const item = audioQueue.shift();
    const path = item.path;
    let text = item.text;
    
    console.log('[Audio] Playing:', path);
    
    // Parse tags for Procedural Animation if enabled
    if (currentConfig.expressiveAnimation) {
        // Trigger animations immediately (or maybe timed?)
        // For now, trigger immediately before speech starts.
        text = proceduralAnimator.parseAndTrigger(text);
    }
    
    isPlayingAudio = true;

    // Handle URL type (http vs file)
    let src = path;
    if (!path.startsWith('http')) {
        src = `file://${path}`;
    }

    if (currentAudio) {
        currentAudio.pause();
        currentAudio = null;
    }

    currentAudio = new Audio(src);
    currentAudio.preload = "auto"; // Ensure buffering starts immediately
    currentAudio.crossOrigin = "anonymous"; // Enable CORs for analyze
    currentAudio.volume = 1.0; 
    
    console.log('[Audio] Created Audio element for:', src);

    // Hook Analyser - wrap in try/catch to not block playback
    let audioSourceConnected = false;
    try {
        initAudioContext();
        // Only create source if not already created for this element
        if (!currentAudio._sourceCreated) {
            const source = audioContext.createMediaElementSource(currentAudio);
            source.connect(analyser);
            analyser.connect(audioContext.destination);
            currentAudio._sourceCreated = true;
            audioSourceConnected = true;
        }
    } catch (e) {
        console.error("Audio Context Error (non-fatal):", e);
        // Continue without analyser - audio will still play through default output
    }

    // Subscribe to 'playing' event to show text EXACTLY when sound starts
    // Use { once: true } to prevent re-triggering if buffering happens
    currentAudio.addEventListener('playing', () => {
        console.log('[Audio] Playing event fired');
        if (text) {
            showDialogue(text, false, true, 'ai');
        }
    }, { once: true });
    
    currentAudio.addEventListener('canplay', () => {
        console.log('[Audio] Can play - ready to start');
    }, { once: true });
    
    currentAudio.onended = () => {
        console.log('[Audio] Ended');
        // Audio finished: Hide subtitle
        if (subtitleBox) subtitleBox.style.display = 'none';
        
        isPlayingAudio = false;
        currentAudio = null;
        processAudioQueue();
    };
    
    currentAudio.onerror = (e) => {
        console.error("Audio playback error", e);
        // Audio failed: Hide subtitle
        if (subtitleBox) subtitleBox.style.display = 'none';
        
        isPlayingAudio = false;
        currentAudio = null; // Clean up
        processAudioQueue(); // Move to next
    };

    currentAudio.play().catch(e => {
        console.error("Audio play failed:", e);
        isPlayingAudio = false;
        currentAudio = null;
        processAudioQueue();
    });
}


const loadedActions = {}; // Cache loaded actions
let activeAction = null;
let nextIdleSwitchTime = 0;

// --- Random Look State ---
let headLookState = { yaw: 0, pitch: 0 }; // Decoupled state for smoothing
let currentRandomLookOffset = new THREE.Vector3(0, 0, 2.0); // Local offset state
let nextRandomLookTime = 0;

// --- Dragging State ---
let isDragging = false;
window.addEventListener('mousedown', (e) => {
    if (e.button === 0 && !currentConfig.clickThrough) {
        isDragging = true;
    }
});
window.addEventListener('mouseup', () => isDragging = false);

// --- Mouse Tracking & Random Look ---
window.addEventListener('mousemove', (event) => {
    // Handle Window Dragging
    if (isDragging && !currentConfig.clickThrough) {
        if (window.electron && window.electron.moveWindow) {
            window.electron.moveWindow(event.movementX, event.movementY);
        }
    }

    if (!currentConfig.lookAtCursor) return;

    // Normalize mouse position to -1 to 1 range
    // but we need world coordinates.
    const x = (event.clientX / window.innerWidth) * 2 - 1;
    const y = -(event.clientY / window.innerHeight) * 2 + 1;

    if (lookAtTarget && currentConfig.eyeTrackingSensitivity) {
         // simple scaling
         const sensitivity = currentConfig.eyeTrackingSensitivity * 5.0; // multiplier
         // Use NECK position as base height for neutral look direction
         const neckNode = currentVrm?.humanoid?.getNormalizedBoneNode('neck');
         let baseHeight = 1.3;
         if (neckNode) {
             const worldPos = new THREE.Vector3();
             neckNode.getWorldPosition(worldPos);
             baseHeight = worldPos.y; // Match neck height exactly for 0 pitch
         }
         
         lookAtTarget.position.x = x * sensitivity;
         lookAtTarget.position.y = baseHeight + (y * sensitivity); 
         lookAtTarget.position.z = 2.0; // distance in front
    }
});

function updateLookAt(delta) {
    if (!currentVrm) return;

    // 1. Mouse Tracking Mode
    // The 'mousemove' event updates lookAtTarget.position directly in World Space.
    // However, if we move the character, we might want to keep the target "Relative to screen" (which is what coordinate 0,0 is).
    // Current logic in mousemove handles World Space placement.

    // 2. Random Look Mode
    if (!currentConfig.lookAtCursor) {
        
        // Timer Logic: Pick new RELATIVE target
        if (clock.elapsedTime > nextRandomLookTime) {
            const radius = currentConfig.randomLookRadius || 5.0;
            const x = (Math.random() - 0.5) * 2.0 * radius * 0.1;
            const y = (Math.random() - 0.5) * 2.0 * radius * 0.1; 
            
            // Choose Forward direction based on VRM version
            const isVRM0 = currentVrm.meta?.metaVersion === '0';
            const z = isVRM0 ? -2.0 : 2.0;

            // Simple deviation from "Straight Ahead"
            // Use Neck height (approx 1.3) relative to feet (0)
            currentRandomLookOffset.set(x, 1.3 + y, z);

            const intervalMin = currentConfig.randomLookInterval?.min || 1.0;
            const intervalMax = currentConfig.randomLookInterval?.max || 4.0;
            nextRandomLookTime = clock.elapsedTime + intervalMin + Math.random() * (intervalMax - intervalMin);
        }

        // EVERY FRAME: Apply Relative Offset to Current Model Transform
        // Result = ModelPosition + (ModelRotation * Offset)
        const targetWorld = currentRandomLookOffset.clone();
        targetWorld.applyMatrix4(currentVrm.scene.matrixWorld);
        
        // Dampen the movement of the actual target object for smoothness
        const damp = (current, target, lambda, dt) => THREE.MathUtils.damp(current, target, lambda, dt);
        lookAtTarget.position.x = damp(lookAtTarget.position.x, targetWorld.x, 5.0, delta);
        lookAtTarget.position.y = damp(lookAtTarget.position.y, targetWorld.y, 5.0, delta);
        lookAtTarget.position.z = damp(lookAtTarget.position.z, targetWorld.z, 5.0, delta);
    }
}


// --- Loader ---
const loader = new GLTFLoader();
loader.register((parser) => {
  return new VRMLoaderPlugin(parser);
});

function loadVRM(url) {
  if (!url) return;
  
  let finalUrl = url;
  // Handle Windows Absolute Paths if passed directly (Draging & Dropping files)
  if (!finalUrl.startsWith('http') && !finalUrl.startsWith('file://')) {
       // If it has a drive letter or starts with double backslash
       if (/^[a-zA-Z]:/.test(finalUrl) || finalUrl.startsWith('\\\\')) {
           finalUrl = `file://${finalUrl.replace(/\\/g, '/')}`;
       }
  }

  console.log(`[Renderer] Loading VRM: ${finalUrl}`);

  loader.load(
    finalUrl,
    (gltf) => {
      const vrm = gltf.userData.vrm;
      
      VRMUtils.rotateVRM0(vrm);
      baseRotation.copy(vrm.scene.rotation);

      if (currentVrm) {
        scene.remove(currentVrm.scene);
        VRMUtils.deepDispose(currentVrm.scene);
      }

      currentVrm = vrm;
      scene.add(vrm.scene);
      
      // Apply shading based on current config
      if (currentShadingMode === 'toon') {
          applyToonShading(vrm, currentShadingConfig);
      }
      
      mixer = new THREE.AnimationMixer(currentVrm.scene);
      mixer.addEventListener('finished', onAnimationFinished);
      
      if (vrm.lookAt) {
        vrm.lookAt.target = lookAtTarget;
      }
      
      // Pass VRM to procedural animator
      proceduralAnimator.setVRM(currentVrm);

      updateModelTransform();
      preloadIdleAnimations(); // Start loading all idles
      console.log('Hana VRM loaded');
    },
    undefined,
    (error) => console.error('Failed to load VRM', error)
  );
}

function updateModelTransform() {
    if (!currentVrm) return;
    const config = currentConfig;
    
    if (config.scale) currentVrm.scene.scale.setScalar(config.scale);
    if (config.position) {
        currentVrm.scene.position.x = config.position.x || 0;
        currentVrm.scene.position.y = (config.position.y || 0) - 1.0;
    }
}

function preloadIdleAnimations() {
    if (!currentVrm) return;
    
    // Load all defined idle animations
    IDLE_ANIMATIONS.forEach(url => {
        loadMixamoAnimation(url, currentVrm).then(clip => {
            const action = mixer.clipAction(clip);
            loadedActions[url] = action;
            
            // If this is the first one (Main Idle), play it immediately
            if (url === IDLE_ANIMATIONS[0] && !activeAction) {
                activeAction = action;
                action.play();
                // Schedule next switch
                scheduleNextIdle();
            }
        }).catch(e => console.error(`Failed to load ${url}`, e));
    });
}

function scheduleNextIdle() {
    // Switch every 10-20 seconds
    nextIdleSwitchTime = clock.elapsedTime + 10 + Math.random() * 10;
}

function onAnimationFinished(e) {
    const action = e.action;
    const mainIdleUrl = IDLE_ANIMATIONS[0];
    const mainAction = loadedActions[mainIdleUrl];

    // If a special animation finished, go back to main idle
    if (action !== mainAction && mainAction) {
         mainAction.reset();
         mainAction.play();
         // Crossfade back to idle
         if (activeAction) activeAction.crossFadeTo(mainAction, 0.5, true);
         activeAction = mainAction;
         scheduleNextIdle(); // Restart timer
         console.log("Returned to Main Idle");
    }
}

function updateIdleAnimation() {
    if (!mixer || !activeAction || isThinking) return;

    // Only switch if we are currently playing the Main Idle (index 0)
    const mainIdleUrl = IDLE_ANIMATIONS[0];
    const mainIdleAction = loadedActions[mainIdleUrl];
    
    // If we're not playing main idle, don't interrupt
    if (activeAction !== mainIdleAction) return;

    if (clock.elapsedTime > nextIdleSwitchTime) {
        // Pick a random animation different from current (which is Main Idle)
        const available = IDLE_ANIMATIONS.filter(url => loadedActions[url] && url !== mainIdleUrl);
        if (available.length === 0) return;

        const nextUrl = available[Math.floor(Math.random() * available.length)];
        const nextAction = loadedActions[nextUrl];

        // Crossfade
        if (nextAction) {
            nextAction.reset();
            nextAction.setLoop(THREE.LoopOnce); 
            nextAction.clampWhenFinished = true;
            nextAction.play();
            
            activeAction.crossFadeTo(nextAction, 0.5, true); 
            activeAction = nextAction;
            // Note: We do NOT scheduleNextIdle here. We wait for this one to finish.
            console.log("Triggering special idle:", nextUrl);
        }
    }
}

// --- Head Tracking Logic ---
function updateHeadTracking(delta) {
    if (!currentVrm || !lookAtTarget) return;

    // Use normalized bones if possible for consistent axis
    const neck = currentVrm.humanoid.getNormalizedBoneNode('neck');
    const spine = currentVrm.humanoid.getNormalizedBoneNode('spine'); // or upperChest

    if (!neck && !spine) return;

    // Reuse cached vectors to avoid GC
    _tempVec3.copy(lookAtTarget.position);
    _tempMatrix4.copy(currentVrm.scene.matrixWorld).invert();
    const localTarget = _tempVec3.applyMatrix4(_tempMatrix4);
    
    // Get bone position relative to Model Root
    const boneNode = neck || spine;
    boneNode.getWorldPosition(_tempVec3B);
    const boneLocalPos = _tempVec3B.applyMatrix4(_tempMatrix4);

    // Calculate direction vector from Bone to Target in Model Space
    const deltaPos = _tempVec3.sub(boneLocalPos);

    let yaw, pitch;
    // VRM 0.0 faces -Z, VRM 1.0 faces +Z
    const isVRM0 = currentVrm.meta?.metaVersion === '0';

    if (isVRM0) {
        yaw = Math.atan2(-deltaPos.x, -deltaPos.z);
        pitch = Math.atan2(deltaPos.y, -deltaPos.z);
    } else {
        yaw = Math.atan2(deltaPos.x, deltaPos.z);
        pitch = Math.atan2(-deltaPos.y, deltaPos.z);
    }

    const limit = THREE.MathUtils.degToRad(50); // Increased slightly
    const clamp = (val, min, max) => Math.max(min, Math.min(max, val));
    
    // dampen target values
    const targetYaw = clamp(yaw, -limit, limit);
    const targetPitch = clamp(pitch, -limit, limit);

    const damp = (current, target, lambda, dt) => THREE.MathUtils.damp(current, target, lambda, dt);
    const speed = 5.0; // Slower response to allow eye movement to lead

    // Smooth state
    headLookState.yaw = damp(headLookState.yaw, targetYaw, speed, delta);
    headLookState.pitch = damp(headLookState.pitch, targetPitch, speed, delta);

    // Apply rotation (distribute between neck and spine)
    // Coefficents reduced to 0.6 total (from 0.8) to ensure eyes have to rotate significantly to face target
    if (neck) {
        neck.rotation.y += headLookState.yaw * 0.4;
        neck.rotation.x += headLookState.pitch * 0.4;
    }
    if (spine) {
        spine.rotation.y += headLookState.yaw * 0.2;
        spine.rotation.x += headLookState.pitch * 0.2;
    }
}


function startThinking() {
    if (isThinking) return;
    console.log("Starting Thinking Animation");
    isThinking = true;

    // Load if not loaded
    if (!loadedActions[THINKING_ANIMATION_URL]) {
        loadMixamoAnimation(THINKING_ANIMATION_URL, currentVrm).then(clip => {
            const action = mixer.clipAction(clip);
            loadedActions[THINKING_ANIMATION_URL] = action;
            if (isThinking) playThinkingAction(action);
        }).catch(err => {
            console.error("Failed to load thinking animation", err);
            isThinking = false; // Fallback
        });
    } else {
        playThinkingAction(loadedActions[THINKING_ANIMATION_URL]);
    }
}

function playThinkingAction(action) {
    if (!action) return;
    action.reset();
    action.setLoop(THREE.LoopRepeat);
    action.clampWhenFinished = false;
    action.play();

    if (activeAction) {
        activeAction.crossFadeTo(action, 0.5, true);
    }
    activeAction = action;
}

function stopThinking() {
    if (!isThinking) return;
    console.log("Stopping Thinking Animation");
    isThinking = false;

    // Return to Main Idle
    const mainIdleUrl = IDLE_ANIMATIONS[0];
    const mainAction = loadedActions[mainIdleUrl];
    
    if (mainAction && activeAction !== mainAction) {
        mainAction.reset();
        mainAction.play();
        if (activeAction) activeAction.crossFadeTo(mainAction, 0.5, true);
        activeAction = mainAction;
        scheduleNextIdle();
    }
}

// Lip sync update throttle
let lastLipSyncUpdate = 0;
const LIP_SYNC_INTERVAL = 1000 / 30; // 30 FPS for lip sync is plenty

function updateLipSync() {
    if (!currentVrm || !currentVrm.expressionManager) return;
    
    // Throttle lip sync updates
    const now = performance.now();
    if (now - lastLipSyncUpdate < LIP_SYNC_INTERVAL) return;
    lastLipSyncUpdate = now;

    let openness = 0;

    if (isPlayingAudio && analyser && dataArray) {
        analyser.getByteFrequencyData(dataArray);
        
        // Calculate volume average - optimized loop
        let sum = 0;
        const len = dataArray.length;
        for(let i = 0; i < len; i++) {
            sum += dataArray[i];
        }
        const average = sum / len;
        
        const sensitivity = currentConfig.lipSyncSensitivity || 3.0; 
        openness = Math.min(1.0, (average / 255.0) * sensitivity);
        
        if (openness < 0.05) openness = 0;
    }

    currentVrm.expressionManager.setValue('aa', openness);
}

// --- Blink State ---
let isBlinking = false;
let blinkClosing = true;
let blinkWeight = 0.0;
let nextBlinkTime = Math.random() * 3.0 + 1.0; 

function updateBlink(delta) {
    if (!currentVrm || !currentVrm.expressionManager) return;

    if (!isBlinking) {
        if (clock.elapsedTime > nextBlinkTime) {
            isBlinking = true;
            blinkClosing = true;
        }
    } else {
        const blinkSpeed = 15.0; // Fast blink
        if (blinkClosing) {
            blinkWeight += blinkSpeed * delta;
            if (blinkWeight >= 1.0) {
                blinkWeight = 1.0;
                blinkClosing = false;
            }
        } else {
            blinkWeight -= blinkSpeed * delta;
            if (blinkWeight <= 0.0) {
                blinkWeight = 0.0;
                isBlinking = false;
                nextBlinkTime = clock.elapsedTime + 1.0 + Math.random() * 5.0; // Random interval 1-6s
            }
        }
        currentVrm.expressionManager.setValue('blink', blinkWeight);
    }
}

// --- Animation Loop ---
// Removed 'blink', 'blinkLeft', 'blinkRight' from presets so we can handle them manually
const emotionPresets = ['happy', 'angry', 'sad', 'relaxed', 'surprised', 'aa', 'ih', 'ou', 'ee', 'oh', 'lookUp', 'lookDown', 'lookLeft', 'lookRight'];
let currentExpressionTarget = 'neutral';
let expressionResetTimer = null;

function updateExpressions(delta) {
    if (!currentVrm || !currentVrm.expressionManager) return;
    
    const speed = 5.0; // Smoothing speed
    
    emotionPresets.forEach(name => {
        // If target is 'neutral', all specific emotions should go to 0.0
        // If target is 'happy', 'happy' goes to 1.0, others to 0.0
        const isTarget = (name === currentExpressionTarget);
        const targetWeight = isTarget ? 1.0 : 0.0;

        const currentWeight = currentVrm.expressionManager.getValue(name);
        
        // Skip if not supported by model
        if (currentWeight === null || currentWeight === undefined) return;

        const nextWeight = THREE.MathUtils.damp(currentWeight, targetWeight, speed, delta);
        
        currentVrm.expressionManager.setValue(name, nextWeight);
    });
    
    currentVrm.expressionManager.update();
}

// Optimization: Adaptive Frame Rate Limiter
// Target configurable FPS when active, drop to 30 FPS when idle (no animation/audio)
let targetFps = 60;
let frameDelta = 0;
let isIdleMode = false;
let idleTimeout = null;

function getFrameInterval() {
    const fps = isIdleMode ? 30 : (currentConfig.targetFps || targetFps);
    return 1 / fps;
}

// Track activity for adaptive FPS
function setActiveMode() {
    if (isIdleMode) {
        isIdleMode = false;
    }
    // Reset idle timer
    if (idleTimeout) clearTimeout(idleTimeout);
    idleTimeout = setTimeout(() => {
        isIdleMode = true;
    }, 5000); // 5 seconds of no activity
}

function animate() {
  requestAnimationFrame(animate);

  const delta = clock.getDelta();
  frameDelta += delta;

  const frameInterval = getFrameInterval();

  // Skip frame if we are too fast
  if (frameDelta < frameInterval) return;

  // Cap delta to prevent explosion after long pauses
  const timeStep = Math.min(frameDelta, 0.1); 
  frameDelta = frameDelta % frameInterval; // Carry over remainder

  // Only update mixer if animation is playing
  if (mixer) mixer.update(timeStep);
  
  // Skip expensive updates if idle and not looking at cursor
  if (!isIdleMode || currentConfig.lookAtCursor) {
      updateLookAt(timeStep); // Updates the Target position
      updateHeadTracking(timeStep); // Rotates bones to face Target
  }
  
  updateIdleAnimation(); // Manages animation state
  
  // Reduce expression update frequency when idle
  if (!isIdleMode || frameDelta < 0.05) {
      updateExpressions(timeStep); // Smooth expression transitions
  }
  
  updateBlink(timeStep); // Handle Blinking
  
  // Only update lip sync when playing audio
  if (isPlayingAudio) {
      updateLipSync(); // Update mouth based on audio
      setActiveMode(); // Keep active during audio playback
  }
  
  // Apply Procedural Animation Layer
  if (proceduralAnimator.activeGestures.length > 0) {
      proceduralAnimator.update(timeStep);
      setActiveMode();
  }

  if (currentVrm) {
      if (currentConfig.rotation) {
          currentVrm.scene.rotation.x = baseRotation.x + (currentConfig.rotation.x || 0);
          currentVrm.scene.rotation.y = baseRotation.y + (currentConfig.rotation.y || 0);
          currentVrm.scene.rotation.z = baseRotation.z + (currentConfig.rotation.z || 0);
      }
      currentVrm.update(timeStep);
  }
  renderer.render(scene, camera);
}
animate();


// --- Dialogue System ---
const subtitleBox = document.getElementById('subtitle-box');
let dialogueTimeout = null;
let currentSubtitleSource = null; // 'ai', 'user', 'preview'

function applySubtitleStyles() {
    if (!subtitleBox) return;
    const subtitleConfig = currentConfig.subtitle || {};
    
    // Safety defaults
    const fontSize = subtitleConfig.fontSize || 24;
    const color = subtitleConfig.color || '#ffffff';
    const bgColor = subtitleConfig.backgroundColor || 'rgba(0, 0, 0, 0.7)';
    const bottom = subtitleConfig.bottomOffset !== undefined ? subtitleConfig.bottomOffset : 80;
    const horizontal = subtitleConfig.horizontalPosition !== undefined ? subtitleConfig.horizontalPosition : 50;
    const borderRadius = subtitleConfig.borderRadius || 10;
    const padding = subtitleConfig.padding || 20;
    const boxWidth = subtitleConfig.maxWidth || 80;

    subtitleBox.style.position = 'absolute'; // Ensure positioning works
    subtitleBox.style.marginTop = '0'; // Remove default margin if interfering
    subtitleBox.style.marginBottom = '0'; 
    
    subtitleBox.style.fontSize = `${fontSize}px`;
    subtitleBox.style.color = color;
    subtitleBox.style.backgroundColor = bgColor;
    subtitleBox.style.bottom = `${bottom}px`;
    subtitleBox.style.borderRadius = `${borderRadius}px`;
    subtitleBox.style.padding = `${padding}px`;
    subtitleBox.style.width = `${boxWidth}%`;
    subtitleBox.style.maxWidth = '100%';
    subtitleBox.style.left = `${horizontal}%`;
    subtitleBox.style.transform = 'translateX(-50%)'; 
    subtitleBox.style.textAlign = 'center';
    subtitleBox.style.zIndex = '9999'; // Ensure it's on top of everything
    subtitleBox.style.pointerEvents = 'none'; // Click-through
}

function showDialogue(text, isUser = false, persistent = false, source = 'ai') {
    if (!subtitleBox) return;
    
    console.log(`[Dialogue] Showing (${source}):`, text);

    currentSubtitleSource = source;

    // Reset previous
    if (dialogueTimeout) clearTimeout(dialogueTimeout);
    dialogueTimeout = null;

    subtitleBox.innerHTML = '';
    subtitleBox.style.display = 'block';

    applySubtitleStyles(); // Apply current styles
    
    // Style differently for User/AI
    subtitleBox.style.borderColor = isUser ? 'rgba(100, 200, 255, 0.5)' : 'rgba(255, 255, 255, 0.1)';

    const words = text.split(' ');
    let delay = 0;
    
    words.forEach((word) => {
        const span = document.createElement('span');
        span.textContent = word + ' ';
        span.style.opacity = '0';
        span.style.transition = 'opacity 0.2s ease-in';
        subtitleBox.appendChild(span);
        
        // Stagger fade in
        setTimeout(() => {
            span.style.opacity = '1';
        }, delay);
        delay += (currentConfig.dialogueSpeed || 50);
    });

    if (!persistent) {
        // Auto-hide after reasonable time (based on length)
        const duration = delay + 3000 + (words.length * 200);
        dialogueTimeout = setTimeout(() => {
            subtitleBox.style.display = 'none';
        }, duration);
    }
}

// --- WebSocket ---
const ws = new WebSocket('ws://localhost:3000');
ws.onopen = () => console.log('Connected to Hana Core');
ws.onerror = (e) => console.error('WebSocket Error:', e);
ws.onclose = () => console.warn('WebSocket closed - attempting reconnect...');
ws.onmessage = (event) => {
    const command = JSON.parse(event.data);
    console.log('[WS] Received:', command.type, command.subtype || '');
    
    if (command.type === 'config-update') {
        const config = command.payload;
        currentConfig = { ...currentConfig, ...config };
        
        // Update visible subtitle if any
        if (subtitleBox.style.display === 'block') {
            applySubtitleStyles();
        }

        if (config.vrmPath && config.vrmPath !== lastLoadedPath) {
            lastLoadedPath = config.vrmPath;
            loadVRM(config.vrmPath);
        }

        updateModelTransform();
        
        // Handle shading config updates
        if (config.shading) {
            console.log('[Renderer] Shading config update:', config.shading);
            updateShading(config.shading);
        }
        
        if (config.showBorder !== undefined) {
             document.body.style.border = config.showBorder ? '2px dashed #ff3333' : 'none';
        }

        if (config.clickThrough !== undefined) {
             // We handle dragging manually now via JS events, so we don't set webkitAppRegion
             // forcing 'drag' region breaks mousemove events (eye tracking).
             // We only rely on setIgnoreMouseEvents (handled in main.js) for pass-through.
        }
    } else if (command.type === 'ai-event') {
        const { subtype, payload } = command;
        if (subtype === 'transcription') {
            startThinking(); // Start animation
            showDialogue(payload.text, true, false, 'user'); // User text
        } else if (subtype === 'ai:response') {
            // Only show immediately if TTS is NOT enabled.
            // If TTS is enabled, we wait for 'tts:audio' to sync the text.
            const ttsEnabled = currentConfig.tts && currentConfig.tts.enabled;
            if (!ttsEnabled) {
                stopThinking(); // Stop if no audio coming
                showDialogue(payload.text, false, false, 'ai'); 
            }
        } else if (subtype === 'status') {
            console.log("AI Status:", payload.text);
            if (payload.text.includes("Initializing") || payload.text.includes("Error")) {
                 showDialogue(`[System: ${payload.text}]`, false, false, 'system');
                 stopThinking(); // Stop on error/status
            }
        } else if (subtype === 'error') {
            console.error("AI Error:", payload.text);
            stopThinking();
            showDialogue(`[Error: ${payload.text}]`, false, false, 'error');
        } else if (subtype === 'tts:audio') {
            // Deprecated path, handled below strictly
        }
    } else if (command.type === 'tts:audio') {
        stopThinking(); // Audio received, stop thinking
        const { result, text } = command.payload;
        console.log('[TTS] Audio received:', result, 'Text:', text?.substring(0, 50));
        if (result) {
            console.log("Queueing TTS Audio:", result);
            // Pass text to queue mechanism for sync
            queueAudio({ path: result, text: text });
        }
    } else if (command.type === 'ptt-status') {
        const { active } = command.payload;
        const recIndicator = document.getElementById('rec-indicator');
        if (recIndicator) {
             recIndicator.style.display = active ? 'flex' : 'none';
             if (active) {
                // Find text node to update to "Listening..."
                let foundText = false;
                recIndicator.childNodes.forEach(n => {
                    if (n.nodeType === 3 && n.textContent.trim().length > 0) {
                        n.textContent = " Listening..."; // Add leading space for spacing
                        foundText = true;
                    }
                });
                // If no text node found (weird), append it
                if (!foundText) {
                    recIndicator.appendChild(document.createTextNode(" Listening..."));
                }
             }
        }
    } else if (command.type === 'debug-command') {
        if (command.command === 'play-animation') {
            const url = command.value;
            // Load if not loaded
            if (!loadedActions[url]) {
                 loadMixamoAnimation(url, currentVrm).then(clip => {
                    const action = mixer.clipAction(clip);
                    loadedActions[url] = action;
                    playAction(action, url);
                 });
            } else {
                playAction(loadedActions[url], url);
            }
        } else if (command.command === 'set-emotion') {
            setEmotion(command.value);
        } else if (command.command === 'preview-subtitle') {
             // If payload has "persistent: true", we keep it open
             // "preview-subtitle" is our command, command.value is the text
             const isPersistent = command.isPersistent || false;
             
             if (!command.value && !isPersistent) {
                 // Stop preview ONLY if we are currently showing a preview
                 if (currentSubtitleSource === 'preview' && subtitleBox) {
                    subtitleBox.style.display = 'none';
                 }
                 return;
             }

            const previewId = Math.floor(Math.random() * 3);
             const previews = [
                 "Testing subtitles! Does this look okay?",
                 "Here is how your subtitles will appear on screen.",
                 "Adjust the settings until you are happy with the style!"
             ];
             showDialogue(command.value || previews[previewId], false, isPersistent, 'preview');
        }
    }
};

function setEmotion(emotionName) {
    if (!currentVrm || !currentVrm.expressionManager) return;
    
    // Update target for smooth transition
    // If 'none' or invalid, we assume 'neutral'
    currentExpressionTarget = (emotionName === 'none') ? 'neutral' : emotionName;
    
    console.log("Expression target set to:", currentExpressionTarget);

    // Clear existing reset timer
    if (expressionResetTimer) clearTimeout(expressionResetTimer);

    // If it's a non-neutral expression, schedule a reset
    if (currentExpressionTarget !== 'neutral') {
        expressionResetTimer = setTimeout(() => {
            console.log("Auto-resetting expression to neutral");
            currentExpressionTarget = 'neutral';
        }, 3000); // 3 seconds duration
    }
}

function playAction(nextAction, url) {
    // Force LoopOnce for debug actions
    nextAction.setLoop(THREE.LoopOnce); 
    nextAction.clampWhenFinished = true;

    if (!activeAction) {
        activeAction = nextAction;
        activeAction.play();
    } else if (activeAction !== nextAction) {
        nextAction.reset();
        nextAction.play();
        activeAction.crossFadeTo(nextAction, 0.5, true);
        activeAction = nextAction;
    }
    console.log("Debug Playing (LoopOnce):", url);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});



