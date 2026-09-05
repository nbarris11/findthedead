"use client";
import { useEffect, useState } from "react";

/** setState here runs inside the timeout's callback, not synchronously in
 *  the effect body, so it isn't the pattern set-state-in-effect flags. */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}
