"use client";

import { useEffect, useState } from "react";
import { statusLabels, type TransportJob } from "@s-fast-transport/shared";
import { acceptSubcontractJob, assignSubcontractJob, canReceiveDriverJobs, subscribeOrganizationUserProfiles, type UserProfile } from "@/lib/transport-repository";
import { subscribeDrivers, subscribeVehicles, type TransportDriver, type TransportVehicle } from "@/lib/resource-repository";

export default function AssignedSubcontractJobsScreen({ jobs, actor }: { jobs: TransportJob[]; actor: UserProfile }) {
  const [drivers, setDrivers] = useState<TransportDriver[]>([]);
  const [vehicles, setVehicles] = useState<TransportVehicle[]>([]);
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [selection, setSelection] = useState<Record<string, { driverId: string; vehicleId: string }>>({});
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const organizationId = actor.organizationId || "";

  useEffect(() => {
    if (!organizationId) return;
    const onError = (error: string) => setMessage(`โหลดข้อมูลไม่สำเร็จ: ${error}`);
    const stopDrivers = subscribeDrivers(organizationId, setDrivers, onError);
    const stopVehicles = subscribeVehicles(organizationId, setVehicles, onError);
    const stopProfiles = subscribeOrganizationUserProfiles(organizationId, setProfiles, onError);
    return () => { stopDrivers(); stopVehicles(); stopProfiles(); };
  }, [organizationId]);

  async function perform(job: TransportJob, action: "accept" | "assign") {
    if (busy) return;
    setBusy(job.id);
    setMessage("");
    try {
      if (action === "accept") await acceptSubcontractJob(job.id, actor);
      else await assignSubcontractJob(job.id, selection[job.id]?.driverId || "", selection[job.id]?.vehicleId || "", actor);
      setMessage(action === "accept" ? `รับงาน ${job.workOrder} แล้ว` : `มอบหมายรถและคนขับให้ ${job.workOrder} แล้ว`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "บันทึกไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      setBusy("");
    }
  }

  const received = jobs.filter(job => job.originOrganizationId === "main" && job.organizationId === organizationId);
  const availableDrivers = drivers.filter(driver => ["available", "assigned"].includes(driver.status) && profiles.some(profile => profile.uid === driver.userUid && canReceiveDriverJobs(profile, organizationId)));
  const availableVehicles = vehicles.filter(vehicle => ["available", "assigned"].includes(vehicle.status));

  return <section className="screen resource-screen">
    <div className="resource-page-head"><div><span className="eyebrow">ASSIGNED JOBS</span><h1>งานที่ได้รับมอบหมาย</h1><p>รับงานจากบริษัทหลัก แล้วมอบหมายรถและคนขับในสังกัด</p></div></div>
    {message && <div className="resource-message" role="status">{message}</div>}
    {!received.length && <div className="resource-message">ยังไม่มีงานที่ได้รับมอบหมาย</div>}
    <div className="organization-grid">{received.map(job => {
      const selected = selection[job.id] || { driverId: "", vehicleId: "" };
      const selectedDriver = availableDrivers.find(driver => driver.id === selected.driverId);
      return <article className="organization-card" key={job.id}>
        <div className="organization-card-head"><div><small>{job.workOrder}</small><h2>{job.customer}</h2><span className="resource-status available">{statusLabels[job.status]}</span></div></div>
        <dl className="resource-details">
          <div><dt>รับสินค้า</dt><dd>{job.pickupLocation} · {job.pickupDate || "ยังไม่ระบุวัน"} {job.pickupTime || ""}</dd></div>
          <div><dt>ส่งสินค้า</dt><dd>{job.deliveryLocation} · {job.deliveryDate || "ยังไม่ระบุวัน"} {job.deliveryTime || ""}</dd></div>
          <div><dt>ผู้ติดต่อจุดรับ</dt><dd>{job.pickupContact || "—"} {job.pickupContactPhone || ""}</dd></div>
          <div><dt>ผู้ติดต่อจุดส่ง</dt><dd>{job.deliveryContact || "—"} {job.deliveryContactPhone || ""}</dd></div>
          <div><dt>สินค้า / จำนวนรอบ</dt><dd>{job.cargoType || "—"} · {job.tripCount || 1} รอบ</dd></div>
          <div><dt>ประเภทรถ</dt><dd>{job.vehicleType || "—"}</dd></div>
          {job.returnTrip && <div><dt>รับสินค้ากลับ</dt><dd>{job.returnTrip.pickupLocation} → {job.returnTrip.deliveryLocation}</dd></div>}
          {job.notes && <div><dt>หมายเหตุ</dt><dd>{job.notes}</dd></div>}
          <div><dt>รถ / คนขับ</dt><dd>{job.vehiclePlate || "รอมอบหมาย"} / {job.driverName || "รอมอบหมาย"}</dd></div>
        </dl>
        {job.status === "subcontract_accepted" && <div className="resource-form-grid">
          <label className="resource-field"><span>รถ</span><select value={selected.vehicleId} onChange={event => setSelection(current => ({ ...current, [job.id]: { ...selected, vehicleId: event.target.value } }))}><option value="">เลือกรถในสังกัด</option>{availableVehicles.map(vehicle => <option key={vehicle.id} value={vehicle.id}>{vehicle.plate}</option>)}</select></label>
          <label className="resource-field"><span>คนขับ</span><select value={selected.driverId} onChange={event => setSelection(current => ({ ...current, [job.id]: { ...selected, driverId: event.target.value } }))}><option value="">เลือกคนขับในสังกัด</option>{availableDrivers.filter(driver => !driver.assignedVehicleId || driver.assignedVehicleId === selected.vehicleId).map(driver => <option key={driver.id} value={driver.id}>{profiles.find(profile => profile.uid === driver.userUid)?.fullName || driver.name}</option>)}</select></label>
          {selectedDriver?.assignedVehicleId && selectedDriver.assignedVehicleId !== selected.vehicleId && <small role="alert">กรุณาเลือกรถประจำของคนขับ</small>}
        </div>}
        <footer>
          {job.status === "pending_subcontract" && <button className="subcontract-job-action" type="button" disabled={Boolean(busy)} onClick={() => void perform(job, "accept")}>รับงาน</button>}
          {job.status === "subcontract_accepted" && <button className="subcontract-job-action" type="button" disabled={Boolean(busy) || !selected.driverId || !selected.vehicleId || Boolean(selectedDriver?.assignedVehicleId && selectedDriver.assignedVehicleId !== selected.vehicleId)} onClick={() => void perform(job, "assign")}>มอบหมายรถและคนขับ</button>}
        </footer>
      </article>;
    })}</div>
  </section>;
}
