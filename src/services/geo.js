const RADIUS_BUMI_M = 6371000;
const rad = (derajat) => (derajat * Math.PI) / 180;

// jarak dua titik di bumi dalam METER
function haversine(lat1, lng1, lat2, lng2) {
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * RADIUS_BUMI_M * Math.asin(Math.sqrt(a));
}

module.exports = { haversine };
