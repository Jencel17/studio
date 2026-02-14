
"use client";

import { useState, useEffect, useRef, Dispatch, SetStateAction, useCallback } from 'react';
import { syncSettingsToFirestore, subscribeToSettings, type SyncedSettings } from '@/lib/firestore-sync';

// Settings keys that should sync to Firestore
const SYNCED_SETTING_KEYS: (keyof SyncedSettings)[] = [
  'confidenceThreshold',
  'autoSortEnabled',
  'autoFlashEnabled',
  'autoCaptureEnabled',
  'wakeLockEnabled',
  'isTestMode',
];

// Debounce timer for Firestore writes
let firestoreDebounceTimer: ReturnType<typeof setTimeout> | null = null;

export function usePersistentState<T>(key: string, defaultValue: T): [T, Dispatch<SetStateAction<T>>] {
  const [state, setState] = useState<T>(defaultValue);
  const [isHydrated, setIsHydrated] = useState(false);
  const isRemoteUpdate = useRef(false);

  useEffect(() => {
    // Initial load from localStorage
    const storedValue = window.localStorage.getItem(key);
    if (storedValue !== null) {
      try {
        setState(JSON.parse(storedValue));
      } catch (error) {
        console.error(`Error reading localStorage key "${key}":`, error);
      }
    }
    setIsHydrated(true);
  }, [key]);

  useEffect(() => {
    // Save to localStorage when state changes
    if (isHydrated) {
      try {
        window.localStorage.setItem(key, JSON.stringify(state));
      } catch (error) {
        console.error(`Error setting localStorage key "${key}":`, error);
      }

      // Sync to Firestore if this is a synced setting and not a remote update
      if (!isRemoteUpdate.current && SYNCED_SETTING_KEYS.includes(key as keyof SyncedSettings)) {
        if (firestoreDebounceTimer) clearTimeout(firestoreDebounceTimer);
        firestoreDebounceTimer = setTimeout(() => {
          syncSettingsToFirestore({ [key]: state } as Partial<SyncedSettings>).catch(console.error);
        }, 500);
      }
      isRemoteUpdate.current = false;
    }
  }, [key, state, isHydrated]);

  // Sync across tabs (localStorage)
  useEffect(() => {
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === key && event.newValue !== null) {
        try {
          isRemoteUpdate.current = true;
          setState(JSON.parse(event.newValue));
        } catch (error) {
          console.error(`Error parsing synced value for "${key}":`, error);
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [key]);

  // Subscribe to Firestore changes for synced settings
  useEffect(() => {
    if (!SYNCED_SETTING_KEYS.includes(key as keyof SyncedSettings)) return;

    const unsubscribe = subscribeToSettings((remoteSettings) => {
      if (key in remoteSettings) {
        const remoteValue = remoteSettings[key as keyof SyncedSettings];
        if (remoteValue !== undefined) {
          // Only update if value actually changed to avoid loops
          setState((prev) => {
            if (JSON.stringify(prev) !== JSON.stringify(remoteValue)) {
              isRemoteUpdate.current = true;
              return remoteValue as unknown as T;
            }
            return prev;
          });
        }
      }
    });

    return () => unsubscribe();
  }, [key]);

  return [state, setState];
}
