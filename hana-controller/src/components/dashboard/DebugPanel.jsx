import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"

export function DebugPanel({ handleDebugCommand }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
        <Card>
            <CardHeader>
                <CardTitle>Animations</CardTitle>
                <CardDescription>Trigger base animations directly</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-2">
                    <Button variant="outline" onClick={() => handleDebugCommand('play-animation', '/animations/Idle.fbx')}>Idle 1</Button>
                    <Button variant="outline" onClick={() => handleDebugCommand('play-animation', '/animations/Idle2.fbx')}>Idle 2</Button>
                    <Button variant="outline" onClick={() => handleDebugCommand('play-animation', '/animations/Idle3.fbx')}>Idle 3</Button>
                    <Button variant="outline" onClick={() => handleDebugCommand('play-animation', '/animations/Wave.fbx')}>Wave</Button>
                    <Button variant="outline" onClick={() => handleDebugCommand('play-animation', '/animations/Thinking.fbx')}>Thinking</Button>
                </div>
            </CardContent>
        </Card>
        
        <Card>
            <CardHeader>
                <CardTitle>Expressions</CardTitle>
                <CardDescription>Force facial expressions</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="grid grid-cols-3 gap-2">
                     {['neutral', 'happy', 'angry', 'sad', 'relaxed', 'surprised'].map(expr => (
                         <Button key={expr} variant="outline" onClick={() => handleDebugCommand('set-emotion', expr)}>
                             {expr.charAt(0).toUpperCase() + expr.slice(1)}
                         </Button>
                     ))}
                </div>
            </CardContent>
        </Card>
    </div>
  );
}
