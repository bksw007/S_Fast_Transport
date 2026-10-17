"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, FolderOpen } from "lucide-react";
import { deleteDriverProofDraft, loadDriverProofDraft, saveDriverProofDraft, type DriverProofDraft } from "@/lib/driver-proof-draft";
import { compressImageForUpload } from "@/lib/image-upload";

const proofDrafts = new Map<string, DriverProofDraft>();
function photoSlots(saved?: (File | null)[]) {
  const files = saved?.filter((file): file is File => file !== null) ?? [];
  return files.length ? files : [null];
}
export function clearDriverProofDrafts() { proofDrafts.clear(); }
export async function clearDriverProofDraft(key: string) {
  proofDrafts.delete(key);
  await deleteDriverProofDraft(key);
}

function ProofMediaPreview({ blob, alt, width, height }: { blob: Blob; alt: string; width: number; height: number }) {
  const imageRef = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const url = URL.createObjectURL(blob);
    if (imageRef.current) imageRef.current.src = url;
    return () => URL.revokeObjectURL(url);
  }, [blob]);
  // A local blob URL is assigned directly to avoid copying camera files into base64 strings.
  // eslint-disable-next-line @next/next/no-img-element
  return <img ref={imageRef} alt={alt} width={width} height={height} />;
}

export default function DriverStopProof({ stage, draftKey, onSubmit, onError }: {
  stage: "pickup" | "delivery";
  draftKey: string;
  onSubmit: (photos: File[], signature: Blob, signerName: string) => Promise<void>;
  onError?: (message: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cameraInputs = useRef<(HTMLInputElement | null)[]>([]);
  const fileInputs = useRef<(HTMLInputElement | null)[]>([]);
  const extraCameraRef = useRef<HTMLInputElement>(null);
  const extraFileRef = useRef<HTMLInputElement>(null);
  const drawing = useRef(false);
  const [photos, setPhotos] = useState<(File | null)[]>(() => photoSlots(proofDrafts.get(draftKey)?.photos));
  const [signerName, setSignerName] = useState(() => proofDrafts.get(draftKey)?.signerName ?? "");
  const [signature, setSignature] = useState<Blob | null>(() => proofDrafts.get(draftKey)?.signature ?? null);
  const [signatureOpen, setSignatureOpen] = useState(false);
  const [draftSigned, setDraftSigned] = useState(false);
  const [busy, setBusy] = useState(false);
  const [preparingPhoto, setPreparingPhoto] = useState(false);
  const [error, setError] = useState("");
  const [restoring, setRestoring] = useState(() => !proofDrafts.has(draftKey));
  const [draftStorage, setDraftStorage] = useState<"saving" | "saved" | "error">("saving");
  const previousMedia = useRef({ photos, signature });
  const saveRevision = useRef(0);

  useEffect(() => {
    if (proofDrafts.has(draftKey)) return;
    let active = true;
    void loadDriverProofDraft(draftKey).then(async saved => {
      if (!active || !saved) return;
      const draft = proofDrafts.get(draftKey) ?? saved;
      const restoredPhotos: (File | null)[] = [];
      for (const file of draft.photos ?? []) {
        if (!file) { restoredPhotos.push(null); continue; }
        try { restoredPhotos.push(await compressImageForUpload(file)); }
        catch { restoredPhotos.push(file); }
      }
      if (!active) return;
      setPhotos(photoSlots(restoredPhotos));
      setSignerName(draft.signerName ?? "");
      setSignature(draft.signature ?? null);
    }).catch(() => {
      if (active) setDraftStorage("error");
    }).finally(() => {
      if (active) setRestoring(false);
    });
    return () => { active = false; };
  }, [draftKey]);

  useEffect(() => {
    if (restoring) return;
    const draft = { photos, signerName, signature };
    proofDrafts.set(draftKey, draft);
    const mediaChanged = previousMedia.current.photos !== photos || previousMedia.current.signature !== signature;
    previousMedia.current = { photos, signature };
    let active = true;
    const revision = ++saveRevision.current;
    const persist = () => {
      setDraftStorage("saving");
      void saveDriverProofDraft(draftKey, draft).then(() => {
        if (active && revision === saveRevision.current) setDraftStorage("saved");
      }).catch(() => {
        if (active && revision === saveRevision.current) setDraftStorage("error");
      });
    };
    const timer = mediaChanged ? null : window.setTimeout(persist, 250);
    if (mediaChanged) persist();
    return () => { active = false; if (timer !== null) window.clearTimeout(timer); };
  }, [draftKey, photos, signerName, signature, restoring]);

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
  async function preparePhoto(file: File) {
    setPreparingPhoto(true);
    setError("");
    try { return await compressImageForUpload(file); }
    catch (cause) {
      setError(cause instanceof Error ? cause.message : "เตรียมรูปไม่สำเร็จ กรุณาถ่ายหรือเลือกรูปใหม่");
      return null;
    }
  }
  async function selectPhoto(index: number, file: File | undefined) {
    if (!file) return;
    try {
      const prepared = await preparePhoto(file);
      if (prepared) setPhotos(current => current.map((photo, slot) => slot === index ? prepared : photo));
    } finally { setPreparingPhoto(false); }
  }
  async function addPhoto(file: File | undefined) {
    if (!file) return;
    try {
      const prepared = await preparePhoto(file);
      if (prepared) setPhotos(current => [...current, prepared]);
    } finally { setPreparingPhoto(false); }
  }
  function removePhoto(index: number) {
    setPhotos(current => photoSlots(current.filter((_, slot) => slot !== index)));
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
      const context = canvas.getContext("2d");
      if (!context) throw new Error("บันทึกลายเซ็นไม่สำเร็จ");
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let minX = canvas.width, minY = canvas.height, maxX = -1, maxY = -1;
      for (let y = 0; y < canvas.height; y += 1) for (let x = 0; x < canvas.width; x += 1) {
        const offset = (y * canvas.width + x) * 4;
        if (pixels[offset] < 210 || pixels[offset + 1] < 210 || pixels[offset + 2] < 210) {
          minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
        }
      }
      if (maxX < minX || maxY < minY) throw new Error("กรุณาเซ็นชื่อก่อนยืนยัน");
      const padding = 20;
      const left = Math.max(0, minX - padding), top = Math.max(0, minY - padding);
      const width = Math.min(canvas.width - left, maxX - left + padding + 1);
      const height = Math.min(canvas.height - top, maxY - top + padding + 1);
      const cropped = document.createElement("canvas");
      cropped.width = width; cropped.height = height;
      const croppedContext = cropped.getContext("2d");
      if (!croppedContext) throw new Error("บันทึกลายเซ็นไม่สำเร็จ");
      croppedContext.drawImage(canvas, left, top, width, height, 0, 0, width, height);
      const blob = await new Promise<Blob>((resolve, reject) => cropped.toBlob(value => value ? resolve(value) : reject(new Error("บันทึกลายเซ็นไม่สำเร็จ")), "image/png"));
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
    if (busy || preparingPhoto || selectedPhotos.length < 1 || !signature || !signerName.trim()) return;
    setBusy(true);
    setError("");
    try {
      await onSubmit(selectedPhotos, signature, signerName);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "บันทึกหลักฐานไม่สำเร็จ";
      setError(message);
      onError?.(message);
    } finally {
      setBusy(false);
    }
  }

  if (restoring) return <section className="driver-stop-proof"><h2>กำลังเปิดแบบร่างหลักฐาน...</h2><p>กำลังคืนรูปและลายเซ็นที่บันทึกไว้ในเครื่อง</p></section>;

  return <section className="driver-stop-proof">
    <h2>{stage === "pickup" ? "ยืนยันรับสินค้า" : "ยืนยันส่งสินค้า"}</h2>
    <p>ถ่ายรูปสินค้าอย่างน้อย 1 รูป แล้วให้{stage === "pickup" ? "ผู้ส่ง" : "ผู้รับ"}เซ็นชื่อก่อนเดินทางต่อ</p>
    <p className={`driver-proof-draft-state ${draftStorage}`} role="status">{preparingPhoto ? "กำลังลดขนาดรูปก่อนเก็บแบบร่าง..." : draftStorage === "saved" ? "✓ แบบร่างเก็บไว้ในเครื่องแล้ว เปิดแอปใหม่ได้หากการส่งสะดุด" : draftStorage === "error" ? "บันทึกแบบร่างในเครื่องไม่ได้ กรุณาตรวจพื้นที่ว่างของอุปกรณ์" : "กำลังเก็บแบบร่างในเครื่อง..."}</p>
    <div className="driver-proof-photos">{photos.map((file, index) => <div className="driver-proof-photo" key={index}>
      <span>รูปสินค้า {index + 1} {photos[index] ? "✓" : "· ยังไม่มีรูป"}</span>
      {file && <ProofMediaPreview blob={file} alt={`รูปสินค้า ${index + 1}`} width={320} height={220} />}
      <div className="driver-proof-photo-actions">
        <button type="button" disabled={busy || preparingPhoto} aria-label={`ถ่ายรูปสินค้า ${index + 1}`} onClick={() => cameraInputs.current[index]?.click()}><Camera size={18} /> กล้อง</button>
        <button type="button" disabled={busy || preparingPhoto} aria-label={`เลือกรูปสินค้า ${index + 1} จากแกลอรี่หรือไฟล์`} onClick={() => fileInputs.current[index]?.click()}><FolderOpen size={18} /> ไฟล์</button>
      </div>
      <input ref={node => { cameraInputs.current[index] = node; }} className="driver-proof-file-input" type="file" accept="image/*" capture="environment" disabled={busy || preparingPhoto} tabIndex={-1} aria-hidden="true" onChange={event => { void selectPhoto(index, event.currentTarget.files?.[0]); event.currentTarget.value = ""; }} />
      <input ref={node => { fileInputs.current[index] = node; }} className="driver-proof-file-input" type="file" accept="image/*" disabled={busy || preparingPhoto} tabIndex={-1} aria-hidden="true" onChange={event => { void selectPhoto(index, event.currentTarget.files?.[0]); event.currentTarget.value = ""; }} />
      {file && <button type="button" disabled={busy} onClick={() => removePhoto(index)}>ลบรูปนี้</button>}
    </div>)}</div>
    <div className="driver-proof-add-photo"><span>เพิ่มรูป (ไม่บังคับ)</span><div className="driver-proof-photo-actions">
      <button type="button" disabled={busy || preparingPhoto || !photos[0]} onClick={() => extraCameraRef.current?.click()}><Camera size={18} /> กล้อง</button>
      <button type="button" disabled={busy || preparingPhoto || !photos[0]} onClick={() => extraFileRef.current?.click()}><FolderOpen size={18} /> ไฟล์</button>
    </div></div>
    <input ref={extraCameraRef} className="driver-proof-file-input" type="file" accept="image/*" capture="environment" disabled={busy || preparingPhoto} tabIndex={-1} aria-hidden="true" onChange={event => { void addPhoto(event.currentTarget.files?.[0]); event.currentTarget.value = ""; }} />
    <input ref={extraFileRef} className="driver-proof-file-input" type="file" accept="image/*" disabled={busy || preparingPhoto} tabIndex={-1} aria-hidden="true" onChange={event => { void addPhoto(event.currentTarget.files?.[0]); event.currentTarget.value = ""; }} />
    <label className="driver-proof-signer">ชื่อผู้เซ็น<input value={signerName} maxLength={100} disabled={busy} placeholder={stage === "pickup" ? "ชื่อผู้ส่งสินค้า" : "ชื่อผู้รับสินค้า"} onChange={event => setSignerName(event.target.value)} /></label>
    <div className="driver-proof-preview"><strong>พรีวิวลายเซ็น</strong>{signature ? <ProofMediaPreview blob={signature} alt="ลายเซ็นที่ยืนยันแล้ว" width={500} height={180} /> : <span>ยังไม่มีลายเซ็นที่ยืนยัน</span>}</div>
    <button type="button" className="driver-proof-open-signature" disabled={busy} onClick={() => { setError(""); setDraftSigned(false); setSignatureOpen(true); }}>{signature ? "✓ ยืนยันลายเซ็นแล้ว · เซ็นใหม่" : "เปิดหน้าจอเซ็นชื่อ"}</button>
    {signatureOpen && <dialog ref={dialogRef} className="driver-proof-signature-dialog" aria-label="เซ็นชื่อเต็มหน้าจอ" onCancel={event => { event.preventDefault(); setSignatureOpen(false); }}>
      <div className="driver-proof-dialog-head"><div><strong>ลายเซ็นผู้{stage === "pickup" ? "ส่ง" : "รับ"}สินค้า</strong><span>เซ็นในพื้นที่ด้านล่าง แล้วกดยืนยันลายเซ็น</span></div><button type="button" onClick={() => setSignatureOpen(false)}>ปิด</button></div>
      <canvas ref={canvasRef} aria-label="พื้นที่เซ็นชื่อ" onPointerDown={start} onPointerMove={move} onPointerUp={() => { drawing.current = false; }} onPointerCancel={() => { drawing.current = false; }} />
      {error && <p className="driver-proof-error" role="alert">{error}</p>}
      <div className="driver-proof-dialog-actions"><button type="button" onClick={clearSignature}>ล้างลายเซ็น</button><button type="button" disabled={!draftSigned} onClick={() => void confirmSignature()}>ยืนยันลายเซ็น</button></div>
    </dialog>}
    {error && <p className="driver-proof-error" role="alert">{error}</p>}
    <button type="button" className="driver-proof-submit" disabled={busy || preparingPhoto || selectedPhotos.length < 1 || !signature || !signerName.trim()} onClick={() => void submit()}>{busy ? "กำลังบันทึกหลักฐาน..." : preparingPhoto ? "กำลังเตรียมรูป..." : stage === "pickup" ? "ยืนยันรับสินค้าและไปจุดส่ง" : "ยืนยันส่งสินค้า"}</button>
  </section>;
}
