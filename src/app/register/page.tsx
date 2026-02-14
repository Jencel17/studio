
"use client";

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Eye, EyeOff } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';

export default function RegisterPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const { toast } = useToast();
    const { signUp } = useAuth();
    const router = useRouter();

    const handleRegister = async (e: FormEvent) => {
        e.preventDefault();

        if (password !== confirmPassword) {
            toast({
                variant: 'destructive',
                title: 'Password Mismatch',
                description: 'Passwords do not match. Please try again.',
            });
            return;
        }

        if (password.length < 6) {
            toast({
                variant: 'destructive',
                title: 'Weak Password',
                description: 'Password must be at least 6 characters.',
            });
            return;
        }

        setIsLoading(true);

        try {
            await signUp(email, password);

            toast({
                title: 'Account Created',
                description: 'Welcome to SortVision! Redirecting...',
            });

            router.push('/');
        } catch (error: any) {
            let message = 'Could not create account.';
            if (error?.code === 'auth/email-already-in-use') {
                message = 'An account with this email already exists.';
            } else if (error?.code === 'auth/invalid-email') {
                message = 'Please enter a valid email address.';
            } else if (error?.code === 'auth/weak-password') {
                message = 'Password must be at least 6 characters.';
            }

            toast({
                variant: 'destructive',
                title: 'Registration Failed',
                description: message,
            });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="flex h-screen w-full items-center justify-center bg-background px-4">
            <Card className="w-full max-w-sm">
                <CardHeader>
                    <CardTitle className="text-2xl">Create Account</CardTitle>
                    <CardDescription>Register to start using SortVision.</CardDescription>
                </CardHeader>
                <form onSubmit={handleRegister}>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="email">Email</Label>
                            <Input
                                id="email"
                                type="email"
                                placeholder="you@example.com"
                                required
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                disabled={isLoading}
                            />
                        </div>
                        <div className="space-y-2 relative">
                            <Label htmlFor="password">Password</Label>
                            <Input
                                id="password"
                                type={showPassword ? 'text' : 'password'}
                                placeholder="At least 6 characters"
                                required
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                disabled={isLoading}
                            />
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="absolute bottom-1 right-1 h-7 w-7"
                                onClick={() => setShowPassword(!showPassword)}
                                disabled={isLoading}
                            >
                                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                <span className="sr-only">Toggle password visibility</span>
                            </Button>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="confirmPassword">Confirm Password</Label>
                            <Input
                                id="confirmPassword"
                                type="password"
                                required
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                disabled={isLoading}
                            />
                        </div>
                    </CardContent>
                    <CardFooter className="flex flex-col gap-3">
                        <Button type="submit" className="w-full" disabled={isLoading}>
                            {isLoading ? 'Creating account...' : 'Create Account'}
                        </Button>
                        <p className="text-sm text-muted-foreground text-center">
                            Already have an account?{' '}
                            <Link href="/login" className="text-primary hover:underline font-medium">
                                Sign In
                            </Link>
                        </p>
                    </CardFooter>
                </form>
            </Card>
        </div>
    );
}
