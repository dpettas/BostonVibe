const Places = (() => {
  function _migrate(p) {
    let result = p;
    if (!Array.isArray(result.photos)) {
      const photos = result.imageUrl ? [result.imageUrl] : [];
      const { imageUrl, ...rest } = result;
      result = { ...rest, photos };
    }
    if (!result.category) {
      result = { ...result, category: 'restaurant' };
    }
    return result;
  }

  function getAll() {
    const raw = Store.load(Store.KEYS.PLACES) || [];
    return raw
      .map(_migrate)
      .sort((a, b) => new Date(b.dateAdded) - new Date(a.dateAdded));
  }

  function getById(id) {
    return getAll().find(p => p.id === id) || null;
  }

  async function add(data) {
    const places = Store.load(Store.KEYS.PLACES) || [];
    const place = {
      id: (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID()
        : Date.now().toString(),
      name: data.name.trim(),
      description: data.description.trim(),
      address: (data.address || '').trim(),
      mapLink: data.mapLink.trim(),
      tags: normalizeTags(data.tags),
      photos: Array.isArray(data.photos) ? data.photos : [],
      visited: data.visited || false,
      rating: data.visited ? (data.rating || 0) : 0,
      googleRating: data.googleRating || 0,
      category: data.category || 'restaurant',
      dateAdded: new Date().toISOString(),
    };
    places.push(place);
    const saved = await Store.save(Store.KEYS.PLACES, places);
    if (!saved) return null;
    return place;
  }

  async function update(id, data) {
    const places = Store.load(Store.KEYS.PLACES) || [];
    const idx = places.findIndex(p => p.id === id);
    if (idx === -1) return null;
    places[idx] = {
      ..._migrate(places[idx]),
      name: data.name.trim(),
      description: data.description.trim(),
      address: (data.address || '').trim(),
      mapLink: data.mapLink.trim(),
      tags: normalizeTags(data.tags),
      photos: Array.isArray(data.photos) ? data.photos : (places[idx].photos || []),
      visited: data.visited || false,
      rating: data.visited ? (data.rating || 0) : 0,
      googleRating: data.googleRating || 0,
      category: data.category || 'restaurant',
    };
    const saved = await Store.save(Store.KEYS.PLACES, places);
    return saved ? places[idx] : null;
  }

  async function remove(id) {
    const places = (Store.load(Store.KEYS.PLACES) || []).filter(p => p.id !== id);
    return Store.save(Store.KEYS.PLACES, places);
  }

  function rebuildTagIndex(places) {
    const all = places || Store.load(Store.KEYS.PLACES) || [];
    const tagSet = new Set();
    all.forEach(p => p.tags.forEach(t => tagSet.add(t)));
    return Array.from(tagSet).sort();
  }

  function normalizeTags(raw) {
    if (Array.isArray(raw)) return [...new Set(raw.map(t => t.toLowerCase().trim()).filter(Boolean))];
    if (typeof raw === 'string') {
      return [...new Set(raw.split(',').map(t => t.toLowerCase().trim()).filter(Boolean))];
    }
    return [];
  }

  return { getAll, getById, add, update, remove, rebuildTagIndex };
})();
