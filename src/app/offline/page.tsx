
import { WifiOff } from 'lucide-react';

export default function OfflinePage() {
  return (
    <div className="flex h-screen flex-col items-center justify-center bg-background text-foreground">
      <WifiOff className="h-24 w-24 text-muted-foreground" />
      <h1 className="mt-8 text-4xl font-bold">You are offline</h1>
      <p className="mt-4 text-lg text-muted-foreground">
        Please check your internet connection.
      </p>
      <p className="mt-2 text-sm text-muted-foreground">
        This app should work offline once all assets are cached.
      </p>
    </div>
  );
}
