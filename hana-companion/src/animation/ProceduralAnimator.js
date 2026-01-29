import * as THREE from 'three';

/**
 * ProceduralAnimator
 * Handles dynamic bone manipulation based on high-level commands.
 * Runs on top of standard tracking and idle animations.
 */
export class ProceduralAnimator {
    constructor() {
        this.vrm = null;
        this.activeGestures = [];
        this.clock = new THREE.Clock();
        
        // Define available gestures and their bone curves
        this.library = {
            'nod': {
                duration: 0.4,
                bones: ['neck'],
                curves: {
                    'neck': (t) => new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.sin(t * Math.PI * 2) * 0.2, 0, 0))
                }
            },
            'shake': {
                duration: 0.5,
                bones: ['neck'],
                curves: {
                    'neck': (t) => new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.sin(t * Math.PI * 4) * 0.15, 0))
                }
            },
            'tilt_question': {
                duration: 1.0,
                bones: ['neck'],
                curves: {
                    'neck': (t) => {
                        // Smooth step to tilt and stay briefly
                        const val = Math.sin(Math.min(t * 2, 1) * Math.PI) * 0.15;
                        return new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -val));
                    }
                }
            },
            'happy_bounce': {
                duration: 0.6,
                bones: ['hips'],
                type: 'position',
                curves: {
                    'hips': (t) => new THREE.Vector3(0, Math.abs(Math.sin(t * Math.PI * 2)) * 0.05, 0)
                }
            },
            'lean_forward': {
                duration: 1.5,
                bones: ['spine'],
                curves: {
                    'spine': (t) => {
                         const val = Math.sin(t * Math.PI) * 0.1;
                         return new THREE.Quaternion().setFromEuler(new THREE.Euler(val, 0, 0));
                    }
                }
            },
            'excited': {
                duration: 1.0,
                bones: ['upperChest', 'neck'],
                curves: {
                    'upperChest': (t) => new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.sin(t * Math.PI * 4) * 0.05, 0)),
                    'neck': (t) => new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.sin(t * Math.PI * 2) * 0.05, 0, 0))
                }
            }
        };
    }

    setVRM(vrm) {
        this.vrm = vrm;
    }

    /**
     * Trigger a gesture by name.
     * @param {string} name - Key from this.library
     */
    play(name) {
        if (!this.vrm || !this.library[name]) return;

        console.log(`[ProceduralAnimator] Playing: ${name}`);
        
        const gesture = {
            name: name,
            data: this.library[name],
            time: 0,
            id: Math.random().toString(36).substr(2, 9)
        };
        
        // Remove existing gestures affecting the same bones to avoid conflict?
        // For now, let's just push and see what chaos ensues (or just simple blending)
        this.activeGestures.push(gesture);
    }

    update(delta) {
        if (!this.vrm || this.activeGestures.length === 0) return;

        // Iterate backwards to allow removal
        for (let i = this.activeGestures.length - 1; i >= 0; i--) {
            const gesture = this.activeGestures[i];
            gesture.time += delta;

            const progress = gesture.time / gesture.data.duration;

            if (progress >= 1.0) {
                this.activeGestures.splice(i, 1);
                continue;
            }

            // Apply bone transforms
            gesture.data.bones.forEach(boneName => {
                const node = this.vrm.humanoid.getNormalizedBoneNode(boneName);
                if (!node) return;

                const curveFn = gesture.data.curves[boneName];
                
                if (gesture.data.type === 'position') {
                    const offset = curveFn(progress);
                    node.position.add(offset); // Additive to current animation
                } else {
                    const rotation = curveFn(progress);
                    node.quaternion.multiply(rotation); // Multiplicative rotation
                }
            });
        }
    }
    
    // Helper to parse text for tags
    parseAndTrigger(text) {
        if (!text) return text;
        
        let cleanText = text;
        const lower = text.toLowerCase();

        // Regex for Explicit Tags [nod]
        const tagRegex = /\[(.*?)\]/g;
        const matches = [...text.matchAll(tagRegex)];
        
        matches.forEach(match => {
            const tag = match[1].toLowerCase();
            // Try to map tag to gesture
            if (this.library[tag]) {
                this.play(tag);
                cleanText = cleanText.replace(match[0], ''); // Remove tag from speech
            } 
            // Also map common emotion words in tags
            else if (tag.includes('laugh') || tag.includes('haha')) this.play('excited');
            else if (tag.includes('question') || tag.includes('?')) this.play('tilt_question');
        });

        // Heuristic analysis (fallback)
        if (cleanText.includes('?')) this.play('tilt_question');
        if (cleanText.includes('!')) this.play('lean_forward');
        if (lower.includes('haha') || lower.includes('lol')) this.play('excited');
        if (lower.includes('yes') || lower.includes('sure')) this.play('nod');
        if (lower.includes('no') || lower.includes('nope')) this.play('shake');

        return cleanText.trim();
    }
}
