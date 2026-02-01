import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"

export function AppearanceSettings({ config, updateConfig }) {

  const handlePositionChange = (axis, value) => {
      updateConfig({ position: { ...config.position, [axis]: value[0] } });
  };

  const handleRotationChange = (axis, value) => {
      updateConfig({ rotation: { ...config.rotation, [axis]: value[0] } });
  };

  return (
    <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2">
            <Card>
                <CardHeader><CardTitle>Shading & Lighting</CardTitle></CardHeader>
                <CardContent className="space-y-6">
                     <div className="space-y-2">
                        <Label>Shading Mode</Label>
                        <div className="flex gap-2 p-1 bg-secondary rounded-lg">
                            <Button 
                                variant={config.shading?.mode === 'default' ? 'secondary' : 'ghost'}
                                className="flex-1"
                                size="sm"
                                onClick={() => updateConfig({ shading: { ...config.shading, mode: 'default' } })}
                            >
                                Default (PBR)
                            </Button>
                            <Button 
                                variant={config.shading?.mode === 'toon' ? 'secondary' : 'ghost'}
                                className="flex-1"
                                size="sm"
                                onClick={() => updateConfig({ shading: { ...config.shading, mode: 'toon' } })}
                            >
                                Toon (Cel)
                            </Button>
                        </div>
                     </div>
                     
                     <div className="space-y-4">
                         <div className="space-y-1">
                             <div className="flex justify-between">
                                <Label>Light Intensity</Label>
                                <span className="text-sm text-muted-foreground">{config.shading?.lightIntensity?.toFixed(1) || '1.0'}</span>
                             </div>
                             <Slider 
                                value={[config.shading?.lightIntensity || 1.0]} 
                                min={0} max={3.0} step={0.1} 
                                onValueChange={(v) => updateConfig({ shading: { ...config.shading, lightIntensity: v[0] } })} 
                             />
                         </div>
                         
                         <div className="space-y-1">
                             <div className="flex justify-between">
                                <Label>Ambient Intensity</Label>
                                <span className="text-sm text-muted-foreground">{config.shading?.ambientIntensity?.toFixed(1) || '0.4'}</span>
                             </div>
                             <Slider 
                                value={[config.shading?.ambientIntensity || 0.4]} 
                                min={0} max={2.0} step={0.1} 
                                onValueChange={(v) => updateConfig({ shading: { ...config.shading, ambientIntensity: v[0] } })} 
                             />
                         </div>
                     </div>
                     
                     {config.shading?.mode === 'toon' && (
                        <div className="pt-4 border-t space-y-4">
                         <div className="space-y-2">
                             <div className="flex justify-between">
                                <Label>Shadow Darkness</Label>
                                <span className="text-sm text-muted-foreground">{config.shading?.shadowDarkness || 120}</span>
                             </div>
                             <Slider 
                                value={[config.shading?.shadowDarkness || 120]} 
                                min={0} max={200} step={5} 
                                onValueChange={(v) => updateConfig({ shading: { ...config.shading, shadowDarkness: v[0] } })} 
                             />
                             <p className="text-xs text-muted-foreground">Lower = darker shadows</p>
                         </div>
                         
                         <div className="space-y-2">
                             <div className="flex justify-between">
                                <Label>Saturation Boost</Label>
                                <span className="text-sm text-muted-foreground">{config.shading?.saturationBoost?.toFixed(1) || '1.0'}</span>
                             </div>
                             <Slider 
                                value={[config.shading?.saturationBoost || 1.0]} 
                                min={0.5} max={2.0} step={0.1} 
                                onValueChange={(v) => updateConfig({ shading: { ...config.shading, saturationBoost: v[0] } })} 
                             />
                         </div>
                        </div>
                     )}
                     
                     <div className="space-y-4 pt-4 border-t">
                         <Label className="text-sm font-medium">Light Direction</Label>
                         <div className="grid grid-cols-3 gap-4">
                             <div className="space-y-2">
                                 <Label className="text-xs">X: {config.shading?.lightX?.toFixed(1) || '1.0'}</Label>
                                 <Slider 
                                    value={[config.shading?.lightX || 1.0]} 
                                    min={-2} max={2} step={0.1} 
                                    onValueChange={(v) => updateConfig({ shading: { ...config.shading, lightX: v[0] } })} 
                                 />
                             </div>
                             <div className="space-y-2">
                                 <Label className="text-xs">Y: {config.shading?.lightY?.toFixed(1) || '1.0'}</Label>
                                 <Slider 
                                    value={[config.shading?.lightY || 1.0]} 
                                    min={-2} max={2} step={0.1} 
                                    onValueChange={(v) => updateConfig({ shading: { ...config.shading, lightY: v[0] } })} 
                                 />
                             </div>
                             <div className="space-y-2">
                                 <Label className="text-xs">Z: {config.shading?.lightZ?.toFixed(1) || '1.0'}</Label>
                                 <Slider 
                                    value={[config.shading?.lightZ || 1.0]} 
                                    min={-2} max={2} step={0.1} 
                                    onValueChange={(v) => updateConfig({ shading: { ...config.shading, lightZ: v[0] } })} 
                                 />
                             </div>
                         </div>
                     </div>
                </CardContent>
            </Card>

            <div className="space-y-4">
                <Card>
                    <CardHeader><CardTitle>Transform</CardTitle></CardHeader>
                    <CardContent className="space-y-6">
                        <div className="space-y-2">
                            <Label>Scale ({config.scale})</Label>
                            <Slider value={[config.scale]} min={0.1} max={3.0} step={0.1} onValueChange={(v) => updateConfig({ scale: v[0] })} />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Pos X ({config.position?.x})</Label>
                                <Slider value={[config.position?.x || 0]} min={-5} max={5} step={0.1} onValueChange={(v) => handlePositionChange('x', v)} />
                            </div>
                            <div className="space-y-2">
                                <Label>Pos Y ({config.position?.y})</Label>
                                <Slider value={[config.position?.y || 0]} min={-5} max={5} step={0.1} onValueChange={(v) => handlePositionChange('y', v)} />
                            </div>
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                            <div className="space-y-2">
                                <Label className="text-xs">Rot X</Label>
                                <Slider value={[config.rotation?.x || 0]} min={-3.14} max={3.14} step={0.1} onValueChange={(v) => handleRotationChange('x', v)} />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-xs">Rot Y</Label>
                                <Slider value={[config.rotation?.y || 0]} min={-3.14} max={3.14} step={0.1} onValueChange={(v) => handleRotationChange('y', v)} />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-xs">Rot Z</Label>
                                <Slider value={[config.rotation?.z || 0]} min={-3.14} max={3.14} step={0.1} onValueChange={(v) => handleRotationChange('z', v)} />
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader><CardTitle>Tracking</CardTitle></CardHeader>
                    <CardContent className="space-y-6">
                        <div className="flex items-center justify-between">
                            <Label>Look at Cursor</Label>
                            <Switch checked={config.lookAtCursor} onCheckedChange={(c) => updateConfig({ lookAtCursor: c })} />
                        </div>
                        {config.lookAtCursor ? (
                            <div className="space-y-2">
                                <Label>Sensitivity ({config.eyeTrackingSensitivity})</Label>
                                <Slider value={[config.eyeTrackingSensitivity]} min={0} max={1.0} step={0.1} onValueChange={(v) => updateConfig({ eyeTrackingSensitivity: v[0] })} />
                            </div>
                        ) : (
                            <>
                                <div className="space-y-2">
                                    <Label>Look Radius ({config.randomLookRadius})</Label>
                                    <Slider value={[config.randomLookRadius]} min={0} max={10.0} step={0.1} onValueChange={(v) => updateConfig({ randomLookRadius: v[0] })} />
                                </div>
                                <div className="space-y-2">
                                    <div className="flex justify-between">
                                        <Label>Look Interval</Label>
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
                        
                        <div className="pt-4 border-t space-y-4">
                            <div className="space-y-2">
                                <div className="flex justify-between">
                                    <Label>Lip Sync Sensitivity</Label>
                                    <span className="text-sm text-muted-foreground">{config.lipSyncSensitivity?.toFixed(1) || '3.0'}</span>
                                </div>
                                <Slider 
                                    value={[config.lipSyncSensitivity || 3.0]} 
                                    min={0.5} 
                                    max={6.0} 
                                    step={0.5} 
                                    onValueChange={(v) => updateConfig({ lipSyncSensitivity: v[0] })} 
                                />
                                <p className="text-xs text-muted-foreground">How much her mouth moves when speaking</p>
                            </div>
                            
                            <div className="space-y-2">
                                <div className="flex justify-between">
                                    <Label>Target FPS</Label>
                                    <span className="text-sm text-muted-foreground">{config.targetFps || 60}</span>
                                </div>
                                <Slider 
                                    value={[config.targetFps || 60]} 
                                    min={30} 
                                    max={165} 
                                    step={1} 
                                    onValueChange={(v) => updateConfig({ targetFps: v[0] })} 
                                />
                                <p className="text-xs text-muted-foreground">Frame rate limit (drops to 30 when idle)</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    </div>
  );
}
