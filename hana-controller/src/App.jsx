import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { 
    Settings, 
    Terminal, 
    Power, 
    MessageSquare, 
    Activity, 
    Eye, 
    Brain, 
    LayoutDashboard,
    Mic
} from 'lucide-react';
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"

// Dashboard Components
import { GeneralSettings } from "./components/dashboard/GeneralSettings"
import { AppearanceSettings } from "./components/dashboard/AppearanceSettings"
import { SubtitleSettings } from "./components/dashboard/SubtitleSettings"
import { DebugPanel } from "./components/dashboard/DebugPanel"

// Existing Components
import { VoiceControls } from "./components/VoiceControls"
import { AIControls } from "./components/AIControls"
import { TTSControls } from "./components/TTSControls"

const API_URL = 'http://localhost:3000/api/config';
const WS_URL = 'ws://localhost:3000';

function App() {
  const [activeTab, setActiveTab] = useState('monitor');
  const [config, setConfig] = useState({
    vrmPath: '',
    alwaysOnTop: true,
    clickThrough: false,
    scale: 1.0,
    position: { x: 0, y: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    idleIntensity: 1.0,
    showBorder: false,
    lookAtCursor: false,
    eyeTrackingSensitivity: 0.1,
    randomLookInterval: { min: 1.0, max: 4.0 },
    randomLookRadius: 5.0,
    shading: {
      mode: 'default',
      lightIntensity: 1.0,
      ambientIntensity: 0.4,
      shadowDarkness: 120,
      saturationBoost: 1.0,
      lightX: 1.0,
      lightY: 1.0,
      lightZ: 1.0,
    },
    pushToTalk: false,
    pushToTalkKey: 'v'
  });
  const [connected, setConnected] = useState(false);
  
  const ws = useRef(null);

  // Memoize handlers to prevent unnecessary re-renders
  const updateConfig = useCallback((newConfig) => {
      setConfig(prev => {
          const merged = { ...prev, ...newConfig };
          if (ws.current && ws.current.readyState === WebSocket.OPEN) {
              ws.current.send(JSON.stringify({ type: 'update-config', payload: newConfig }));
          } else {
              fetch(API_URL, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(newConfig)
              });
          }
          return merged;
      });
  }, []);
  
  const handleDebugCommand = useCallback((command, value) => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
        ws.current.send(JSON.stringify({ type: 'debug-command', command, value }));
    }
  }, []);
  
  const sendCommand = useCallback((type, payload = {}) => {
      if (ws.current && ws.current.readyState === WebSocket.OPEN) {
          ws.current.send(JSON.stringify({ type, ...payload }));
      }
  }, []);

  const handleShutdown = useCallback(() => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
        if (confirm("Are you sure you want to close Hana?")) {
            ws.current.send(JSON.stringify({ type: 'app-command', command: 'quit' }));
        }
    }
  }, []);

  // Memoize menu items to prevent recreation on every render
  const menuItems = useMemo(() => [
    { id: 'monitor', label: 'Monitor', icon: Activity },
    { id: 'ai', label: 'Intelligence', icon: Brain },
    { id: 'visuals', label: 'Visuals', icon: Eye },
    { id: 'subtitles', label: 'Subtitles', icon: MessageSquare },
    { id: 'system', label: 'System', icon: Settings },
    { id: 'debug', label: 'Debug', icon: Terminal },
  ], []);

  // WebSocket connection and config fetch
  useEffect(() => {
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
          window.dispatchEvent(new CustomEvent('hana-ws-message', { detail: data }));
      };
    };

    fetchConfig();
    connectWebSocket();
    return () => {
        if (ws.current) ws.current.close();
    };
  }, []);

  // Effect to handle Subtitle Preview persistence based on active tab
  useEffect(() => {
      if (activeTab === 'subtitles') {
         setTimeout(() => {
            if (ws.current && ws.current.readyState === WebSocket.OPEN) {
                ws.current.send(JSON.stringify({ 
                    type: 'debug-command', 
                    command: 'preview-subtitle', 
                    isPersistent: true 
                }));
            }
         }, 300);
      } else {
          if (ws.current && ws.current.readyState === WebSocket.OPEN) {
                ws.current.send(JSON.stringify({ 
                    type: 'debug-command', 
                    command: 'preview-subtitle', 
                    value: null,
                    isPersistent: false 
                }));
            }
      }
  }, [activeTab]);

  const renderContent = () => {
      switch(activeTab) {
          case 'monitor':
              return (
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                      <div className="p-6 bg-card rounded-xl border border-border shadow-sm">
                          <div className="flex items-center gap-4">
                              <div className={`p-3 rounded-full ${connected ? 'bg-green-500/20 text-green-500' : 'bg-red-500/20 text-red-500'}`}>
                                  <Activity className="w-6 h-6" />
                              </div>
                              <div>
                                  <p className="text-sm font-medium text-muted-foreground">System Status</p>
                                  <h3 className="text-2xl font-bold">{connected ? 'Online' : 'Offline'}</h3>
                              </div>
                          </div>
                      </div>
                      
                      {/* Add quick status items here */}
                      <div className="p-6 bg-card rounded-xl border border-border shadow-sm">
                          <div className="flex items-center gap-4">
                              <div className="p-3 rounded-full bg-primary/20 text-primary">
                                  <Mic className="w-6 h-6" />
                              </div>
                              <div>
                                  <p className="text-sm font-medium text-muted-foreground">Input Mode</p>
                                  <h3 className="text-lg font-bold">{config.pushToTalk ? 'Push-To-Talk' : 'Voice Activity'}</h3>
                              </div>
                          </div>
                      </div>
                  </div>
              );
          case 'system':
              return <GeneralSettings config={config} updateConfig={updateConfig} />;
          case 'visuals':
              return <AppearanceSettings config={config} updateConfig={updateConfig} />;
          case 'subtitles':
              return <SubtitleSettings config={config} updateConfig={updateConfig} />;
          case 'ai':
              return (
                  <div className="space-y-6">
                       <div className="grid gap-6 lg:grid-cols-2">
                           <VoiceControls config={config} updateConfig={updateConfig} sendCommand={sendCommand} ws={ws.current} connected={connected} />
                           <TTSControls config={config} updateConfig={updateConfig} sendCommand={sendCommand} />
                       </div>
                       <AIControls config={config} updateConfig={updateConfig} />
                  </div>
              );
          case 'debug':
              return <DebugPanel handleDebugCommand={handleDebugCommand} />;
          default:
              return null;
      }
  };

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden">
        {/* Sidebar */}
        <aside className="w-64 bg-card border-r border-border flex flex-col shadow-lg z-10">
            <div className="p-6">
                <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary to-pink-500 flex items-center gap-2">
                    <LayoutDashboard className="w-6 h-6 text-primary" />
                    Hana
                </h1>
            </div>
            
            <ScrollArea className="flex-1 px-3">
                <nav className="space-y-2">
                    {menuItems.map((item) => (
                        <Button
                            key={item.id}
                            variant={activeTab === item.id ? "secondary" : "ghost"}
                            className={cn(
                                "w-full justify-start text-lg h-12", 
                                activeTab === item.id && "bg-secondary/50 font-semibold"
                            )}
                            onClick={() => setActiveTab(item.id)}
                        >
                            <item.icon className="mr-3 h-5 w-5" />
                            {item.label}
                        </Button>
                    ))}
                </nav>
            </ScrollArea>

            <div className="p-4 border-t border-border mt-auto">
                 <div className="flex items-center gap-3 mb-4 px-2">
                    <div className={`w-2.5 h-2.5 rounded-full ${connected ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' : 'bg-red-500'}`} />
                    <span className="text-sm font-medium text-muted-foreground">{connected ? 'System Connected' : 'Disconnected'}</span>
                 </div>
                 <Button variant="destructive" className="w-full" onClick={handleShutdown}>
                    <Power className="w-4 h-4 mr-2" />
                    Shutdown
                 </Button>
            </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 overflow-auto bg-background/50 relative">
             <div className="p-8 pb-20 max-w-7xl mx-auto space-y-6">
                 <div className="flex items-center justify-between mb-2">
                    <div>
                        <h2 className="text-3xl font-bold tracking-tight">{menuItems.find(i => i.id === activeTab)?.label}</h2>
                        <p className="text-muted-foreground">
                            {activeTab === 'monitor' && "System overview and status"}
                            {activeTab === 'system' && "Core application settings"}
                            {activeTab === 'visuals' && "Character customization and view"}
                            {activeTab === 'ai' && "Voice, Text-to-Speech and LLM settings"}
                            {activeTab === 'subtitles' && "Captions appearance and behavior"}
                            {activeTab === 'debug' && "Developer tools and animation triggers"}
                        </p>
                    </div>
                 </div>
                 <Separator className="bg-border/50" />
                 
                 <div className="animate-in fade-in-50 slide-in-from-bottom-2 duration-500">
                    {renderContent()}
                 </div>
             </div>
        </main>
    </div>
  );
}

export default App;
