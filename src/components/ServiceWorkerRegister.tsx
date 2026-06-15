"use client";

import { useEffect } from "react";

export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    // En desarrollo, el service worker interfiere con chunks/HMR de Next.
    if (process.env.NODE_ENV !== "production") {
      navigator.serviceWorker
        .getRegistrations()
        .then((registrations) =>
          Promise.all(registrations.map((registration) => registration.unregister()))
        )
        .catch(() => {});
      return;
    }

    // Si ya había un SW controlando la página, cuando entre uno nuevo (tras un
    // deploy) recargamos una sola vez para tomar el diseño/CSS actualizado.
    const hadController = Boolean(navigator.serviceWorker.controller);
    let refreshing = false;
    const onControllerChange = () => {
      if (refreshing || !hadController) return;
      refreshing = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener(
      "controllerchange",
      onControllerChange
    );

    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => {
        // Fuerza una comprobación de actualización al abrir la app.
        reg.update().catch(() => {});
      })
      .catch(() => {
        // Silencioso: el kiosko sigue funcionando con IndexedDB aunque falle el SW.
      });

    return () =>
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        onControllerChange
      );
  }, []);
  return null;
}
