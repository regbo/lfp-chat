"use client";

import { useEffect } from "react";

export function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    let registration: ServiceWorkerRegistration | undefined;
    let reloading = false;
    const controlledAtMount = Boolean(navigator.serviceWorker.controller);

    const register = async () => {
      try {
        const nextRegistration = await navigator.serviceWorker.register(
          "/sw.js",
          {
            scope: "/",
            updateViaCache: "none",
          },
        );
        // Browser automation and privacy controls may intentionally suppress
        // registration while still exposing the Service Worker API.
        if (!nextRegistration) return;
        registration = nextRegistration;
        await nextRegistration.update();
      } catch {
        // PWA updates are an enhancement; chat must remain usable when a
        // browser or proxy blocks Service Worker registration.
      }
    };

    const checkForUpdate = () => {
      if (document.visibilityState === "visible") {
        void registration?.update();
      }
    };
    const reloadForUpdate = () => {
      if (!controlledAtMount || reloading) return;
      reloading = true;
      window.location.reload();
    };

    void register();
    document.addEventListener("visibilitychange", checkForUpdate);
    navigator.serviceWorker.addEventListener("controllerchange", reloadForUpdate);
    const updateTimer = window.setInterval(checkForUpdate, 5 * 60 * 1000);

    return () => {
      window.clearInterval(updateTimer);
      document.removeEventListener("visibilitychange", checkForUpdate);
      navigator.serviceWorker.removeEventListener("controllerchange", reloadForUpdate);
    };
  }, []);

  return null;
}
