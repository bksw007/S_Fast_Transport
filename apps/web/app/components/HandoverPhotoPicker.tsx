"use client";

import { useEffect, useRef } from "react";
import { Camera, FolderOpen, X } from "lucide-react";
import { isImageFile, MAX_SOURCE_IMAGE_BYTES } from "@/lib/image-upload";
import "./handover-photos.css";

function SelectedPhoto({ file, index, onRemove, disabled }: { file: File; index: number; onRemove: () => void; disabled: boolean }) {
  const imageRef = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const next = URL.createObjectURL(file);
    if (imageRef.current) imageRef.current.src = next;
    return () => URL.revokeObjectURL(next);
  }, [file]);
  return <div className="handover-selected-photo">
    {/* A local blob URL keeps camera photos out of base64 state. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img ref={imageRef} alt={`เอกสารนำส่งที่เลือก ${index + 1}`} />
    <button type="button" disabled={disabled} onClick={onRemove} aria-label={`เอารูปเอกสารนำส่ง ${index + 1} ออก`}><X size={17} /></button>
  </div>;
}

export default function HandoverPhotoPicker({ photos, onChange, existingCount = 0, disabled = false, onError }: {
  photos: File[];
  onChange: (photos: File[]) => void;
  existingCount?: number;
  disabled?: boolean;
  onError: (message: string) => void;
}) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const full = existingCount + photos.length >= 10;
  function addFiles(list: FileList | null) {
    const incoming = Array.from(list ?? []);
    if (!incoming.length) return;
    if (existingCount + photos.length + incoming.length > 10) { onError("แนบเอกสารนำส่งได้รวมไม่เกิน 10 รูป"); return; }
    if (incoming.some(file => !isImageFile(file) || file.size <= 0 || file.size > MAX_SOURCE_IMAGE_BYTES)) { onError("รูปเอกสารนำส่งต้องเป็นไฟล์ภาพและไม่เกิน 20 MB ต่อรูป"); return; }
    onChange([...photos, ...incoming]);
    onError("");
  }
  return <div className="handover-photo-picker">
    <small>รูปเอกสารนำส่ง {existingCount + photos.length}/10 รูป</small>
    <div className="handover-photo-actions">
      <button type="button" disabled={disabled || full} onClick={() => cameraRef.current?.click()}><Camera size={18} /> กล้อง</button>
      <button type="button" disabled={disabled || full} onClick={() => fileRef.current?.click()}><FolderOpen size={18} /> ไฟล์</button>
    </div>
    <input ref={cameraRef} type="file" accept="image/*" capture="environment" disabled={disabled} tabIndex={-1} onChange={event => { addFiles(event.currentTarget.files); event.currentTarget.value = ""; }} />
    <input ref={fileRef} type="file" accept="image/*" multiple disabled={disabled} tabIndex={-1} onChange={event => { addFiles(event.currentTarget.files); event.currentTarget.value = ""; }} />
    {photos.length > 0 && <div className="handover-selected-grid">{photos.map((file, index) => <SelectedPhoto key={`${file.name}-${file.lastModified}-${index}`} file={file} index={index} disabled={disabled} onRemove={() => onChange(photos.filter((_, position) => position !== index))} />)}</div>}
  </div>;
}
