const GMapsRating = (() => {
  const PROXY = 'https://api.allorigins.win/raw?url=';

  async function fetch(mapsUrl) {
    const res = await window.fetch(PROXY + encodeURIComponent(mapsUrl));
    if (!res.ok) throw new Error(`Proxy returned ${res.status}`);
    const html = await res.text();
    return _parse(html);
  }

  function _parse(html) {
    // Pattern 1 — JSON-LD structured data
    const jldMatch = html.match(/"ratingValue"\s*:\s*"?([\d.]+)"?/);
    if (jldMatch) return _validate(jldMatch[1]);

    // Pattern 2 — microdata itemprop
    const metaMatch = html.match(/itemprop="ratingValue"[^>]+content="([\d.]+)"|content="([\d.]+)"[^>]+itemprop="ratingValue"/);
    if (metaMatch) return _validate(metaMatch[1] || metaMatch[2]);

    // Pattern 3 — meta description (Google often includes "4.7 ★" in description)
    const descMatch = html.match(/<meta[^>]+name="description"[^>]+content="([^"]+)"/i)
      || html.match(/<meta[^>]+content="([^"]+)"[^>]+name="description"/i);
    if (descMatch) {
      const ratingInDesc = descMatch[1].match(/([1-5]\.\d)/);
      if (ratingInDesc) return _validate(ratingInDesc[1]);
    }

    // Pattern 4 — Google's embedded APP_INITIALIZATION_STATE JSON blob
    // Rating appears as a standalone float in arrays like [4.7, 1234, ...]
    // We look for the first plausible rating float near a large review count
    const appStateMatch = html.match(/APP_INITIALIZATION_STATE[^;]+/);
    if (appStateMatch) {
      const chunk = appStateMatch[0];
      // Look for a float 1.0–5.0 followed by a comma and a 3-6 digit number (review count)
      const ratingPattern = /([1-5]\.\d),\s*\d{3,6}/g;
      let m;
      while ((m = ratingPattern.exec(chunk)) !== null) {
        const val = _validate(m[1]);
        if (val) return val;
      }
    }

    // Pattern 5 — broad sweep: any "X.X" between 1–5 adjacent to review-count-like context
    // Catches patterns like [4.7,[..."1,234 reviews"...]]
    const broadMatch = html.match(/([1-5]\.\d)(?=[",\]]{0,4}[\d,]{3,8}(?:\s*reviews?|&#160;reviews?))/i);
    if (broadMatch) return _validate(broadMatch[1]);

    return null; // not found
  }

  function _validate(raw) {
    const n = parseFloat(raw);
    return (n >= 1 && n <= 5) ? Math.round(n * 10) / 10 : null;
  }

  return { fetch };
})();
