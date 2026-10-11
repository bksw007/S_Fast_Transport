"use client";

import { useEffect, useState } from "react";
import { Bai_Jamjuree } from "next/font/google";
import { onAuthStateChanged } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import type { TransportJob } from "@s-fast-transport/shared";
import CustomerPortal from "../components/CustomerPortal";
import { auth } from "@/lib/firebase-auth";
import { db } from "@/lib/firebase";
import { getUserProfile, hasApprovedAccess, subscribeTodayJobs, type UserProfile } from "@/lib/transport-repository";

const customerFont = Bai_Jamjuree({ subsets: ["thai", "latin"], weight: ["400", "500", "600", "700"], display: "swap", variable: "--font-customer" });

export default function CustomerPage() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [jobs, setJobs] = useState<TransportJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let stopProfile = () => {};
    const stopAuth = onAuthStateChanged(auth, user => {
    if (!user) { window.location.replace("/"); return; }
    stopProfile();
    stopProfile = onSnapshot(doc(db, "users", user.uid), snapshot => {
      const data = snapshot.data();
      if (!data || data.role !== "customer" || !data.customerId || data.active !== true || data.approvalStatus !== "approved") {
        setJobs([]);
        window.location.replace("/");
        return;
      }
      void getUserProfile(user.uid).then(nextProfile => {
        if (nextProfile && hasApprovedAccess(nextProfile)) setProfile(nextProfile);
      }).catch(() => { setError("ตรวจสอบสิทธิ์ไม่สำเร็จ กรุณาลองใหม่"); setLoading(false); });
    }, () => { setError("ตรวจสอบสิทธิ์ไม่สำเร็จ กรุณาลองใหม่"); setLoading(false); });
    });
    return () => { stopAuth(); stopProfile(); };
  }, []);

  useEffect(() => {
    if (!profile) return;
    return subscribeTodayJobs(profile, nextJobs => { setJobs(nextJobs); setLoading(false); }, message => { setJobs([]); setError(message); setLoading(false); });
  }, [profile]);

  if (!profile) return <main style={{ padding: 32 }} role="status">{error || "กำลังตรวจสอบสิทธิ์…"}</main>;
  return <div className={customerFont.variable}><CustomerPortal profile={profile} jobs={jobs} loading={loading} error={error} /></div>;
}
