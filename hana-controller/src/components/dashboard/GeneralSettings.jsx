import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"

export function GeneralSettings({ config, updateConfig }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
            <CardHeader>
                <CardTitle>Window Behavior</CardTitle>
                <CardDescription>Manage how the window interacts with your OS</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                        <Label>Always on Top</Label>
                        <p className="text-xs text-muted-foreground">Window stays above others</p>
                    </div>
                    <Switch checked={config.alwaysOnTop} onCheckedChange={(c) => updateConfig({ alwaysOnTop: c })} />
                </div>
                <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                        <Label>Click Through</Label>
                        <p className="text-xs text-muted-foreground">Ignore mouse events</p>
                    </div>
                    <Switch checked={config.clickThrough} onCheckedChange={(c) => updateConfig({ clickThrough: c })} />
                </div>
                <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                        <Label>Debug Border</Label>
                        <p className="text-xs text-muted-foreground">Show window boundaries</p>
                    </div>
                    <Switch checked={config.showBorder} onCheckedChange={(c) => updateConfig({ showBorder: c })} />
                </div>
            </CardContent>
        </Card>
    </div>
  );
}
