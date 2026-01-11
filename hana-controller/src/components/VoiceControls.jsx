import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Mic, Keyboard } from 'lucide-react';

export function VoiceControls({ config, updateConfig, sendCommand, ws }) {
    const [devices, setDevices] = useState([]);
    const [selectedDeviceId, setSelectedDeviceId] = useState("default");
    const [isRecording, setIsRecording] = useState(false);
    const [isListeningForBind, setIsListeningForBind] = useState(false);
    
    const mediaRecorderRef = useRef(null);
    const audioChunksRef = useRef([]);

    useEffect(() => {
        // Fetch devices from Browser API
        navigator.mediaDevices.enumerateDevices().then(devs => {
            const audioInputs = devs.filter(d => d.kind === 'audioinput');
            setDevices(audioInputs);
        });
    }, []);

    const startRecording = async () => {
        if (!config.voiceEnabled || isRecording) return;
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') return;
        
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ 
                audio: { 
                    deviceId: selectedDeviceId !== "default" ? { exact: selectedDeviceId } : undefined 
                } 
            });
            
            mediaRecorderRef.current = new MediaRecorder(stream);
            audioChunksRef.current = [];

            mediaRecorderRef.current.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    audioChunksRef.current.push(event.data);
                }
            };

            mediaRecorderRef.current.onstop = uploadAudio;
            mediaRecorderRef.current.start();
            setIsRecording(true);
            
            // Visual feedback
            sendCommand('voice:status', { listening: true }); 
        } catch (e) {
            console.error("Recording failed", e);
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
            mediaRecorderRef.current.stop();
            setIsRecording(false);
            
            // Stop logic
            mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
            sendCommand('voice:status', { listening: false });
        }
    };

    const uploadAudio = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
        // Upload to Electron Backend
        try {
            await fetch('http://localhost:3000/api/voice/upload', {
                method: 'POST',
                body: audioBlob,
                headers: { 'Content-Type': 'audio/wav' } 
            });
        } catch(e) { console.error("Upload failed", e); }
    };
    
    // --- Keybind Logic ---
    const handleKeyDown = useCallback((e) => {
        if (isListeningForBind) {
            e.preventDefault();
            const key = e.code || e.key;
            updateConfig({ pushToTalkKey: key });
            setIsListeningForBind(false);
            return;
        }

        if (config.pushToTalk && config.pushToTalkKey) {
            const currentKey = config.pushToTalkKey.toLowerCase();
            const pressedKey = (e.code || e.key).toLowerCase();
            
            if (pressedKey === currentKey || e.key.toLowerCase() === currentKey) {
                if (!e.repeat) startRecording();
            }
        }
    }, [config.pushToTalk, config.pushToTalkKey, isListeningForBind, isRecording, updateConfig]);

    const handleKeyUp = useCallback((e) => {
        if (config.pushToTalk && config.pushToTalkKey) {
             const currentKey = config.pushToTalkKey.toLowerCase();
             const pressedKey = (e.code || e.key).toLowerCase();
             
             if (pressedKey === currentKey || e.key.toLowerCase() === currentKey) {
                stopRecording();
            }
        }
    }, [config.pushToTalk, config.pushToTalkKey, isRecording]);

     const handleMouseDown = useCallback((e) => {
        if (isListeningForBind) {
            e.preventDefault();
            // Mouse buttons: 0=Left, 1=Middle, 2=Right, 3=Back, 4=Forward
            const key = `Mouse${e.button}`;
            updateConfig({ pushToTalkKey: key });
            setIsListeningForBind(false);
            return;
        }

        if (config.pushToTalk && config.pushToTalkKey) {
             const key = `Mouse${e.button}`;
             if (key === config.pushToTalkKey) {
                 startRecording();
             }
        }
     }, [config.pushToTalk, config.pushToTalkKey, isListeningForBind, isRecording, updateConfig]);

    const handleMouseUp = useCallback((e) => {
        if (config.pushToTalk && config.pushToTalkKey) {
            const key = `Mouse${e.button}`;
            if (key === config.pushToTalkKey) {
                stopRecording();
            }
        }
    }, [config.pushToTalk, config.pushToTalkKey, isRecording]);


    useEffect(() => {
        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        window.addEventListener('mousedown', handleMouseDown);
        window.addEventListener('mouseup', handleMouseUp);
        // Disable context menu if Right Click is used as bind
        const handleContext = (e) => {
             if (config.pushToTalkKey === 'Mouse2') e.preventDefault();
        };
        window.addEventListener('contextmenu', handleContext);

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
            window.removeEventListener('mousedown', handleMouseDown);
            window.removeEventListener('mouseup', handleMouseUp);
            window.removeEventListener('contextmenu', handleContext);
        };
    }, [handleKeyDown, handleKeyUp, handleMouseDown, handleMouseUp, config.pushToTalkKey]);


    return (
        <Card>
            <CardHeader><CardTitle>Voice Settings</CardTitle></CardHeader>
            <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                    <Label>Enable Voice</Label>
                    <Switch checked={config.voiceEnabled} onCheckedChange={(c) => updateConfig({ voiceEnabled: c })} />
                </div>
                
                <div className="space-y-2">
                    <Label>Input Device</Label>
                    <Select onValueChange={setSelectedDeviceId} value={selectedDeviceId}>
                        <SelectTrigger>
                            <SelectValue placeholder="Select Microphone" />
                        </SelectTrigger>
                        <SelectContent>
                             <SelectItem value="default">Default</SelectItem>
                             {devices.map((dev) => (
                                 <SelectItem key={dev.deviceId} value={dev.deviceId}>
                                     {dev.label || `Microphone ${dev.deviceId.slice(0,5)}`}
                                 </SelectItem>
                             ))}
                        </SelectContent>
                    </Select>
                </div>
                
                 <div className="flex items-center justify-between border-t pt-4">
                    <div className="space-y-1">
                        <Label>Push to Talk Mode</Label>
                        <p className="text-xs text-muted-foreground">If disabled, use the button below manually.</p>
                    </div>
                    <Switch checked={config.pushToTalk} onCheckedChange={(c) => updateConfig({ pushToTalk: c })} />
                </div>

                <div className="flex items-center justify-between">
                     <Label>PTT Keybind</Label>
                     <Button 
                        variant="outline" 
                        className={`w-32 ${isListeningForBind ? 'border-primary text-primary' : ''}`}
                        onClick={() => setIsListeningForBind(true)}
                    >
                        {isListeningForBind ? "Press Any Key..." : (config.pushToTalkKey || "None")}
                         {!isListeningForBind && <Keyboard className="ml-2 w-4 h-4" />}
                     </Button>
                </div>

                <div className="flex justify-center pt-4">
                    <Button 
                        size="lg"
                        className={`w-32 h-32 rounded-full transition-all ${isRecording ? 'scale-110 ring-4 ring-red-500' : ''} ${config.voiceEnabled ? 'hover:scale-105 active:scale-95' : 'opacity-50 cursor-not-allowed'}`}
                        variant={isRecording ? "destructive" : (config.voiceEnabled ? "default" : "outline")}
                        onMouseDown={startRecording}
                        onMouseUp={stopRecording}
                        onMouseLeave={stopRecording} // safety
                        disabled={!config.voiceEnabled || config.pushToTalk} // Disable click if PTT is on (except if we want to allow hybrid)
                    >
                        <div className="flex flex-col items-center gap-2">
                            <Mic className="w-8 h-8" />
                            <span>{isRecording ? "Transmitting" : (config.pushToTalk ? `Hold ${config.pushToTalkKey}` : "Hold to Talk")}</span>
                        </div>
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}
