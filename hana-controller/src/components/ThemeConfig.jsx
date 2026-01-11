import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { RotateCcw } from 'lucide-react';

export function ThemeConfig({ currentTheme, onUpdateTheme }) {
    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <RotateCcw size={20} /> Dark / Pink Theme Active
                </CardTitle>
            </CardHeader>
            <CardContent>
                <div className="p-4 rounded-lg bg-card/50 border border-border">
                    <p className="text-sm text-muted-foreground">
                        The controller is currently using the customized Dark/Pink theme.
                    </p>
                </div>
            </CardContent>
        </Card>
    );
}
