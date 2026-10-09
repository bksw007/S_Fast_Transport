"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";

export default function DriverStopProof({ stage, onSubmit }: {
  stage: "pickup" | "delivery";
  onSubmit: (photos: File[], signature: Blob, signerName: string) => Promise<void>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const extraPhotoRef = useRef<HTMLInputElement>(null);
  const drawing = useRef(false);
  const [photos, setPhotos] = useState<(File | null)[]>([null, null]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [signerName, setSignerName] = useState("");
  const [signature, setSignature] = useState<Blob | null>(null);
  const [signatureOpen, setSignatureOpen] = useState(false);
  const [draftSigned, setDraftSigned] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const readers = photos.map((file, index) => {
      if (!file) return null;
      const reader = new FileReader();
      reader.onload = () => setPreviews(current => { const next = [...current]; next[index] = String(reader.result ?? ""); return next; });
      reader.readAsDataURL(file);
      return reader;
    });
    return () => readers.forEach(reader => reader?.abort());
  }, [photos]);

  useEffect(() => {
    if (!signatureOpen) return;
    const dialog = dialogRef.current;
    dialog?.showModal();
    const frame = requestAnimationFrame(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const scale = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(canvas.clientWidth * scale));
      canvas.height = Math.max(1, Math.round(canvas.clientHeight * scale));
      const context = canvas.getContext("2d");
      if (context) { context.fillStyle = "#ffffff"; context.fillRect(0, 0, canvas.width, canvas.height); }
    });
    return () => { cancelAnimationFrame(frame); dialog?.close(); };
  }, [signatureOpen]);

  const selectedPhotos = photos.filter((file): file is File => file !== null);
  function removePhoto(index: number) {
    setPhotos(current => index < 2 ? current.map((file, slot) => slot === index ? null : file) : current.filter((_, slot) => slot !== index));
  }
  function clearSignature() {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    setDraftSigned(false);
  }
  async function confirmSignature() {
    const canvas = canvasRef.current;
    if (!canvas || !draftSigned) return;
    try {
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error("บันทึกลายเซ็นไม่สำเร็จ")), "image/png"));
      setSignature(blob);
      setSignatureOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "บันทึกลายเซ็นไม่สำเร็จ");
    }
  }

  function point(event: React.PointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: (event.clientX - rect.left) * event.currentTarget.width / rect.width, y: (event.clientY - rect.top) * event.currentTarget.height / rect.height };
  }
  function start(event: React.PointerEvent<HTMLCanvasElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    const context = canvasRef.current?.getContext("2d");
    if (!context) return;
    const { x, y } = point(event);
    context.lineWidth = 4;
    context.lineCap = "round";
    context.strokeStyle = "#102235";
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(x + 0.1, y + 0.1);
    context.stroke();
    drawing.current = true;
  }
  function move(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const context = canvasRef.current?.getContext("2d");
    if (!context) return;
    const { x, y } = point(event);
    context.lineTo(x, y);
    context.stroke();
    setDraftSigned(true);
  }
  async function submit() {
    if (busy || selectedPhotos.length < 2 || !signature || !signerName.trim()) return;
    setBusy(true);
    setError("");
    try {
      await onSubmit(selectedPhotos, signature, signerName);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "บันทึกหลักฐานไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  return <section className="driver-stop-proof">
    <h2>{stage === "pickup" ? "ยืนยันรับสินค้า" : "ยืนยันส่งสินค้า"}</h2>
    <p>ถ่ายรูปสินค้าอย่างน้อย 2 รูป แล้วให้{stage === "pickup" ? "ผู้ส่ง" : "ผู้รับ"}เซ็นชื่อก่อนเดินทางต่อ</p>
    <div className="driver-proof-photos">{photos.map((file, index) => <div className="driver-proof-photo" key={index}>
      <span>รูปสินค้า {index + 1} {photos[index] ? "✓" : "· ยังไม่มีรูป"}</span>
      {previews[index] && photos[index] && <Image unoptimized src={previews[index]} alt={`รูปสินค้า ${index + 1}`} width={320} height={220} />}
      <input type="file" accept="image/*" capture="environment" disabled={busy} onChange={event => setPhotos(current => current.map((file, slot) => slot === index ? event.target.files?.[0] ?? file : file))} />
      {file && <button type="button" disabled={busy} onClick={() => removePhoto(index)}>ลบรูปนี้</button>}
    </div>)}</div>
    <button type="button" className="driver-proof-add-photo" disabled={busy || !photos[0] || !photos[1]} onClick={() => extraPhotoRef.current?.click()}>＋ เพิ่มรูป (ไม่บังคับ)</button>
    <input ref={extraPhotoRef} className="driver-proof-extra-input" type="file" accept="image/*" disabled={busy} onChange={event => { const file = event.target.files?.[0]; if (file) setPhotos(current => [...current, file]); event.currentTarget.value = ""; }} />
    <label className="driver-proof-signer">ชื่อผู้เซ็น<input value={signerName} maxLength={100} disabled={busy} placeholder={stage === "pickup" ? "ชื่อผู้ส่งสินค้า" : "ชื่อผู้รับสินค้า"} onChange={event => setSignerName(event.target.value)} /></label>
    <button type="button" className="driver-proof-open-signature" disabled={busy} onClick={() => { setError(""); setDraftSigned(false); setSignatureOpen(true); }}>{signature ? "✓ ยืนยันลายเซ็นแล้ว · เซ็นใหม่" : "เปิดหน้าจอเซ็นชื่อ"}</button>
    {signatureOpen && <dialog ref={dialogRef} className="driver-proof-signature-dialog" aria-label="เซ็นชื่อเต็มหน้าจอ" onCancel={event => { event.preventDefault(); setSignatureOpen(false); }}>
      <div className="driver-proof-dialog-head"><div><strong>ลายเซ็นผู้{stage === "pickup" ? "ส่ง" : "รับ"}สินค้า</strong><span>เซ็นในพื้นที่ด้านล่าง แล้วกดยืนยันลายเซ็น</span></div><button type="button" onClick={() => setSignatureOpen(false)}>ปิด</button></div>
      <canvas ref={canvasRef} aria-label="พื้นที่เซ็นชื่อ" onPointerDown={start} onPointerMove={move} onPointerUp={() => { drawing.current = false; }} onPointerCancel={() => { drawing.current = false; }} />
      {error && <p className="driver-proof-error" role="alert">{error}</p>}
      <div className="driver-proof-dialog-actions"><button type="button" onClick={clearSignature}>ล้างลายเซ็น</button><button type="button" disabled={!draftSigned} onClick={() => void confirmSignature()}>ยืนยันลายเซ็น</button></div>
    </dialog>}
    {error && <p className="driver-proof-error" role="alert">{error}</p>}
    <button type="button" className="driver-proof-submit" disabled={busy || selectedPhotos.length < 2 || !signature || !signerName.trim()} onClick={() => void submit()}>{busy ? "กำลังบันทึกหลักฐาน..." : stage === "pickup" ? "ยืนยันรับสินค้าและไปจุดส่ง" : "ยืนยันส่งสินค้า"}</button>
  </section>;
}
