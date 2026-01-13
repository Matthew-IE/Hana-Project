import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Slider } from "@/components/ui/slider"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Volume2, Power, RefreshCw, FileAudio, FolderSearch } from 'lucide-react';

export function TTSControls({ config, updateConfig, sendCommand }) {
    const tts = config.tts || {};
    const [availableModels, setAvailableModels] = useState({ gpt: [], sovits: [] });

    useEffect(() => {
        // Initial Scan
        sendCommand('tts:scan-models', { base_path: tts.installPath ? tts.installPath + "/.." : "" });

        const handleMessage = (e) => {
             const data = e.detail;
             if (data.type === 'tts:models') {
                 setAvailableModels(data.payload);
             } else if (data.type === 'ui:pick-file-result') {
                 if (data.requestId === 'ref-audio') {
                     handleChange('refAudioPath', data.path);
                 }
             }
        };
        window.addEventListener('hana-ws-message', handleMessage);
        return () => window.removeEventListener('hana-ws-message', handleMessage);
    }, []);

    const handleChange = (key, value) => {
        updateConfig({
            tts: {
                ...tts,
                [key]: value
            }
        });
    };

    const handleModelLoad = () => {
        // Send command to load weights from the current config paths
        sendCommand('tts:set-weights', {
            gpt_path: tts.selectedGptPath,
            sovits_path: tts.selectedSovitsPath,
            t2s_path: tts.selectedT2sPath // For V2
        });
    };

    const handleLaunch = () => {
        sendCommand('tts:launch', {
            port: 9872, // Default
            executable: tts.installPath
        });
    };

    const handleRestart = () => {
        sendCommand('tts:restart', {
            port: 9872,
            executable: tts.installPath
        });
    };
    
    const handleScan = () => {
        sendCommand('tts:scan-models', { base_path: tts.installPath ? tts.installPath + "/.." : "" });
    };

    const browseAudioFile = () => {
        sendCommand('ui:pick-file', { requestId: 'ref-audio', filters: [{ name: 'Audio', extensions: ['wav', 'mp3', 'ogg'] }] });
    };

    // Helper to get filename from path
    const getFileName = (path) => path ? path.split(/[\\/]/).pop() : "Select a file...";

    return (
        <Card className="w-full">
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Volume2 className="w-5 h-5" />
                    TTS Engine (GPT-SoVITS)
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
                {/* Main Toggle */}
                <div className="flex items-center justify-between">
                    <Label>Enable TTS</Label>
                    <Switch 
                        checked={tts.enabled || false}
                        onCheckedChange={(c) => handleChange('enabled', c)}
                    />
                </div>

                <div className="grid grid-cols-2 gap-4">
                     <Button variant="outline" size="sm" onClick={handleLaunch}>
                        <Power className="w-4 h-4 mr-2" />
                        Launch Backend
                    </Button>
                     <Button variant="outline" size="sm" onClick={handleRestart}>
                        <RefreshCw className="w-4 h-4 mr-2" />
                        Restart Backend
                    </Button>
                </div>

                <div className="space-y-2">
                    <Label>API Base URL</Label>
                    <Input 
                        value={tts.baseUrl || "http://127.0.0.1:9872"} 
                        onChange={(e) => handleChange('baseUrl', e.target.value)} 
                    />
                </div>

                {/* Model Configuration */}
                <div className="space-y-3 p-3 border rounded-md">
                    <div className="flex justify-between items-center">
                        <Label className="text-sm font-bold text-muted-foreground">Model Paths</Label>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleScan} title="Rescan Models">
                            <RefreshCw className="h-3 w-3" />
                        </Button>
                    </div>
                    
                    <div className="space-y-1">
                        <Label className="text-xs">GPT Model (.ckpt)</Label>
                        <Select 
                            value={tts.selectedGptPath || ""} 
                            onValueChange={(v) => handleChange('selectedGptPath', v)}
                        >
                            <SelectTrigger className="h-8 text-xs">
                                <SelectValue placeholder={getFileName(tts.selectedGptPath)} />
                            </SelectTrigger>
                            <SelectContent>
                                {availableModels.gpt.length === 0 && <SelectItem value="_none" disabled>No models found</SelectItem>}
                                {availableModels.gpt.map((path, i) => (
                                    <SelectItem key={i} value={path} title={path}>
                                        {getFileName(path)}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        {/* Fallback Input for manual entry if needed, maybe toggleable? For now relying on scan */}
                    </div>
                    
                    <div className="space-y-1">
                        <Label className="text-xs">SoVITS Model (.pth)</Label>
                        <Select 
                            value={tts.selectedSovitsPath || ""} 
                            onValueChange={(v) => handleChange('selectedSovitsPath', v)}
                        >
                            <SelectTrigger className="h-8 text-xs">
                                <SelectValue placeholder={getFileName(tts.selectedSovitsPath)} />
                            </SelectTrigger>
                            <SelectContent>
                                {availableModels.sovits.length === 0 && <SelectItem value="_none" disabled>No models found</SelectItem>}
                                {availableModels.sovits.map((path, i) => (
                                    <SelectItem key={i} value={path} title={path}>
                                        {getFileName(path)}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <Button className="w-full" size="sm" onClick={handleModelLoad}>
                        Load Weights
                    </Button>
                </div>

                {/* Reference Audio */}
                <div className="space-y-3 p-3 border rounded-md">
                    <Label className="text-sm font-bold text-muted-foreground flex items-center">
                        <FileAudio className="w-3 h-3 mr-2" />
                        Reference Audio
                    </Label>
                    
                    <div className="space-y-1">
                        <Label className="text-xs">Reference Audio Path</Label>
                        <div className="flex gap-2">
                            <Input 
                               className="h-8 text-xs flex-1"
                               value={tts.refAudioPath || ""}
                               readOnly
                               title={tts.refAudioPath}
                            />
                            <Button variant="outline" size="icon" className="h-8 w-8" onClick={browseAudioFile}>
                                <FolderSearch className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>

                    <div className="space-y-1">
                        <Label className="text-xs">Prompt Text</Label>
                        <Input 
                           className="h-8 text-xs"
                           value={tts.promptText || ""}
                           onChange={(e) => handleChange('promptText', e.target.value)}
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                            <Label className="text-xs">Prompt Lang</Label>
                            <Select 
                                value={tts.promptLang || "en"} 
                                onValueChange={(v) => handleChange('promptLang', v)}
                            >
                                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="English">English</SelectItem>
                                    <SelectItem value="Japanese">Japanese</SelectItem>
                                    <SelectItem value="Chinese">Chinese</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1">
                           <Label className="text-xs">Target Lang</Label>
                            <Select 
                                value={tts.textLang || "English"} 
                                onValueChange={(v) => handleChange('textLang', v)}
                            >
                                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="English">English</SelectItem>
                                    <SelectItem value="Japanese">Japanese</SelectItem>
                                    <SelectItem value="Chinese">Chinese</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </div>

                {/* Inference Params */}
                <div className="space-y-4">
                     <Label className="text-sm font-bold text-muted-foreground">Inference Params</Label>
                     
                     <div className="space-y-1">
                        <Label className="text-xs">Split Method</Label>
                        <Select 
                            value={tts.howToCut || "cut5"} 
                            onValueChange={(v) => handleChange('howToCut', v)}
                        >
                            <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="cut0">No Split (cut0)</SelectItem>
                                <SelectItem value="cut1">Every 4 sentences (cut1)</SelectItem>
                                <SelectItem value="cut2">Every 50 chars (cut2)</SelectItem>
                                <SelectItem value="cut3">Chinese Punctuation (cut3)</SelectItem>
                                <SelectItem value="cut4">English Punctuation (cut4)</SelectItem>
                                <SelectItem value="cut5">Hybrid Punctuation (cut5)</SelectItem>
                            </SelectContent>
                        </Select>
                     </div>

                     <div className="space-y-2">
                        <div className="flex justify-between items-center">
                             <Label className="text-xs">Speed ({tts.speed || 1.0})</Label>
                        </div>
                        <Slider 
                            value={[tts.speed || 1.0]} 
                            min={0.5} max={2.0} step={0.1}
                            onValueChange={(v) => handleChange('speed', v[0])}
                        />
                     </div>
                     
                     <div className="space-y-2">
                        <div className="flex justify-between items-center">
                             <Label className="text-xs">Temperature ({tts.temperature || 1.0})</Label>
                        </div>
                        <Slider 
                            value={[tts.temperature || 1.0]} 
                            min={0.1} max={2.0} step={0.05}
                            onValueChange={(v) => handleChange('temperature', v[0])}
                        />
                     </div>

                     <div className="space-y-2">
                        <div className="flex justify-between items-center">
                             <Label className="text-xs">Top K ({tts.topK || 5})</Label>
                        </div>
                        <Slider 
                            value={[tts.topK || 5]} 
                            min={1} max={50} step={1}
                            onValueChange={(v) => handleChange('topK', v[0])}
                        />
                     </div>

                     <div className="space-y-2">
                        <div className="flex justify-between items-center">
                             <Label className="text-xs">Top P ({tts.topP || 1})</Label>
                        </div>
                        <Slider 
                            value={[tts.topP || 1.0]} 
                            min={0.1} max={1.0} step={0.05}
                            onValueChange={(v) => handleChange('topP', v[0])}
                        />
                     </div>
                </div>
            </CardContent>
        </Card>
    );
}
