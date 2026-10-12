"use client";

import { useEffect, useRef } from "react";
import type { CircleMarker, Map as LeafletMap } from "leaflet";

type Point = { lat: number; lng: number };

export default function LocationPinPicker({ value, initialCenter, onPick }: {
  value?: Point;
  initialCenter: Point;
  onPick: (point: Point) => void;
}) {
  const elementRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markerRef = useRef<CircleMarker | null>(null);
  const onPickRef = useRef(onPick);

  useEffect(() => { onPickRef.current = onPick; }, [onPick]);

  useEffect(() => {
    let cancelled = false;
    void import("leaflet").then(leaflet => {
      if (cancelled || !elementRef.current) return;
      const center = value ?? initialCenter;
      const map = leaflet.map(elementRef.current, { center: [center.lat, center.lng], zoom: value ? 16 : 11 });
      mapRef.current = map;
      leaflet.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      }).addTo(map);
      map.on("click", event => {
        const point = { lat: Number(event.latlng.lat.toFixed(7)), lng: Number(event.latlng.lng.toFixed(7)) };
        if (!markerRef.current) {
          markerRef.current = leaflet.circleMarker([point.lat, point.lng], { radius: 9, color: "#ffffff", weight: 3, fillColor: "#0758d3", fillOpacity: 1 }).addTo(map);
        } else {
          markerRef.current.setLatLng([point.lat, point.lng]);
        }
        onPickRef.current(point);
      });
      if (value) markerRef.current = leaflet.circleMarker([value.lat, value.lng], { radius: 9, color: "#ffffff", weight: 3, fillColor: "#0758d3", fillOpacity: 1 }).addTo(map);
      requestAnimationFrame(() => map.invalidateSize());
    });
    return () => { cancelled = true; mapRef.current?.remove(); mapRef.current = null; markerRef.current = null; };
  // The map is initialized once; selected points are updated by the effect below.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!value || !mapRef.current) return;
    markerRef.current?.setLatLng([value.lat, value.lng]);
  }, [value]);

  return <div ref={elementRef} className="location-pin-picker-map" role="application" aria-label="แตะบนแผนที่เพื่อยืนยันพิกัดสถานที่" />;
}
