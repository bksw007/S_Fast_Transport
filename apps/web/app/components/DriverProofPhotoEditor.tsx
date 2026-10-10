"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Camera, RefreshCw } from "lucide-react";
import { getDownloadURL, ref } from "firebase/storage";
import type { TransportJob } from "@s-fast-transport/shared";
import { storage } from "@/lib/firebase";
import { replaceStopProofPhoto, type UserProfile } from "@/lib/transport-repository";

export default function DriverProofPhotoEditor({ job, actor, onNotice }: {
  job: TransportJob;
  actor: UserProfile;
  onNotice: (notice: { title: string; detail: string; tone: "success" | "error" }) => void;
}) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [busyPath, setBusyPath] = useState("");
  const paths = [...(job.pickupProof?.photoPaths ?? []), ...(job.deliveryProof?.photoPaths ?? [])];
  const pathsKey = paths.join("|");
  useEffect(() => {
    let active = true;
    void Promise.all(paths.map(async path => {
      try { return [path, await getDownloadURL(ref(storage, path))] as const; }
      catch { return [path, ""] as const; }
    })).then(entries => { if (active) setUrls(Object.fromEntries(entries)); });
    return () => { active = false; };
  // The key changes whenever a saved photo is replaced.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathsKey]);

  if (!paths.length) return null;

  return <details className="driver-proof-editor">
    <summary><Camera size={19} /> <span>รูปหลักฐานที่บันทึกแล้ว</span><small>แตะเพื่อดูหรือเปลี่ยนรูป</small></summary>
    <p>แตะเปลี่ยนรูปที่ต้องการได้ รูปเดิมจะยังอยู่ในประวัติการแก้ไข</p>
    {(["pickup", "delivery"] as const).map(stage => {
      const proof = stage === "pickup" ? job.pickupProof : job.deliveryProof;
      if (!proof?.photoPaths.length) return null;
      return <div key={stage} className="driver-proof-editor-stage">
        <strong>{stage === "pickup" ? "จุดรับสินค้า" : "จุดส่งสินค้า"}</strong>
        <div className="driver-proof-editor-grid">{proof.photoPaths.map((path, index) => <div className="driver-proof-editor-photo" key={path}>
          {urls[path] ? <Image unoptimized src={urls[path]} alt={`รูป${stage === "pickup" ? "จุดรับ" : "จุดส่ง"} ${index + 1}`} width={320} height={220} /> : <span>กำลังโหลดรูป</span>}
          <label className={busyPath ? "disabled" : ""}><RefreshCw size={16} /> {busyPath === path ? "กำลังเปลี่ยน..." : `เปลี่ยนรูปที่ ${index + 1}`}
            <input type="file" accept="image/*" disabled={Boolean(busyPath)} onChange={async event => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = "";
              if (!file) return;
              setBusyPath(path);
              try {
                await replaceStopProofPhoto(job, stage, index, file, actor);
                onNotice({ title: "เปลี่ยนรูปแล้ว", detail: `บันทึกรูป${stage === "pickup" ? "จุดรับ" : "จุดส่ง"}ที่ ${index + 1} แล้ว และเก็บรูปเดิมไว้ในประวัติ`, tone: "success" });
              } catch (error) {
                onNotice({ title: "เปลี่ยนรูปไม่สำเร็จ", detail: error instanceof Error ? error.message : "กรุณาลองอีกครั้ง", tone: "error" });
              } finally { setBusyPath(""); }
            }} />
          </label>
        </div>)}</div>
      </div>;
    })}
  </details>;
}
