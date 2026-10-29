/*
 * Route maths shared by the Node server and the browser demo.
 *
 * Trucks report through different tracking providers. HaulDesk does not
 * depend on any one of them: it estimates a truck's position from its
 * departure time, the route and an average speed, and would replace that
 * estimate with a live GPS fix when a provider feed is connected.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.HaulGeo = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  var EARTH_RADIUS_KM = 6371;
  var ROAD_FACTOR = 1.25;      // roads are longer than a straight line
  var AVG_SPEED_KMH = 55;      // loaded side-tipper average incl. stops

  function toRad(d) { return (d * Math.PI) / 180; }

  // Straight-line distance between two points in km
  function haversineKm(lat1, lng1, lat2, lng2) {
    var dLat = toRad(lat2 - lat1);
    var dLng = toRad(lng2 - lng1);
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
  }

  function roadKm(origin, dest) {
    return haversineKm(+origin.lat, +origin.lng, +dest.lat, +dest.lng) * ROAD_FACTOR;
  }

  function tripMinutes(origin, dest) {
    return Math.round((roadKm(origin, dest) / AVG_SPEED_KMH) * 60);
  }

  // Where is a truck that left `origin` at `departedAt` heading for `dest`?
  function estimatePosition(origin, dest, departedAt, now) {
    var total = tripMinutes(origin, dest);
    var elapsed = (new Date(now) - new Date(departedAt)) / 60000;
    var progress = Math.max(0, Math.min(1, elapsed / total));
    // gentle curve so routes do not look like ruler lines on the map
    var lat = +origin.lat + (+dest.lat - +origin.lat) * progress;
    var lng = +origin.lng + (+dest.lng - +origin.lng) * progress;
    var bend = Math.sin(progress * Math.PI) * 0.04;
    return {
      lat: +(lat + bend).toFixed(5),
      lng: +(lng - bend).toFixed(5),
      progress: +progress.toFixed(3),
      eta: new Date(new Date(departedAt).getTime() + total * 60000).toISOString(),
      overdue: elapsed > total * 1.3
    };
  }

  return {
    haversineKm: haversineKm,
    roadKm: roadKm,
    tripMinutes: tripMinutes,
    estimatePosition: estimatePosition,
    AVG_SPEED_KMH: AVG_SPEED_KMH
  };
});
