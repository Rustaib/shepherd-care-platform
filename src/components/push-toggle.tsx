"use client";
import { useEffect, useState } from "react";
import { removePushSubscription, savePushSubscription } from "@/app/(app)/push-actions";

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

type State = "loading" | "unsupported" | "ios-install" | "denied" | "off" | "on";

/** Lets a worker turn on shift-reminder notifications on this device. */
export function PushToggle({ vapidKey }: { vapidKey: string | null }) {
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
      const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone;
      if (!vapidKey || !("serviceWorker" in navigator)) return setState("unsupported");
      if (!("PushManager" in window)) return setState(isIOS && !standalone ? "ios-install" : "unsupported");
      if (Notification.permission === "denied") return setState("denied");
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      setState(sub ? "on" : "off");
    })().catch(() => setState("unsupported"));
  }, [vapidKey]);

  const enable = async () => {
    setBusy(true);
    try {
      const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register("/sw.js"));
      await navigator.serviceWorker.ready;
      const permission = await Notification.requestPermission();
      if (permission !== "granted") return setState(permission === "denied" ? "denied" : "off");
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapidKey!) });
      const res = await savePushSubscription(sub.toJSON(), navigator.userAgent);
      setState(res.ok ? "on" : "off");
    } finally { setBusy(false); }
  };

  const disable = async () => {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) { await removePushSubscription(sub.endpoint); await sub.unsubscribe(); }
      setState("off");
    } finally { setBusy(false); }
  };

  if (state === "loading" || state === "unsupported") return null;
  return (
    <div className="card flex flex-wrap items-center gap-3">
      <div className="min-w-0 flex-1">
        <p className="font-medium">🔔 Shift reminders</p>
        <p className="text-sm text-muted">
          {state === "on" && "Notifications are on for this device. You'll also get reminder emails."}
          {state === "off" && "Get a notification the evening before each shift."}
          {state === "denied" && "Notifications are blocked. Turn them on in your phone's settings for this app."}
          {state === "ios-install" && "On iPhone, add this app to your Home Screen first (Share → Add to Home Screen), then open it from there to turn on notifications."}
        </p>
      </div>
      {state === "off" && <button className="btn-primary" disabled={busy} onClick={enable}>Turn on</button>}
      {state === "on" && <button className="btn-ghost" disabled={busy} onClick={disable}>Turn off</button>}
    </div>
  );
}
