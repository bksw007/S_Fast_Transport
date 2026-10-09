"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";

export default function DriverStopProof({ stage, onSubmit }: {
  stage: "pickup" | "delivery";
  onSubmit: (photos: File[], signature: Blob, signerName: string) => Promise<void>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [photos, setPhotos] = useState<(File | null)[]>([null, null]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [signerName, setSignerName] = useState("");
  const [signed, setSigned] = useState(false);
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

  function point(event: React.PointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: (event.clientX - rect.left) * event.currentTarget.width / rect.width, y: (event.clientY - rect.top) * event.currentTarget.height / rect.height };
  }
  function start(event: React.PointerEvent<HTMLCanvasElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    const context = canvasRef.current?.getContext("2d");
    if (!context) return;
    const { x, y } = point(event);
    context.lineWidth = 3;
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
    setSigned(true);
  }
  async function submit() {
    if (busy || photos.some(file => !file) || !signed || !signerName.trim()) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    setBusy(true);
    setError("");
    try {
      const signature = await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("บันทึกลายเซ็นไม่สำเร็จ")), "image/png"));
      await onSubmit(photos as File[], signature, signerName);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "บันทึกหลักฐานไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  return <section className="driver-stop-proof">
    <h2>{stage === "pickup" ? "ยืนยันรับสินค้า" : "ยืนยันส่งสินค้า"}</h2>
    <p>ถ่ายรูปสินค้าอย่างน้อย 2 รูป แล้วให้{stage === "pickup" ? "ผู้ส่ง" : "ผู้รับ"}เซ็นชื่อก่อนเดินทางต่อ</p>
    <div className="driver-proof-photos">{[0, 1].map(index => <label key={index}>
      <span>รูปสินค้า {index + 1} {photos[index] ? "✓" : "· ยังไม่มีรูป"}</span>
      {previews[index] && photos[index] && <Image unoptimized src={previews[index]} alt={`รูปสินค้า ${index + 1}`} width={320} height={220} />}
      <input type="file" accept="image/*" capture="environment" disabled={busy} onChange={event => setPhotos(current => current.map((file, slot) => slot === index ? event.target.files?.[0] ?? file : file))} />
      {photos[index] && <button type="button" disabled={busy} onClick={() => setPhotos(current => current.map((file, slot) => slot === index ? null : file))}>ลบรูปนี้</button>}
    </label>)}</div>
    <label className="driver-proof-signer">ชื่อผู้เซ็น<input value={signerName} maxLength={100} disabled={busy} placeholder={stage === "pickup" ? "ชื่อผู้ส่งสินค้า" : "ชื่อผู้รับสินค้า"} onChange={event => setSignerName(event.target.value)} /></label>
    <div className="driver-proof-signature"><span>ลายเซ็นบนหน้าจอ</span><canvas ref={canvasRef} width={700} height={240} aria-label="ช่องเซ็นชื่อ" onPointerDown={start} onPointerMove={move} onPointerUp={() => { drawing.current = false; }} onPointerCancel={() => { drawing.current = false; }} /></div>
    <button type="button" className="driver-proof-clear" disabled={busy} onClick={() => { canvasRef.current?.getContext("2d")?.clearRect(0, 0, 700, 240); setSigned(false); }}>ล้างลายเซ็น</button>
    {error && <p className="driver-proof-error" role="alert">{error}</p>}
    <button type="button" className="driver-proof-submit" disabled={busy || photos.some(file => !file) || !signed || !signerName.trim()} onClick={() => void submit()}>{busy ? "กำลังบันทึกหลักฐาน..." : stage === "pickup" ? "ยืนยันรับสินค้าและไปจุดส่ง" : "ยืนยันส่งสินค้า"}</button>
  </section>;
}
