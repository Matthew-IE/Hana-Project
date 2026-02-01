import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"

export function SubtitleSettings({ config, updateConfig }) {

  const handleSubtitleChange = (key, value) => {
      const currentSubtitle = config.subtitle || {};
      updateConfig({ 
          subtitle: { 
              ...currentSubtitle, 
              [key]: value 
          } 
      });
  };

  return (
    <div className="grid gap-4 md:grid-cols-2">
        <Card>
            <CardHeader>
                <CardTitle>Typography & Color</CardTitle>
                <CardDescription>Customize the text appearance</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                 <div className="space-y-2">
                     <div className="flex justify-between">
                        <Label>Font Size</Label>
                        <span className="text-sm text-muted-foreground">{config.subtitle?.fontSize || 24}px</span>
                     </div>
                     <Slider 
                        value={[config.subtitle?.fontSize || 24]} 
                        min={12} 
                        max={64} 
                        step={1} 
                        onValueChange={(v) => handleSubtitleChange('fontSize', v[0])} 
                     />
                 </div>
                 
                 <div className="space-y-2">
                    <Label>Text Color</Label>
                    <div className="flex gap-2 items-center">
                        <input 
                            type="color" 
                            value={config.subtitle?.color || '#ffffff'} 
                            onChange={(e) => handleSubtitleChange('color', e.target.value)}
                            className="h-10 w-20 cursor-pointer border border-border rounded bg-transparent"
                        />
                        <span className="font-mono text-xs p-2 bg-secondary rounded">{config.subtitle?.color || '#ffffff'}</span>
                    </div>
                 </div>

                 <div className="space-y-2">
                    <Label>Background</Label>
                    <div className="flex gap-2">
                         <input 
                            type="text"
                            value={config.subtitle?.backgroundColor || 'rgba(0, 0, 0, 0.7)'}
                            onChange={(e) => handleSubtitleChange('backgroundColor', e.target.value)}
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                            placeholder="rgba(0, 0, 0, 0.7)"
                        />
                    </div>
                    <p className="text-xs text-muted-foreground">Hex or RGBA supported</p>
                 </div>
            </CardContent>
        </Card>

        <Card>
            <CardHeader>
                <CardTitle>Layout & Animation</CardTitle>
                <CardDescription>Positioning and display speed</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                 <div className="space-y-2">
                     <div className="flex justify-between">
                        <Label>Box Width</Label>
                        <span className="text-sm text-muted-foreground">{config.subtitle?.maxWidth || 80}%</span>
                     </div>
                     <Slider 
                        value={[config.subtitle?.maxWidth || 80]} 
                        min={20} 
                        max={100} 
                        step={1} 
                        onValueChange={(v) => handleSubtitleChange('maxWidth', v[0])} 
                     />
                 </div>

                 <div className="grid grid-cols-2 gap-4">
                     <div className="space-y-2">
                         <div className="flex justify-between">
                            <Label>Padding</Label>
                            <span className="text-sm text-muted-foreground">{config.subtitle?.padding || 20}px</span>
                         </div>
                         <Slider 
                            value={[config.subtitle?.padding || 20]} 
                            min={5} 
                            max={50} 
                            step={1} 
                            onValueChange={(v) => handleSubtitleChange('padding', v[0])} 
                         />
                     </div>

                     <div className="space-y-2">
                         <div className="flex justify-between">
                            <Label>Radius</Label>
                            <span className="text-sm text-muted-foreground">{config.subtitle?.borderRadius || 10}px</span>
                         </div>
                         <Slider 
                            value={[config.subtitle?.borderRadius || 10]} 
                            min={0} 
                            max={50} 
                            step={1} 
                            onValueChange={(v) => handleSubtitleChange('borderRadius', v[0])} 
                         />
                     </div>
                 </div>

                 <div className="space-y-2">
                     <div className="flex justify-between">
                        <Label>Bottom Offset</Label>
                        <span className="text-sm text-muted-foreground">{config.subtitle?.bottomOffset || 80}px</span>
                     </div>
                     <Slider 
                        value={[config.subtitle?.bottomOffset !== undefined ? config.subtitle.bottomOffset : 80]} 
                        min={0} 
                        max={window.innerHeight || 800} 
                        step={10} 
                        onValueChange={(v) => handleSubtitleChange('bottomOffset', v[0])} 
                     />
                 </div>

                 <div className="space-y-2">
                     <div className="flex justify-between">
                        <Label>Horizontal Pos</Label>
                        <span className="text-sm text-muted-foreground">{config.subtitle?.horizontalPosition !== undefined ? config.subtitle.horizontalPosition : 50}%</span>
                     </div>
                     <Slider 
                        value={[config.subtitle?.horizontalPosition !== undefined ? config.subtitle.horizontalPosition : 50]} 
                        min={0} 
                        max={100} 
                        step={1} 
                        onValueChange={(v) => handleSubtitleChange('horizontalPosition', v[0])} 
                     />
                 </div>

                <div className="space-y-2 pt-2 border-t">
                     <div className="flex justify-between">
                        <Label>Typewriter Speed</Label>
                        <span className="text-sm text-muted-foreground">{config.dialogueSpeed || 50}ms</span>
                     </div>
                     <Slider 
                        value={[config.dialogueSpeed || 50]} 
                        min={10} 
                        max={500} 
                        step={10} 
                        onValueChange={(v) => updateConfig({ dialogueSpeed: v[0] })} 
                     />
                 </div>
            </CardContent>
        </Card>
    </div>
  );
}
