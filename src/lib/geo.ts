const R_KM = 6371;
const rad = (d: number) => (d * Math.PI) / 180;

export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Before a booking is confirmed, drivers only see an approximate spot (about 100 m), so a
 * host's home is not pinpointed for everyone who browses.
 */
export function approximatePoint(lat: number, lng: number): { lat: number; lng: number } {
  return { lat: Math.round(lat * 1000) / 1000, lng: Math.round(lng * 1000) / 1000 };
}

export function formatDistance(km: number): string {
  if (km < 1) return `${Math.max(50, Math.round((km * 1000) / 50) * 50)} m`;
  return `${km.toFixed(km < 10 ? 1 : 0)} km`;
}

export function inIndia(lat: number, lng: number): boolean {
  return lat >= 6 && lat <= 37.5 && lng >= 68 && lng <= 98;
}
