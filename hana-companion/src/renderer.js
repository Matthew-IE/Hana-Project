import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import { loadMixamoAnimation } from './mixamo.js';

// --- Scene Setup ---
const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();

// Camera
const camera = new THREE.PerspectiveCamera(30, window.innerWidth / window.innerHeight, 0.1, 20.0);
camera.position.set(0.0, 1.0, 5.0);

// Renderer
const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
container.appendChild(renderer.domElement);

// Light
const light = new THREE.DirectionalLight(0xffffff);
light.position.set(1.0, 1.0, 1.0).normalize();
scene.add(light);

// Clock
const clock = new THREE.Clock();

// VRM
let currentVrm = undefined;
let mixer = undefined;
let lastLoadedPath = '';
let baseRotation = new THREE.Euler();
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
    '/animations/Idle2.fbx',
    '/animations/Idle3.fbx',
    // '/animations/Thinking.fbx', // Optional: Add if desired
];
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
  loader.load(
    url,
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
      
      mixer = new THREE.AnimationMixer(currentVrm.scene);
      mixer.addEventListener('finished', onAnimationFinished);
      
      if (vrm.lookAt) {
        vrm.lookAt.target = lookAtTarget;
      }

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
    if (!mixer || !activeAction) return;

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

    const targetWorld = lookAtTarget.position.clone();
    const localTarget = targetWorld.clone().applyMatrix4(currentVrm.scene.matrixWorld.clone().invert());
    
    // Get bone position relative to Model Root
    const boneNode = neck || spine;
    const boneWorldPos = new THREE.Vector3();
    boneNode.getWorldPosition(boneWorldPos);
    const boneLocalPos = boneWorldPos.clone().applyMatrix4(currentVrm.scene.matrixWorld.clone().invert());

    // Calculate direction vector from Bone to Target in Model Space
    const deltaPos = new THREE.Vector3().subVectors(localTarget, boneLocalPos);

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


// --- Animation Loop ---
const emotionPresets = ['happy', 'angry', 'sad', 'relaxed', 'surprised', 'aa', 'ih', 'ou', 'ee', 'oh', 'blink', 'blinkLeft', 'blinkRight', 'lookUp', 'lookDown', 'lookLeft', 'lookRight'];
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

function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();
  if (mixer) mixer.update(delta);
  
  updateLookAt(delta); // Updates the Target position
  updateHeadTracking(delta); // Rotates bones to face Target
  updateIdleAnimation(); // Manages animation state
  updateExpressions(delta); // Smooth expression transitions

  if (currentVrm) {
      if (currentConfig.rotation) {
          currentVrm.scene.rotation.x = baseRotation.x + (currentConfig.rotation.x || 0);
          currentVrm.scene.rotation.y = baseRotation.y + (currentConfig.rotation.y || 0);
          currentVrm.scene.rotation.z = baseRotation.z + (currentConfig.rotation.z || 0);
      }
      currentVrm.update(delta);
  }
  renderer.render(scene, camera);
}
animate();

// --- WebSocket ---
const ws = new WebSocket('ws://localhost:3000');
ws.onopen = () => console.log('Connected to Hana Core');
ws.onmessage = (event) => {
    const command = JSON.parse(event.data);
    
    if (command.type === 'config-update') {
        const config = command.payload;
        currentConfig = { ...currentConfig, ...config };
        
        if (config.vrmPath && config.vrmPath !== lastLoadedPath) {
            lastLoadedPath = config.vrmPath;
            loadVRM(config.vrmPath);
        }
        updateModelTransform();
        
        if (config.showBorder !== undefined) {
             document.body.style.border = config.showBorder ? '2px dashed #ff3333' : 'none';
        }

        if (config.clickThrough !== undefined) {
             // We handle dragging manually now via JS events, so we don't set webkitAppRegion
             // forcing 'drag' region breaks mousemove events (eye tracking).
             // We only rely on setIgnoreMouseEvents (handled in main.js) for pass-through.
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



