import React from 'react';
import MapView, { Marker } from 'react-native-maps';

// points: [{ label, lat, lng }] - fits the map around all of them
export default function MapBox({ points }) {
  const pts = points.filter((p) => p.lat != null && p.lng != null);
  if (!pts.length) return null;
  const lat = pts.map((p) => p.lat), lng = pts.map((p) => p.lng);
  const region = {
    latitude: (Math.max(...lat) + Math.min(...lat)) / 2, longitude: (Math.max(...lng) + Math.min(...lng)) / 2,
    latitudeDelta: Math.max(0.01, (Math.max(...lat) - Math.min(...lat)) * 1.8),
    longitudeDelta: Math.max(0.01, (Math.max(...lng) - Math.min(...lng)) * 1.8),
  };
  return (
    <MapView key={pts.length} style={{ height: 200, borderRadius: 14, marginBottom: 12 }} initialRegion={region}>
      {pts.map((p) => <Marker key={p.label} coordinate={{ latitude: p.lat, longitude: p.lng }} title={p.label} />)}
    </MapView>
  );
}
