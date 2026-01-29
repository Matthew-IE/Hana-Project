import * as THREE from 'three';

/**
 * The Neural Face Solver
 * Maps abstract emotional coordinates (Valence/Arousal) to concrete VRM Blendshapes.
 * This simulates a neural network decoding layer.
 */
export class FaceSolver {
    constructor() {
        this.currentMood = new THREE.Vector2(0, 0); // X: Valence, Y: Arousal
        this.targetMood = new THREE.Vector2(0, 0);
        this.smoothing = 0.05; // How fast emotions shift (Neural inertia)
        
        // The Neural Weights Matrix
        // Defines how specific blendshapes react to the V/A coordinate space.
        // Format: { shapeKey: { valence: weight, arousal: weight, bias: offset } }
        // Weights determine how much the blendshape moves per valence/arousal unit.
        // Bias offsets the threshold (negative means it needs more intensity to trigger).
        this.weights = {
            // Smile/Joy: High Valence
            'happy':          { v: 1.0, a: 0.0, bias: 0.0 }, // Using internal VRM preset names
            
            // Sorrow: Low Valence, Low Arousal
            'sad':       { v: -0.8, a: -0.5, bias: -0.2 },
            
            // Anger: Low Valence, High Arousal
            'angry':        { v: -1.0, a: 1.0, bias: 0.0 },
            
            // Surprised/Wide eyes: High Arousal (Positive or Negative)
            // 'surprised':    { v: 0.0, a: 0.8, bias: -0.3 }, // Standard VRM might define this as 'surprised'
            
            // Relaxed: Positive Valence, Low Arousal
            'relaxed':      { v: 0.5, a: -0.5, bias: 0.0 },

            // Neural/Direct shape mappings (Vowel shapes can double as emotion modifiers)
            // 'aa': { v: 0.0, a: 0.2, bias: -0.1 },  // Slight mouth open for surprise/interest
            
            // If the model supports ARKit blendshapes (iPhone tracking standard), 
            // you can add 'browInnerUp', 'eyeSquintLeft', etc here.
        };
    }

    /**
     * Parses the AI tag [Mood: 0.5, 0.8]
     * Returns true if a mood was found and set.
     */
    updateTargetFromTag(text) {
        if (!text) return false;
        
        const regex = /\[Mood:\s*(-?[\d.]+),\s*(-?[\d.]+)\]/i;
        const match = text.match(regex);
        if (match) {
            const v = parseFloat(match[1]);
            const a = parseFloat(match[2]);
            // Clamping to -1 to 1 range
            this.targetMood.set(
                Math.max(-1, Math.min(1, v)),
                Math.max(-1, Math.min(1, a))
            );
            console.log(`[Neural Face] New Target: V=${v}, A=${a}`);
            return true;
        }
        return false;
    }

    update(deltaTime, vrm) {
        if (!vrm || !vrm.expressionManager) return;
        
        // 1. Mood Interpolation (Emotions don't snap, they drift)
        // Lerp towards the target mood state
        this.currentMood.lerp(this.targetMood, this.smoothing * (deltaTime * 60)); // Normalize speed to approx 60fps
        
        const v = this.currentMood.x;
        const a = this.currentMood.y;

        // 2. Resolve Blendshapes (The "Hidden Layer")
        const manager = vrm.expressionManager;
        
        for (const [shapeName, weight] of Object.entries(this.weights)) {
            // Neural Activation Function: linear with clipping
            // Activation = (Valence * WeightV) + (Arousal * WeightA) + Bias
            let activation = (v * weight.v) + (a * weight.a) + weight.bias;
            
            // ReLU (Rectified Linear Unit) - We can't have negative facial muscles
            if (activation < 0) activation = 0;
            if (activation > 1) activation = 1;

            // Apply value if it contributes
            if (activation > 0) {
                 manager.setValue(shapeName, activation);
            }
            // Note: We intentionally don't set to 0 strictly here if another system needs it? 
            // Actually for "ExpressionManager", set value determines the weight. 
            // If we stop setting it, does it persist? 
            // Better to explicitly set based on activation.
            // But we must be careful not to override LipSync (aa/ee/ih/oh/ou) unless we mapped them.
            // Our weights map mostly Preset emotions, so it's safe.
            else {
                // Decay strictly
                // manager.setValue(shapeName, 0); 
                // Wait, if we set 0, we might fight with other systems. 
                // Only controlling specific emotional keys is safer.
                manager.setValue(shapeName, 0); 
            }
        }
    }
}
