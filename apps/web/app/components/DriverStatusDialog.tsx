"use client";

import { useEffect, useRef } from "react";
import { AlertTriangle, CheckCircle2, WifiOff } from "lucide-react";

export type DriverNotice = { title: string; detail: string; tone: "success" | "warning" | "error" };

export default function DriverStatusDialog({ notice, onClose }: { notice: DriverNotice; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  const Icon = notice.tone === "success" ? CheckCircle2 : notice.tone === "error" ? WifiOff : AlertTriangle;
  return <dialog ref={dialogRef} className={`driver-status-dialog ${notice.tone}`} onCancel={event => { event.preventDefault(); onClose(); }} aria-labelledby="driver-status-title">
    <div className="driver-status-content" role="status">
      <span className="driver-status-icon"><Icon size={31} /></span>
      <h2 id="driver-status-title">{notice.title}</h2>
      <p>{notice.detail}</p>
      <button type="button" autoFocus onClick={onClose}>รับทราบ</button>
    </div>
  </dialog>;
}
