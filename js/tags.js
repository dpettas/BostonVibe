const Tags = (() => {
  function getAll() {
    return Places.rebuildTagIndex(Places.getAll());
  }

  function filter(places, activeTags) {
    if (!activeTags || activeTags.size === 0) return places;
    return places.filter(p => [...activeTags].every(t => p.tags.includes(t)));
  }

  function search(places, query) {
    if (!query || !query.trim()) return places;
    const q = query.toLowerCase().trim();
    return places.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.description.toLowerCase().includes(q) ||
      p.tags.some(t => t.includes(q))
    );
  }

  return { getAll, filter, search };
})();
