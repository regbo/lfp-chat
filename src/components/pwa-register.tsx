"use client";

import { useEffect } from "react";

export function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    let registration: ServiceWorkerRegistration | undefined;
    let reloading = false;
    const controlledAtMount = Boolean(navigator.serviceWorker.controller);

    const register = async () => {
      registration = await navigator.serviceWorker.register("/sw.js", {
        scope: "/",
        updateViaCache: "none",
      });
      await registration.update();
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
