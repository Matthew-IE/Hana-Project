import React, { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Mic, Keyboard } from 'lucide-react';

export function VoiceControls({ config, updateConfig, sendCommand, ws, connected }) {
    const [devices, setDevices] = useState([]);
    const [selectedDeviceId, setSelectedDeviceId] = useState("default");
    const [isRecording, setIsRecording] = useState(false);
    const [isListeningForBind, setIsListeningForBind] = useState(false);

    // Request devices when connected (not just on mount)
    useEffect(() => {
        if (connected) {
            sendCommand('voice:get-devices');
        }
    }, [connected, sendCommand]);

    // Listen for WebSocket updates
    useEffect(() => {
        const handleWSMessage = (event) => {
            const data = event.detail;
            if (data.type === 'voice:start') {
                setIsRecording(true);
            } else if (data.type === 'voice:stop') {
                setIsRecording(false);
            } else if (data.type === 'voice:devices') {
                setDevices(data.payload.devices || []);
            }
        };
        
        window.addEventListener('hana-ws-message', handleWSMessage);
        return () => window.removeEventListener('hana-ws-message', handleWSMessage);
    }, []);

    const handleDeviceChange = (val) => {
        setSelectedDeviceId(val);
        if (val !== "default") {
            // God knows why the index needs to be an integer here but a string everywhere else
            sendCommand('voice:set-device', { index: parseInt(val) });
        }
    };

    // Manual PTT Actions
    const startManual = () => sendCommand('voice:start');
    const stopManual = () => sendCommand('voice:stop');

    // --- Keybind Logic for CONFIGURATION only ---
    // We only listen here to UPDATE the config. The ACTUAL detection happens in Python.
    const handleKeyDown = useCallback((e) => {
        if (isListeningForBind) {
            e.preventDefault();
            const key = e.code;
            updateConfig({ pushToTalkKey: key });
            setIsListeningForBind(false);
        }
    }, [isListeningForBind, updateConfig]);

    const handleMouseDown = useCallback((e) => {
        if (isListeningForBind) {
            e.preventDefault();
            const key = `Mouse${e.button}`;
            updateConfig({ pushToTalkKey: key });
            setIsListeningForBind(false);
        }
    }, [isListeningForBind, updateConfig]);

    // Context Menu blocker for Mouse2 bind
    useEffect(() => {
        const handleContext = (e) => {
             if (config.pushToTalkKey === 'Mouse2') e.preventDefault();
        };
        window.addEventListener('contextmenu', handleContext);
        return () => window.removeEventListener('contextmenu', handleContext);
    }, [config.pushToTalkKey]);

    useEffect(() => {
        if (isListeningForBind) {
            window.addEventListener('keydown', handleKeyDown);
            window.addEventListener('mousedown', handleMouseDown);
        } else {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('mousedown', handleMouseDown);
        }
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('mousedown', handleMouseDown);
        }
    }, [isListeningForBind, handleKeyDown, handleMouseDown]);


    return (
        <Card>
            <CardHeader><CardTitle>Voice Settings (Backend Mode)</CardTitle></CardHeader>
            <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                    <Label>Enable Voice</Label>
                    <Switch checked={config.voiceEnabled} onCheckedChange={(c) => {
                        if (!c) {
                            updateConfig({ voiceEnabled: c, pushToTalk: false });
                        } else {
                            updateConfig({ voiceEnabled: c });
                        }
                    }} />
                </div>
                
                <div className="space-y-2">
                    <Label>Input Device (Host System)</Label>
                    <Select onValueChange={handleDeviceChange} value={selectedDeviceId}>
                        <SelectTrigger>
                            <SelectValue placeholder="Select Microphone" />
                        </SelectTrigger>
                        <SelectContent>
                             <SelectItem value="default">Default Device</SelectItem>
                             {devices.map((dev) => (
                                 <SelectItem key={dev.index} value={dev.index.toString()}>
                                     {dev.name} ({dev.hostapi})
                                 </SelectItem>
                             ))}
                        </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">Audio is recorded by the Python background service.</p>
                </div>
                
                 <div className="flex items-center justify-between border-t pt-4">
                    <div className="space-y-1">
                        <Label>Push to Talk Mode</Label>
                        <p className="text-xs text-muted-foreground">Global PTT works even when minimized.</p>
                    </div>
                    <Switch 
                        checked={config.pushToTalk} 
                        onCheckedChange={(c) => updateConfig({ pushToTalk: c })} 
                        disabled={!config.voiceEnabled} 
                    />
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
                        onMouseDown={startManual}
                        onMouseUp={stopManual}
                        onMouseLeave={stopManual} // safety, because users are unpredictable
                        disabled={!config.voiceEnabled} 
                    >
                        <div className="flex flex-col items-center gap-2">
                            <Mic className="w-8 h-8" />
                            <span>{isRecording ? "Transmitting" : "Hold to Talk"}</span>
                        </div>
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}
