"use client";
import { useCallback, useState } from "react";

export type GeolocationState =
  | { status: "idle" }
  | { status: "locating" }
  | { status: "granted"; latitude: number; longitude: number }
  | { status: "denied" }
  | { status: "unavailable" };

/** Wraps navigator.geolocation with the three outcomes the UI must message
 *  distinctly: no browser support, permission refused, and a live fix.
 *  Never called on the server — geolocation does not exist there. */
export function useGeolocation() {
  const [state, setState] = useState<GeolocationState>({ status: "idle" });

  const locate = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setState({ status: "unavailable" });
      return;
    }
    setState({ status: "locating" });
    navigator.geolocation.getCurrentPosition(
      (position) =>
        setState({
          status: "granted",
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        }),
      (error) =>
        setState({
          status: error.code === error.PERMISSION_DENIED ? "denied" : "unavailable",
        }),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
    );
  }, []);

  return { state, locate };
}
