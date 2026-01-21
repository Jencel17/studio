
"use client";

import { useState, useEffect, Dispatch, SetStateAction } from 'react';

export function usePersistentState<T>(key: string, defaultValue: T): [T, Dispatch<SetStateAction<T>>] {
  const [state, setState] = useState<T>(defaultValue);
  const [isHydrated, setIsHydrated] = useState(false);

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
    }
  }, [key, state, isHydrated]);

  // Sync across tabs
  useEffect(() => {
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === key && event.newValue !== null) {
        try {
          setState(JSON.parse(event.newValue));
        } catch (error) {
          console.error(`Error parsing synced value for "${key}":`, error);
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [key]);

  return [state, setState];
}

