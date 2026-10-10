"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { AlertTriangle, CheckCircle2, LoaderCircle, WifiOff } from "lucide-react";

export type DriverNotice = { title: string; detail: string; tone: "pending" | "success" | "warning" | "error"; progress?: number; draftSaved?: boolean; draftSaveFailed?: boolean };

export default function DriverStatusDialog({ notice, onClose }: { notice: DriverNotice; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => dialog?.close();
  }, []);
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  useEffect(() => {
    if (notice.tone === "pending") return;
    const timer = window.setTimeout(() => closeRef.current(), notice.tone === "success" ? 3000 : 5000);
    return () => window.clearTimeout(timer);
  }, [notice.title, notice.detail, notice.tone]);
  const Icon = notice.tone === "success" ? CheckCircle2 : notice.tone === "error" ? WifiOff : notice.tone === "pending" ? LoaderCircle : AlertTriangle;
  return <dialog ref={dialogRef} className={`driver-status-dialog ${notice.tone}`} onCancel={event => { event.preventDefault(); onClose(); }} aria-labelledby="driver-status-title">
    <div className="driver-status-content" role="status">
      <span className="driver-status-icon"><Icon size={31} /></span>
      <h2 id="driver-status-title">{notice.title}</h2>
      <p>{notice.detail}</p>
      {notice.progress !== undefined && <div className="driver-status-progress"><div role="progressbar" aria-label="ความคืบหน้าการบันทึกหลักฐาน" aria-valuemin={0} aria-valuemax={100} aria-valuenow={notice.progress}><span style={{ width: `${notice.progress}%` }} /></div><strong>{notice.progress}%</strong></div>}
      {notice.draftSaved && <small className="driver-status-recovery">สำรองแบบร่างในเครื่องแล้ว หากปิดแอประหว่างส่ง ให้เปิดงานเดิมเพื่อส่งอีกครั้ง</small>}
      {notice.draftSaveFailed && <small className="driver-status-recovery error">สำรองแบบร่างในเครื่องไม่ได้ กรุณาเปิดแอปค้างไว้จนบันทึกเสร็จ</small>}
    </div>
  </dialog>;
}
