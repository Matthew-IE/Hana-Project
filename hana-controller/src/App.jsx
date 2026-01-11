import React, { useState, useEffect, useRef } from 'react';
import { Settings, Smile, Terminal, Power } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"

const API_URL = 'http://localhost:3000/api/config';
const WS_URL = 'ws://localhost:3000';

function App() {
  const [config, setConfig] = useState({
    vrmPath: '',
    alwaysOnTop: true,
    clickThrough: false,
    scale: 1.0,
    position: { x: 0, y: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    idleIntensity: 1.0,
    showBorder: false,
    lookAtCursor: false, // New Property
    eyeTrackingSensitivity: 0.1,
    randomLookInterval: { min: 1.0, max: 4.0 },
    randomLookRadius: 5.0 // New Slider Property
  });
  const [connected, setConnected] = useState(false);
  
  const ws = useRef(null);

  useEffect(() => {
    fetchConfig();
    connectWebSocket();
    return () => {
        if (ws.current) ws.current.close();
    };
  }, []);

  const fetchConfig = async () => {
    try {
      const res = await fetch(API_URL);
      const data = await res.json();
      setConfig(prev => ({ ...prev, ...data }));
    } catch (e) { console.error(e); }
  };

  const connectWebSocket = () => {
    ws.current = new WebSocket(WS_URL);
    ws.current.onopen = () => setConnected(true);
    ws.current.onclose = () => {
        setConnected(false);
        setTimeout(connectWebSocket, 3000);
    };
    ws.current.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === 'config-update') {
            setConfig(prev => ({ ...prev, ...data.payload }));
        }
    };
  };

  const updateConfig = (newConfig) => {
      const merged = { ...config, ...newConfig };
      setConfig(merged);
      if (ws.current && ws.current.readyState === WebSocket.OPEN) {
          ws.current.send(JSON.stringify({ type: 'update-config', payload: newConfig }));
      } else {
          // Fallback to REST
          fetch(API_URL, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(newConfig)
          });
      }
  };

  const handleSliderChange = (key, value) => {
      updateConfig({ [key]: value[0] });
  };
  
  const handleDebugCommand = (command, value) => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
        ws.current.send(JSON.stringify({ type: 'debug-command', command, value }));
    }
  };

  const handlePositionChange = (axis, value) => {
      updateConfig({ position: { ...config.position, [axis]: value[0] } });
  };

  const handleRotationChange = (axis, value) => {
      updateConfig({ rotation: { ...config.rotation, [axis]: value[0] } });
  };

  const handleShutdown = () => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
        if (confirm("Are you sure you want to close Hana?")) {
            ws.current.send(JSON.stringify({ type: 'app-command', command: 'quit' }));
        }
    }
  };

  return (
    <div className="container mx-auto p-4 max-w-4xl min-h-screen bg-background text-foreground transition-colors duration-300">
      <header className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary to-pink-500">
            Hana Controller
        </h1>
        <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
                <div className={`w-3 h-3 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`} />
                <span className="text-sm text-muted-foreground">{connected ? 'Connected' : 'Disconnected'}</span>
            </div>
            <Button variant="ghost" size="icon" onClick={handleShutdown} title="Shutdown Hana" className="text-muted-foreground hover:text-destructive">
                <Power className="w-5 h-5" />
            </Button>
        </div>
      </header>
      
      <Tabs defaultValue="general" className="w-full">
        <TabsList className="grid w-full grid-cols-3 mb-4">
            <TabsTrigger value="general"><Settings className="w-4 h-4 mr-2"/> General</TabsTrigger>
            <TabsTrigger value="appearance"><Smile className="w-4 h-4 mr-2"/> Appearance</TabsTrigger>
            <TabsTrigger value="debug"><Terminal className="w-4 h-4 mr-2"/> Debug</TabsTrigger>
        </TabsList>

        <TabsContent value="general">
            <Card>
                <CardHeader><CardTitle>Window Settings</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                        <Label>Always on Top</Label>
                        <Switch checked={config.alwaysOnTop} onCheckedChange={(c) => updateConfig({ alwaysOnTop: c })} />
                    </div>
                    <div className="flex items-center justify-between">
                        <Label>Click Through (Ignore Mouse)</Label>
                        <Switch checked={config.clickThrough} onCheckedChange={(c) => updateConfig({ clickThrough: c })} />
                    </div>
                    <div className="flex items-center justify-between">
                        <Label>Show Debug Border</Label>
                        <Switch checked={config.showBorder} onCheckedChange={(c) => updateConfig({ showBorder: c })} />
                    </div>
                </CardContent>
            </Card>
        </TabsContent>

        <TabsContent value="appearance">
            <Card>
                <CardHeader><CardTitle>Character Transform</CardTitle></CardHeader>
                <CardContent className="space-y-6">
                     <div className="space-y-2">
                         <Label>Scale ({config.scale})</Label>
                         <Slider value={[config.scale]} min={0.1} max={3.0} step={0.1} onValueChange={(v) => handleSliderChange('scale', v)} />
                     </div>
                     <div className="space-y-2">
                         <Label>Position X ({config.position?.x})</Label>
                         <Slider value={[config.position?.x || 0]} min={-5} max={5} step={0.1} onValueChange={(v) => handlePositionChange('x', v)} />
                     </div>
                     <div className="space-y-2">
                         <Label>Position Y ({config.position?.y})</Label>
                         <Slider value={[config.position?.y || 0]} min={-5} max={5} step={0.1} onValueChange={(v) => handlePositionChange('y', v)} />
                     </div>
                     <div className="space-y-2">
                         <Label>Rotation X ({config.rotation?.x || 0})</Label>
                         <Slider value={[config.rotation?.x || 0]} min={-3.14} max={3.14} step={0.1} onValueChange={(v) => handleRotationChange('x', v)} />
                     </div>
                     <div className="space-y-2">
                         <Label>Rotation Y ({config.rotation?.y || 0})</Label>
                         <Slider value={[config.rotation?.y || 0]} min={-3.14} max={3.14} step={0.1} onValueChange={(v) => handleRotationChange('y', v)} />
                     </div>
                     <div className="space-y-2">
                         <Label>Rotation Z ({config.rotation?.z || 0})</Label>
                         <Slider value={[config.rotation?.z || 0]} min={-3.14} max={3.14} step={0.1} onValueChange={(v) => handleRotationChange('z', v)} />
                     </div>
                </CardContent>
            </Card>

            <Card className="mt-4">
                <CardHeader><CardTitle>Eye & Head Tracking</CardTitle></CardHeader>
                <CardContent className="space-y-6">
                    <div className="flex items-center justify-between">
                        <Label>Look at Cursor</Label>
                        <Switch checked={config.lookAtCursor} onCheckedChange={(c) => updateConfig({ lookAtCursor: c })} />
                    </div>
                    {config.lookAtCursor ? (
                        <div className="space-y-2">
                            <Label>Cursor Tracking Sensitivity ({config.eyeTrackingSensitivity})</Label>
                            <Slider value={[config.eyeTrackingSensitivity]} min={0} max={1.0} step={0.1} onValueChange={(v) => handleSliderChange('eyeTrackingSensitivity', v)} />
                        </div>
                    ) : (
                        <>
                            <div className="space-y-2">
                                <Label>Random Look Radius ({config.randomLookRadius})</Label>
                                <Slider value={[config.randomLookRadius]} min={0} max={10.0} step={0.1} onValueChange={(v) => handleSliderChange('randomLookRadius', v)} />
                            </div>
                            <div className="space-y-2">
                                <div className="flex justify-between">
                                    <Label>Look Interval (Max)</Label>
                                    <span className="text-sm text-muted-foreground">{config.randomLookInterval?.max || 4.0}s</span>
                                </div>
                                <Slider 
                                    value={[config.randomLookInterval?.max || 4.0]} 
                                    min={1.0} 
                                    max={10.0} 
                                    step={0.5} 
                                    onValueChange={(v) => updateConfig({ randomLookInterval: { ...config.randomLookInterval, max: v[0] } })} 
                                />
                            </div>
                        </>
                    )}
                </CardContent>
            </Card>
        </TabsContent>

        <TabsContent value="debug">
            <Card>
                <CardHeader><CardTitle>Animation Debugger</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                    <Label>Force Play Animation</Label>
                    <div className="grid grid-cols-2 gap-2">
                        <Button variant="outline" onClick={() => handleDebugCommand('play-animation', '/animations/Idle.fbx')}>Idle 1</Button>
                        <Button variant="outline" onClick={() => handleDebugCommand('play-animation', '/animations/Idle2.fbx')}>Idle 2</Button>
                        <Button variant="outline" onClick={() => handleDebugCommand('play-animation', '/animations/Idle3.fbx')}>Idle 3</Button>
                        <Button variant="outline" onClick={() => handleDebugCommand('play-animation', '/animations/Wave.fbx')}>Wave</Button>
                        <Button variant="outline" onClick={() => handleDebugCommand('play-animation', '/animations/Thinking.fbx')}>Thinking</Button>
                    </div>
                </CardContent>
                <CardContent className="space-y-4">
                    <Label>Force Expression</Label>
                    <div className="grid grid-cols-3 gap-2">
                         {['neutral', 'happy', 'angry', 'sad', 'relaxed', 'surprised'].map(expr => (
                             <Button key={expr} variant="outline" onClick={() => handleDebugCommand('set-emotion', expr)}>
                                 {expr.charAt(0).toUpperCase() + expr.slice(1)}
                             </Button>
                         ))}
                    </div>
                </CardContent>
            </Card>
        </TabsContent>
        
      </Tabs>
    </div>
  );
}

export default App;

