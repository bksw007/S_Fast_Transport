"use client";

import { useEffect, useState } from "react";
import { Download } from "lucide-react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

const INSTALL_PROMPT_CHANGED = "sfast-install-prompt-changed";
let savedInstallPrompt: BeforeInstallPromptEvent | null = null;
let captureStarted = false;

function announcePromptChange() {
  window.dispatchEvent(new Event(INSTALL_PROMPT_CHANGED));
}

export function preparePwaInstallPromptCapture() {
  if (typeof window === "undefined" || captureStarted) return;
  captureStarted = true;
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    savedInstallPrompt = event as BeforeInstallPromptEvent;
    announcePromptChange();
  });
  window.addEventListener("appinstalled", () => {
    savedInstallPrompt = null;
    announcePromptChange();
  });
}

function installedAsApp() {
  const iosNavigator = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia("(display-mode: standalone)").matches || iosNavigator.standalone === true;
}

export default function PwaInstallButton() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(savedInstallPrompt);
  const [browserMode, setBrowserMode] = useState(false);

  useEffect(() => {
    preparePwaInstallPromptCapture();
    const displayMode = window.matchMedia("(display-mode: standalone)");
    const updateDisplayMode = () => setBrowserMode(!installedAsApp());
    const syncInstallPrompt = () => {
      setDeferredPrompt(savedInstallPrompt);
      if (savedInstallPrompt) setBrowserMode(true);
    };

    updateDisplayMode();
    syncInstallPrompt();
    window.addEventListener(INSTALL_PROMPT_CHANGED, syncInstallPrompt);
    displayMode.addEventListener("change", updateDisplayMode);
    return () => {
      window.removeEventListener(INSTALL_PROMPT_CHANGED, syncInstallPrompt);
      displayMode.removeEventListener("change", updateDisplayMode);
    };
  }, []);

  async function install() {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      savedInstallPrompt = null;
      setDeferredPrompt(null);
      if (choice.outcome === "accepted") setBrowserMode(false);
      return;
    }

    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    window.alert(ios
      ? "เปิดเมนูแชร์ของ Safari แล้วเลือก ‘เพิ่มไปยังหน้าจอโฮม’"
      : "เปิดเมนูเบราว์เซอร์ ⋮ แล้วเลือก ‘ติดตั้งแอป’ หรือ ‘เพิ่มลงในหน้าจอหลัก’");
  }

  if (!browserMode) return null;
  return (
    <button className="install-action" type="button" aria-label="ติดตั้งแอป" title="ติดตั้งแอปบนเครื่อง" onClick={() => void install()}>
      <Download size={19} />
      <span>ติดตั้ง</span>
    </button>
  );
}
