
import { Loader2 } from 'lucide-react';

export default function SplashScreen() {
  return (
    <div className="flex h-screen w-full flex-col items-center justify-center bg-background text-foreground">
      <div className="text-center">
        <h1 className="text-4xl font-bold tracking-tight">SortVision</h1>
        <p className="mt-2 text-lg text-muted-foreground">
          AI-Powered Waste Classification
        </p>
        <Loader2 className="mx-auto mt-8 h-8 w-8 animate-spin text-primary" />
        <p className="mt-4 text-sm text-muted-foreground">Loading AI libraries...</p>
      </div>
    </div>
  );
}
