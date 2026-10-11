"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MapPin, Route } from "lucide-react";
import type { Map as LeafletMap, LayerGroup as LeafletLayerGroup } from "leaflet";
import type { JobRecord } from "@/lib/job-detail-repository";
import { buildRecordedRoute } from "@/lib/route-history";

export default function JobRouteHistory({ rows }: { rows: JobRecord[] }) {
  const route = useMemo(() => buildRecordedRoute(rows), [rows]);
  const mapElementRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const routeLayersRef = useRef<LeafletLayerGroup | null>(null);
  const [mapError, setMapError] = useState("");

  useEffect(() => {
    if (!mapElementRef.current || !route.points.length) return;
    let cancelled = false;
    void import("leaflet").then(leaflet => {
      if (cancelled || !mapElementRef.current) return;
      if (!mapRef.current) {
        mapRef.current = leaflet.map(mapElementRef.current, {
          center: [route.points[0].lat, route.points[0].lng],
          zoom: 14,
          maxZoom: 18,
          scrollWheelZoom: false
        });
        leaflet.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }).addTo(mapRef.current);
        routeLayersRef.current = leaflet.layerGroup().addTo(mapRef.current);
      }
      routeLayersRef.current?.clearLayers();

      for (const segment of route.segments) {
        if (segment.length > 1) {
          leaflet.polyline(segment.map(point => [point.lat, point.lng] as [number, number]), {
            color: "#087f78", opacity: 0.95, weight: 5
          }).addTo(routeLayersRef.current!);
        }
      }

      const addPoint = (lat: number, lng: number, color: string, radius: number) => {
        leaflet.circleMarker([lat, lng], {
          radius, color: "#ffffff", weight: 2, fillColor: color, fillOpacity: 1,
          interactive: false
        }).addTo(routeLayersRef.current!);
      };
      for (const segment of route.segments) {
        if (segment.length === 1) addPoint(segment[0].lat, segment[0].lng, "#087f78", 6);
      }
      const first = route.points[0];
      const last = route.points[route.points.length - 1];
      addPoint(first.lat, first.lng, "#277c55", 9);
      if (last !== first) addPoint(last.lat, last.lng, "#d35b3f", 9);

      const bounds = leaflet.latLngBounds(route.points.map(point => [point.lat, point.lng] as [number, number]));
      if (route.points.length > 1) mapRef.current.fitBounds(bounds, { padding: [32, 32], maxZoom: 17 });
      else mapRef.current.setView([first.lat, first.lng], 16);
      setMapError("");
    }).catch(error => {
      if (!cancelled) setMapError(error instanceof Error ? error.message : "โหลดแผนที่ไม่สำเร็จ");
    });
    return () => { cancelled = true; };
  }, [route]);

  useEffect(() => () => {
    mapRef.current?.remove();
    mapRef.current = null;
    routeLayersRef.current = null;
  }, []);

  const first = route.points[0];
  const last = route.points[route.points.length - 1];
  const mapLink = (lat: number, lng: number) => `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  const dateLabel = (timestamp: number) => new Date(timestamp).toLocaleString("th-TH");

  return <div className="job-route-history">
    <div className="job-route-history-heading">
      <div><h3><Route size={19} /> เส้นทางที่บันทึกจาก GPS</h3><p>ล่าสุดไม่เกิน 500 จุด · แสดง {route.points.length} จุด{first ? ` · ${dateLabel(first.recordedAt)} ถึง ${dateLabel(last.recordedAt)}` : " · ยังไม่มีพิกัดที่ใช้ได้"}</p></div>
      {route.gapCount > 0 && <span className="job-route-gap-count">GPS ขาดช่วง {route.gapCount} ครั้ง</span>}
    </div>
    {route.points.length > 0 && <>
      <div ref={mapElementRef} className="job-route-history-map" role="img" aria-label={`แผนที่เส้นทาง GPS ที่บันทึก ${route.points.length} จุด`} />
      {mapError && <p className="job-route-map-message" role="status">{mapError} · ยังดูพิกัดในรายการด้านล่างได้</p>}
      <p className="job-route-history-note"><span className="route-dot start" /> จุดแรกในช่วงที่แสดง <span className="route-dot end" /> จุดล่าสุด · เส้นเชื่อมจุด GPS ที่บันทึก ไม่ใช่เส้นทางนำทางที่คำนวณใหม่{route.gapCount > 0 ? " · ไม่ลากเส้นข้ามช่วง GPS ขาดหรือพิกัดกระโดดผิดปกติ" : ""}</p>
      <details className="job-route-history-points"><summary><MapPin size={16} /> ดูพิกัดที่บันทึกทั้งหมด ({route.points.length})</summary><div className="job-records job-records-locations">{[...route.points].reverse().map(point => <article key={point.id}><time>{dateLabel(point.recordedAt)}</time><strong>{(point.speed ?? 0).toFixed(1)} กม./ชม.</strong><a href={mapLink(point.lat, point.lng)} target="_blank" rel="noreferrer">{point.lat.toFixed(6)}, {point.lng.toFixed(6)} · เปิดแผนที่</a>{point.accuracy !== null && <small>ความแม่นยำประมาณ {Math.round(point.accuracy)} เมตร</small>}</article>)}</div></details>
    </>}
  </div>;
}
