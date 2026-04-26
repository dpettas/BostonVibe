// @ts-nocheck
const Geo = (() => {
    let cached = null;
    function get() {
        if (cached)
            return Promise.resolve(cached);
        return new Promise((resolve, reject) => {
            if (!navigator.geolocation) {
                reject(new Error('Geolocation is not supported by your browser.'));
                return;
            }
            navigator.geolocation.getCurrentPosition(pos => {
                cached = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                resolve(cached);
            }, err => {
                const msg = err.code === 1 ? 'Location permission denied.'
                    : err.code === 2 ? 'Location unavailable.'
                        : 'Location request timed out.';
                reject(new Error(msg));
            }, { timeout: 10000 });
        });
    }
    // Haversine distance in km
    function distance(lat1, lng1, lat2, lng2) {
        const R = 6371;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLng = (lng2 - lng1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) ** 2
            + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180)
                * Math.sin(dLng / 2) ** 2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }
    function format(km) {
        if (km < 1)
            return `${Math.round(km * 1000)} m`;
        if (km < 10)
            return `${km.toFixed(1)} km`;
        return `${Math.round(km)} km`;
    }
    function clearCache() { cached = null; }
    return { get, distance, format, clearCache };
})();
