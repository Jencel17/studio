
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import Cookies from "js-cookie";
import { useRouter } from "next/navigation";
import { Shield, Smartphone, Loader2, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function LandingPage() {
    const [isAuthenticated, setIsAuthenticated] = useState<boolean | undefined>(undefined);
    const router = useRouter();

    useEffect(() => {
        const authCookie = Cookies.get('auth');
        if (authCookie === 'true') {
            setIsAuthenticated(true);
        } else {
            setIsAuthenticated(false);
            router.push('/login');
        }
    }, [router]);

    const handleLogout = () => {
        Cookies.remove('auth');
        router.push('/login');
    };

    if (isAuthenticated === undefined) {
        return (
            <div className="flex h-screen w-full flex-col items-center justify-center bg-background text-foreground">
                <Loader2 className="h-8 w-8 animate-spin" />
                <p className="mt-4 text-muted-foreground">Verifying authentication...</p>
            </div>
        );
    }

    if (!isAuthenticated) return null;

    return (
        <div className="flex min-h-screen w-full flex-col items-center justify-center bg-gradient-to-b from-background to-muted/20 p-4">
            <div className="w-full max-w-4xl space-y-8">
                <div className="text-center space-y-2">
                    <h1 className="text-4xl font-extrabold tracking-tight lg:text-5xl bg-clip-text text-transparent bg-gradient-to-r from-primary to-blue-600">
                        SortVision Studio
                    </h1>
                    <p className="text-muted-foreground text-lg">
                        AI-Powered Waste Classification System
                    </p>
                </div>

                <div className="grid md:grid-cols-2 gap-6">
                    <Link href="/client" className="group">
                        <Card className="h-full transition-all duration-300 hover:shadow-xl hover:border-primary/50 relative overflow-hidden">
                            <div className="absolute inset-0 bg-blue-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                            <CardHeader className="text-center pb-2">
                                <div className="mx-auto bg-primary/10 p-4 rounded-full mb-4 w-fit group-hover:scale-110 transition-transform duration-300">
                                    <Smartphone className="h-10 w-10 text-primary" />
                                </div>
                                <CardTitle className="text-2xl">Client View</CardTitle>
                                <CardDescription>
                                    Simplified interface for sorting and feedback.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="text-center">
                                <ul className="text-sm text-muted-foreground space-y-2">
                                    <li>Live Object Detection</li>
                                    <li>Interactive Feedback Loop</li>
                                    <li>Automated Training Data Capture</li>
                                </ul>
                            </CardContent>
                        </Card>
                    </Link>

                    <Link href="/admin" className="group">
                        <Card className="h-full transition-all duration-300 hover:shadow-xl hover:border-primary/50 relative overflow-hidden">
                            <div className="absolute inset-0 bg-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                            <CardHeader className="text-center pb-2">
                                <div className="mx-auto bg-primary/10 p-4 rounded-full mb-4 w-fit group-hover:scale-110 transition-transform duration-300">
                                    <Shield className="h-10 w-10 text-primary" />
                                </div>
                                <CardTitle className="text-2xl">Admin Panel</CardTitle>
                                <CardDescription>
                                    Advanced controls and system configuration.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="text-center">
                                <ul className="text-sm text-muted-foreground space-y-2">
                                    <li>Model Management & Upload</li>
                                    <li>Hardware & Bluetooth Settings</li>
                                    <li>Detailed Logs & Monitoring</li>
                                </ul>
                            </CardContent>
                        </Card>
                    </Link>
                </div>

                <div className="flex justify-center pt-8">
                    <Button variant="ghost" className="text-muted-foreground hover:text-destructive" onClick={handleLogout}>
                        <LogOut className="mr-2 h-4 w-4" />
                        Sign Out
                    </Button>
                </div>
            </div>
        </div>
    );
}
