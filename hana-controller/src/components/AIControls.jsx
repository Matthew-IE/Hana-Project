import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Slider } from "@/components/ui/slider"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

export function AIControls({ config, updateConfig }) {
    return (
        <Card>
            <CardHeader><CardTitle>AI Integration (Ollama)</CardTitle></CardHeader>
            <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                    <Label htmlFor="ai-enabled">Enable AI Responses</Label>
                    <Switch 
                        id="ai-enabled"
                        checked={config.aiEnabled || false} 
                        onCheckedChange={(c) => updateConfig({ aiEnabled: c })} 
                    />
                </div>

                <div className="space-y-2">
                    <Label>Ollama Model</Label>
                    <Input 
                        value={config.ollamaModel || "llama3"} 
                        onChange={(e) => updateConfig({ ollamaModel: e.target.value })} 
                        placeholder="llama3"
                    />
                    <p className="text-xs text-muted-foreground">Make sure you have pulled this model in Ollama (`ollama pull llama3`)</p>
                </div>

                <div className="space-y-2">
                    <Label>System Prompt (Personality)</Label>
                    <Textarea 
                        className="min-h-[100px]"
                        value={config.systemPrompt || ""} 
                        onChange={(e) => updateConfig({ systemPrompt: e.target.value })} 
                    />
                </div>

                <div className="space-y-2">
                    <div className="flex justify-between">
                        <Label>Dialogue Speed</Label>
                        <span className="text-sm text-muted-foreground">{config.dialogueSpeed || 50}ms</span>
                    </div>
                    <Slider 
                        value={[config.dialogueSpeed || 50]} 
                        min={10} 
                        max={200} 
                        step={5} 
                        onValueChange={(v) => updateConfig({ dialogueSpeed: v[0] })} 
                    />
                </div>
            </CardContent>
        </Card>
    );
}
