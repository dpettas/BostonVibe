// @ts-nocheck
const { useEffect, useMemo, useRef, useState } = React;
const h = React.createElement;

const APP_VERSION = '2026-04-25-foodblogger-theme-1';

const CATEGORY_META = {
  restaurant: { label: '🍽 Restaurant', className: 'category-badge--restaurant' },
  bar: { label: '🍸 Bar', className: 'category-badge--bar' },
  shop: { label: '🛍 Shop', className: 'category-badge--shop' },
  experience: { label: '🏞 Experience', className: 'category-badge--experience' },
};

function coordsOf(place) {
  const raw = String(place.mapLink || '').trim();
  if (!raw) return null;

  const decoded = (() => {
    try { return decodeURIComponent(raw); }
    catch { return raw; }
  })();

  const patterns = [
    /^(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)$/,
    /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/,
    /@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)(?:,|z|$)/,
    /[?&](?:q|ll)=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)(?:&|$)/,
  ];

  for (const pattern of patterns) {
    const match = decoded.match(pattern);
    if (!match) continue;
    const lat = parseFloat(match[1]);
    const lng = parseFloat(match[2]);
    if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
      return { lat, lng };
    }
  }

  return null;
}

function coordsFromText(text) {
  return coordsOf({ mapLink: text });
}

function normalizeSearchText(value) {
  return String(value || '')
    .trim()
    .toLocaleLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function mapsSearchHref(query) {
  const clean = String(query || '').replace(/\s+/g, ' ').trim();
  return clean ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(clean)}` : '';
}

function placeSearchQuery(place) {
  return [place.name, place.address].filter(Boolean).join(' ');
}

function placeAddressHref(place) {
  return mapsSearchHref(placeSearchQuery(place) || place.address || place.name);
}

function resolveDistanceOrigin(input, places) {
  const raw = String(input || '').trim();
  if (!raw) return { error: 'Type a saved place name, paste a Maps link, or enter lat, lng.' };

  const manualCoord = coordsFromText(raw);
  if (manualCoord) return { loc: manualCoord, label: 'custom location' };

  const query = normalizeSearchText(raw);
  const candidates = places
    .map(place => ({ place, coord: coordsOf(place) }))
    .filter(item => item.coord);
  const exact = candidates.find(({ place }) =>
    normalizeSearchText(place.name) === query || normalizeSearchText(place.address) === query
  );
  const partial = exact || candidates.find(({ place }) =>
    normalizeSearchText(place.name).includes(query) || normalizeSearchText(place.address).includes(query)
  );

  if (partial) return { loc: partial.coord, label: partial.place.name };
  const placeWithoutCoords = places.find(place =>
    normalizeSearchText(place.name) === query || normalizeSearchText(place.address) === query
  );
  if (placeWithoutCoords) return { error: `"${placeWithoutCoords.name}" does not have usable coordinates.` };

  return { error: 'No saved place matched. Use a saved place name, Maps link, or lat, lng.' };
}

function mapsHref(place) {
  const raw = String(place.mapLink || '').trim();
  if (raw.startsWith('http')) return raw;

  const coord = coordsOf(place);
  if (coord) return placeAddressHref(place) || mapsSearchHref(`${coord.lat},${coord.lng}`);
  if (place.address || place.name) return placeAddressHref(place);
  return '';
}

function App() {
  const [ready, setReady] = useState(false);
  const [places, setPlaces] = useState([]);
  const [activeTags, setActiveTags] = useState(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [userLoc, setUserLoc] = useState(null);
  const [sortByDistance, setSortByDistance] = useState(false);
  const [distanceBusy, setDistanceBusy] = useState(false);
  const [distanceError, setDistanceError] = useState('');
  const [distanceQuery, setDistanceQuery] = useState('');
  const [distanceOriginLabel, setDistanceOriginLabel] = useState('');
  const [modal, setModal] = useState(null);

  const refresh = () => setPlaces(Places.getAll());

  useEffect(() => {
    Store.init().then(() => {
      refresh();
      setReady(true);
    });
  }, []);

  useEffect(() => {
    document.body.classList.toggle('no-scroll', Boolean(modal));
    const onKey = (e) => { if (e.key === 'Escape') setModal(null); };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.classList.remove('no-scroll');
      document.removeEventListener('keydown', onKey);
    };
  }, [modal]);

  useEffect(() => {
    const onPaste = async (e) => {
      const imageItem = Array.from(e.clipboardData?.items || []).find(i => i.type.startsWith('image/'));
      if (!imageItem || modal?.type !== 'detail') return;
      const file = imageItem.getAsFile();
      if (!file) return;
      e.preventDefault();
      const photoUrl = await ImageUtils.resizeAndSave(file);
      const updated = await Places.update(modal.place.id, {
        ...modal.place,
        photos: [...(modal.place.photos || []), photoUrl],
        tags: modal.place.tags.join(','),
      });
      if (updated) {
        refresh();
        setModal({ type: 'detail', place: updated });
      }
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [modal]);

  const allTags = useMemo(() => Places.rebuildTagIndex(places), [places]);

  const filtered = useMemo(() => {
    let next = Tags.search(places, searchQuery);
    next = Tags.filter(next, activeTags);
    if (activeCategory !== 'all') next = next.filter(p => (p.category || 'restaurant') === activeCategory);
    if (sortByDistance && userLoc) {
      next = [...next].sort((a, b) => {
        const ca = coordsOf(a), cb = coordsOf(b);
        const da = ca ? Geo.distance(userLoc.lat, userLoc.lng, ca.lat, ca.lng) : Infinity;
        const db = cb ? Geo.distance(userLoc.lat, userLoc.lng, cb.lat, cb.lng) : Infinity;
        return da - db;
      });
    }
    return next;
  }, [places, searchQuery, activeTags, activeCategory, sortByDistance, userLoc]);

  function clearDistanceSort() {
    setSortByDistance(false);
    setDistanceOriginLabel('');
    setDistanceError('');
  }

  async function toggleDistanceSort() {
    setDistanceError('');
    if (sortByDistance && distanceOriginLabel === 'current location') {
      clearDistanceSort();
      return;
    }
    setDistanceBusy(true);
    try {
      const loc = await Geo.get();
      setUserLoc(loc);
      setSortByDistance(true);
      setDistanceOriginLabel('current location');
    } catch (e) {
      setDistanceError(e.message);
    } finally {
      setDistanceBusy(false);
    }
  }

  function applyDistanceQuery(e) {
    e?.preventDefault();
    const result = resolveDistanceOrigin(distanceQuery, places);
    if (result.error) {
      setDistanceError(result.error);
      return;
    }
    setUserLoc(result.loc);
    setDistanceOriginLabel(result.label);
    setSortByDistance(true);
    setDistanceError('');
  }

  async function removePlace(place) {
    if (!confirm(`Delete "${place.name}"? This cannot be undone.`)) return;
    const removed = await Places.remove(place.id);
    if (removed) {
      refresh();
      setModal(null);
    }
  }

  if (!ready) {
    return h('div', { className: 'empty-state app-loading' }, h('span', { className: 'empty-icon' }, '⌛'), h('p', null, 'Loading places...'));
  }

  return h(React.Fragment, null,
    h('div', { className: 'utility-bar' },
      h('span', null, 'Find places worth saving'),
      h('div', { className: 'utility-actions' },
        h('span', null, 'Login'),
        h('span', null, 'Register'),
        h('span', null, `${places.length} saved`)
      )
    ),
    h('header', null,
      h('span', { className: 'site-title' }, h('span', { className: 'brand-mark', 'aria-hidden': true }, 'P'), 'PlaceBlogger'),
      h('nav', { className: 'main-nav', 'aria-label': 'Primary' },
        h('button', { type: 'button', onClick: () => setActiveCategory('all') }, 'Categories'),
        h('button', { type: 'button', onClick: () => setModal({ type: 'form', place: null }) }, 'Submit Place'),
        h('button', { type: 'button', onClick: () => setActiveCategory('restaurant') }, 'Restaurants'),
        h('button', { type: 'button', onClick: () => setActiveCategory('bar') }, 'Bars'),
        h('button', { type: 'button', onClick: () => setActiveCategory('shop') }, 'Shops'),
        h('button', { type: 'button', onClick: () => setActiveCategory('experience') }, 'Experiences')
      )
    ),
    h('div', { className: 'breadcrumb-bar' },
      h('span', null, 'Home'),
      h('span', { 'aria-hidden': true }, '›'),
      h('span', null, activeCategory === 'all' ? 'All places' : CATEGORY_META[activeCategory]?.label.replace(/^\S+\s/, '') || 'Places')
    ),
    h('div', { className: 'layout' },
      h(Sidebar, {
        allTags, activeTags, setActiveTags, searchQuery, setSearchQuery,
        activeCategory, setActiveCategory, sortByDistance, distanceBusy,
        distanceError, toggleDistanceSort, distanceQuery, setDistanceQuery,
        distanceOriginLabel, applyDistanceQuery, clearDistanceSort, places,
      }),
      h('main', { className: 'content' },
        h('div', { className: 'content-header' },
          h('div', null, h('p', { className: 'eyebrow' }, 'Travel Wishlist'), h('h1', null, 'Places worth remembering')),
          h('div', { className: 'content-meta' },
            h('span', { id: 'results-count', 'aria-live': 'polite' },
              filtered.length === places.length ? `${places.length} place${places.length !== 1 ? 's' : ''}` : `${filtered.length} of ${places.length} places`),
            Store.mode() !== 'file' && h('span', {
              id: 'storage-status',
              className: 'storage-status storage-status--warn',
              'aria-live': 'polite',
            }, 'Storage unavailable')
          )
        ),
        h(PlacesGrid, { places: filtered, userLoc: sortByDistance ? userLoc : null, onOpen: place => setModal({ type: 'detail', place }) })
      )
    ),
    modal && h('div', { id: 'modal-backdrop', className: 'backdrop--open', 'aria-hidden': true, onClick: () => setModal(null) }),
    modal?.type === 'detail' && h(DetailModal, {
      place: modal.place,
      onClose: () => setModal(null),
      onEdit: () => setModal({ type: 'form', place: modal.place }),
      onDelete: () => removePlace(modal.place),
      onUpdated: (place) => { refresh(); setModal({ type: 'detail', place }); },
    }),
    modal?.type === 'form' && h(PlaceFormModal, {
      place: modal.place,
      onClose: () => setModal(null),
      onSaved: () => { refresh(); setModal(null); },
    })
  );
}

function Sidebar(props) {
  const {
    allTags, activeTags, setActiveTags, searchQuery, setSearchQuery,
    activeCategory, setActiveCategory, sortByDistance, distanceBusy,
    distanceError, toggleDistanceSort, distanceQuery, setDistanceQuery,
    distanceOriginLabel, applyDistanceQuery, clearDistanceSort, places,
  } = props;

  function toggleTag(tag) {
    const next = new Set(activeTags);
    next.has(tag) ? next.delete(tag) : next.add(tag);
    setActiveTags(next);
  }

  return h('aside', { className: 'sidebar', 'aria-label': 'Filters' },
    h('div', null,
      h('p', { className: 'sidebar-section-label' }, 'Search'),
      h('div', { className: 'search-wrap' },
        h('input', {
          id: 'search-input',
          type: 'search',
          placeholder: 'Search places...',
          'aria-label': 'Search places',
          value: searchQuery,
          onChange: e => setSearchQuery(e.target.value),
        }),
        h('button', { id: 'btn-clear-search', 'aria-label': 'Clear search', title: 'Clear', onClick: () => setSearchQuery('') }, '×')
      )
    ),
    h('div', null,
      h('p', { className: 'sidebar-section-label' }, 'Sort'),
      h('div', { className: 'distance-sort-panel' },
        h('button', {
          id: 'btn-sort-distance',
          className: `btn btn-ghost ${sortByDistance && distanceOriginLabel === 'current location' ? 'btn--active' : ''}`,
          disabled: distanceBusy,
          onClick: toggleDistanceSort,
        }, distanceBusy ? '⏳ Getting location...' : sortByDistance && distanceOriginLabel === 'current location' ? '✓ Near me' : '📍 Near me'),
        h('form', { className: 'distance-origin-form', onSubmit: applyDistanceQuery },
          h('input', {
            id: 'distance-origin-input',
            list: 'distance-origin-options',
            value: distanceQuery,
            autoComplete: 'off',
            onChange: e => { setDistanceQuery(e.target.value); if (distanceError) setDistanceError(''); },
            placeholder: 'Place name, Maps link, or lat, lng',
            'aria-label': 'Sort from location',
          }),
          h('datalist', { id: 'distance-origin-options' },
            places
              .filter(place => coordsOf(place))
              .flatMap(place => [
                h('option', { key: `${place.id}-name`, value: place.name }),
                place.address ? h('option', { key: `${place.id}-address`, value: place.address }) : null,
              ])
              .filter(Boolean)
          ),
          h('button', { type: 'submit', className: 'btn btn-ghost' }, 'Sort')
        ),
        sortByDistance && distanceOriginLabel && h('div', { className: 'distance-sort-active' },
          h('span', null, `From ${distanceOriginLabel}`),
          h('button', { type: 'button', onClick: clearDistanceSort, 'aria-label': 'Clear distance sort' }, '×')
        )
      ),
      distanceError && h('p', { style: { fontSize: '0.75rem', color: 'var(--danger)', marginTop: '0.4rem' } }, distanceError)
    ),
    h('div', null,
      h('p', { className: 'sidebar-section-label' }, 'Category'),
      h('div', { className: 'category-filter', role: 'group', 'aria-label': 'Filter by category' },
        [['all', 'All'], ['restaurant', '🍽 Restaurants'], ['bar', '🍸 Bars'], ['shop', '🛍 Shops'], ['experience', '🏞 Experiences']].map(([cat, label]) =>
          h('button', {
            key: cat,
            className: `category-filter-btn ${activeCategory === cat ? 'category-filter-btn--active' : ''}`,
            onClick: () => setActiveCategory(cat),
          }, label)
        )
      )
    ),
    h('div', null,
      h('div', { className: 'tags-header' },
        h('p', { className: 'sidebar-section-label' }, 'Filter by Tag'),
        h('button', { id: 'btn-clear-tags', className: 'btn btn-ghost', style: { fontSize: '0.75rem', padding: '0.2rem 0.5rem' }, onClick: () => setActiveTags(new Set()) }, 'Clear')
      ),
      h('ul', { id: 'tag-list', 'aria-label': 'Tag filters' },
        allTags.length === 0
          ? h('li', { className: 'tag-empty' }, 'No tags yet')
          : allTags.map(tag => h('li', { key: tag },
              h('button', {
                className: `tag-pill ${activeTags.has(tag) ? 'tag-pill--active' : ''}`,
                'aria-pressed': activeTags.has(tag),
                onClick: () => toggleTag(tag),
              }, tag)
            ))
      )
    )
  );
}

function PlacesGrid({ places, userLoc, onOpen }) {
  if (!places.length) {
    return h('div', { id: 'places-grid', role: 'list', 'aria-label': 'Places' },
      h('div', { className: 'empty-state' }, h('span', { className: 'empty-icon' }, '🗺️'), h('p', null, 'No places yet. Add your first one!'))
    );
  }
  return h('div', { id: 'places-grid', role: 'list', 'aria-label': 'Places' },
    places.map(place => h(PlaceCard, { key: place.id, place, userLoc, onOpen }))
  );
}

function PlaceCard({ place, userLoc, onOpen }) {
  const [idx, setIdx] = useState(0);
  const photos = place.photos || [];
  const firstPhoto = photos[0];
  const meta = CATEGORY_META[place.category] || CATEGORY_META.restaurant;
  const hasPersonalRating = place.visited && place.rating;
  const coord = coordsOf(place);
  const distance = userLoc && coord ? Geo.format(Geo.distance(userLoc.lat, userLoc.lng, coord.lat, coord.lng)) : '';
  const dateStr = new Date(place.dateAdded).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

  const badges = [];
  if (place.googleRating) badges.push(h('span', { key: 'g', className: 'card-img-google-rating' }, `Google ${place.googleRating}`));
  if (hasPersonalRating) badges.push(h('span', { key: 'r', className: 'card-img-rating' }, `Your ${'★'.repeat(place.rating)}${'☆'.repeat(5 - place.rating)}`));
  else if (place.visited) badges.push(h('span', { key: 'v', className: 'card-img-rating visited-badge' }, '✓ Visited'));

  return h('article', { className: 'place-card', role: 'listitem', onClick: () => onOpen(place) },
    h('div', { className: `card-img-wrap ${photos.length > 1 ? 'card-slideshow' : ''} ${!firstPhoto ? 'card-img-placeholder' : ''}` },
      photos.length > 1
        ? h(React.Fragment, null,
            h('div', { className: 'card-slide-track', style: { transform: `translateX(-${idx * 100}%)` } },
              photos.map((p, i) => h('img', { key: `${p}-${i}`, className: 'card-slide', src: p, alt: place.name }))
            ),
            h('button', { className: 'card-slide-btn card-slide-prev', 'aria-label': 'Previous photo', onClick: e => { e.stopPropagation(); setIdx((idx - 1 + photos.length) % photos.length); } }, '‹'),
            h('button', { className: 'card-slide-btn card-slide-next', 'aria-label': 'Next photo', onClick: e => { e.stopPropagation(); setIdx((idx + 1) % photos.length); } }, '›'),
            h('span', { className: 'card-img-count card-slide-counter' }, `${idx + 1} / ${photos.length}`)
          )
        : firstPhoto ? h('img', { src: firstPhoto, alt: place.name, onError: e => { e.currentTarget.parentElement.classList.add('img-error'); e.currentTarget.remove(); } }) : h('span', null, '📍'),
      badges.length > 0 && h('div', { className: 'card-img-badges' }, badges),
      place.address && h('span', { className: 'card-img-address' }, `📍 ${place.address}`)
    ),
    h('div', { className: 'card-body' },
      h('div', { className: 'card-title-row' }, h('h2', { className: 'card-title' }, place.name), distance && h('span', { className: 'card-distance' }, `${distance} away`)),
      h('p', { className: 'card-desc' }, place.description),
      h('div', { className: 'card-tags' },
        h('span', { className: `category-badge ${meta.className}` }, meta.label),
        place.tags.map(t => h('span', { key: t, className: 'tag-badge' }, t))
      ),
      h('time', { className: 'card-date', dateTime: place.dateAdded }, dateStr)
    )
  );
}

function DetailModal({ place, onClose, onEdit, onDelete, onUpdated }) {
  const [idx, setIdx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const photos = place.photos || [];
  const dateStr = new Date(place.dateAdded).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });

  async function addDroppedPhoto(e) {
    e.preventDefault();
    setDragging(false);
    const file = Array.from(e.dataTransfer.files).find(f => f.type.startsWith('image/'));
    if (!file) return;
    const photoUrl = await ImageUtils.resizeAndSave(file);
    const updated = await Places.update(place.id, { ...place, photos: [...photos, photoUrl], tags: place.tags.join(',') });
    if (updated) onUpdated(updated);
  }

  return h('div', {
    id: 'modal-detail',
    className: `modal modal--open ${dragging ? 'modal--drag' : ''}`,
    role: 'dialog',
    'aria-modal': 'true',
    'aria-label': 'Place details',
    onDragOver: e => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDragging(true); } },
    onDragLeave: e => { if (!e.currentTarget.contains(e.relatedTarget)) setDragging(false); },
    onDrop: addDroppedPhoto,
  },
    h('div', { className: 'drag-overlay', 'aria-hidden': true }, h('div', { className: 'drag-overlay-inner' }, '📷 Drop photo to update')),
    h('div', { className: 'modal-header' }, h('h2', { id: 'form-title-detail' }, 'Place Details'), h('button', { className: 'btn-close', 'aria-label': 'Close', onClick: onClose }, '×')),
    h('div', { className: 'detail-content' },
      photos.length > 0 && h('div', { className: 'photo-carousel', 'data-count': photos.length, 'data-current': idx },
        h('div', { className: 'carousel-track', style: { transform: `translateX(-${idx * 100}%)` } },
          photos.map((src, i) => h('div', { key: `${src}-${i}`, className: 'carousel-slide', 'aria-hidden': i !== idx },
            h('img', { src, alt: `${place.name} photo ${i + 1}` })
          ))
        ),
        photos.length > 1 && h('button', { className: 'carousel-btn carousel-prev', 'aria-label': 'Previous photo', onClick: () => setIdx((idx - 1 + photos.length) % photos.length) }, '‹'),
        photos.length > 1 && h('button', { className: 'carousel-btn carousel-next', 'aria-label': 'Next photo', onClick: () => setIdx((idx + 1) % photos.length) }, '›'),
        photos.length > 1 && h('div', { className: 'carousel-dots' }, photos.map((_, i) => h('button', {
          key: i,
          className: `carousel-dot ${i === idx ? 'carousel-dot--active' : ''}`,
          'aria-label': `Photo ${i + 1}`,
          onClick: () => setIdx(i),
        })))
      ),
      h('h2', { className: 'detail-title' }, place.name),
      (place.visited || place.googleRating) && h('div', { className: 'detail-rating' },
        place.visited && (place.rating ? h('span', { className: 'detail-stars' }, `${'★'.repeat(place.rating)}${'☆'.repeat(5 - place.rating)}`) : h('span', { className: 'detail-visited-only' }, '✓ Visited')),
        place.googleRating ? h('span', { className: 'detail-google-rating' }, `G ★ ${place.googleRating}`) : null
      ),
      place.address && h('p', { className: 'detail-address' }, h('a', { href: placeAddressHref(place), target: '_blank', rel: 'noopener noreferrer' }, `📍 ${place.address}`)),
      h('p', { className: 'detail-desc' }, place.description),
      mapsHref(place) && h('div', { className: 'detail-map' }, h('a', { href: mapsHref(place), target: '_blank', rel: 'noopener noreferrer' }, 'Open in Maps ↗')),
      h('div', { className: 'detail-tags' }, place.tags.map(t => h('span', { key: t, className: 'tag-badge' }, t))),
      h('time', { className: 'detail-date' }, `Added ${dateStr}`)
    ),
    h('div', { className: 'modal-footer' }, h('button', { className: 'btn btn-danger', onClick: onDelete }, 'Delete'), h('button', { className: 'btn btn-primary', onClick: onEdit }, 'Edit'))
  );
}

function PlaceFormModal({ place, onClose, onSaved }) {
  const [category, setCategory] = useState(place?.category || 'restaurant');
  const [name, setName] = useState(place?.name || '');
  const [description, setDescription] = useState(place?.description || '');
  const [address, setAddress] = useState(place?.address || '');
  const [mapLink, setMapLink] = useState(place?.mapLink || '');
  const [tags, setTags] = useState(place ? place.tags.join(', ') : '');
  const [photos, setPhotos] = useState(place?.photos || []);
  const [photoTab, setPhotoTab] = useState('url');
  const [photoUrl, setPhotoUrl] = useState('');
  const [visited, setVisited] = useState(Boolean(place?.visited));
  const [rating, setRating] = useState(place?.rating || 0);
  const [googleRating, setGoogleRating] = useState(place?.googleRating || '');
  const [errors, setErrors] = useState({});
  const [mapStatus, setMapStatus] = useState('');
  const [ratingStatus, setRatingStatus] = useState('');
  const [saving, setSaving] = useState(false);
  const fileRef = useRef(null);

  async function uploadFiles(files) {
    setErrors(prev => ({ ...prev, image: 'Saving photo...' }));
    try {
      const uploaded = [];
      for (const file of files) uploaded.push(await ImageUtils.resizeAndSave(file));
      setPhotos(prev => [...prev, ...uploaded]);
      setErrors(prev => ({ ...prev, image: '' }));
    } catch {
      setErrors(prev => ({ ...prev, image: 'Photo could not be saved. Make sure the local server is running.' }));
    }
  }

  function addPhotoUrl() {
    const url = photoUrl.trim();
    if (!url) return;
    if (!url.startsWith('http')) {
      setErrors(prev => ({ ...prev, image: 'URL must start with http or https.' }));
      return;
    }
    setPhotos(prev => [...prev, url]);
    setPhotoUrl('');
    setErrors(prev => ({ ...prev, image: '' }));
  }

  async function useLocation() {
    try {
      setMapStatus('Getting location...');
      const loc = await Geo.get();
      setMapLink(`${loc.lat.toFixed(6)}, ${loc.lng.toFixed(6)}`);
      setMapStatus('✓ Using your current location');
    } catch (e) {
      setMapStatus(`⚠ ${e.message}`);
    }
  }

  async function fetchRating() {
    if (!mapLink.trim().startsWith('http')) {
      setRatingStatus('⚠ Paste a Google Maps URL in the Map field first.');
      return;
    }
    setRatingStatus('Fetching...');
    try {
      const nextRating = await GMapsRating.fetch(mapLink.trim());
      if (nextRating) {
        setGoogleRating(nextRating);
        setRatingStatus(`✓ Found rating: ${nextRating}`);
      } else {
        setRatingStatus('⚠ Rating not found in page — enter it manually.');
      }
    } catch (e) {
      setRatingStatus(`⚠ ${e.message}`);
    }
  }

  async function submit(e) {
    e.preventDefault();
    const nextErrors = {};
    if (!name.trim()) nextErrors.name = 'Name is required.';
    if (!description.trim()) nextErrors.desc = 'Description is required.';
    if (!mapLink.trim()) nextErrors.mapLink = 'Map link or coordinates are required.';
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      return;
    }

    setSaving(true);
    const gr = parseFloat(googleRating);
    const data = {
      category,
      name,
      description,
      address,
      mapLink,
      tags,
      photos: photoTab === 'url' && photoUrl.trim().startsWith('http') ? [...photos, photoUrl.trim()] : photos,
      visited,
      rating: visited ? rating : 0,
      googleRating: !Number.isNaN(gr) && gr >= 1 && gr <= 5 ? Math.round(gr * 10) / 10 : 0,
    };
    const saved = place ? await Places.update(place.id, data) : await Places.add(data);
    setSaving(false);
    if (saved) onSaved();
  }

  return h('div', {
    id: 'modal-form',
    className: 'modal modal--open',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-labelledby': 'form-title',
    onPaste: e => {
      const files = Array.from(e.clipboardData?.items || [])
        .filter(item => item.type.startsWith('image/'))
        .map(item => item.getAsFile())
        .filter(Boolean);
      if (files.length) {
        e.preventDefault();
        setPhotoTab('upload');
        uploadFiles(files);
      }
    },
  },
    h('div', { className: 'modal-header' }, h('h2', { id: 'form-title' }, place ? 'Edit Place' : 'Add New Place'), h('button', { className: 'btn-close', 'aria-label': 'Close', onClick: onClose }, '×')),
    h('form', { id: 'place-form', noValidate: true, onSubmit: submit },
      h(FormField, { label: 'Category' },
        h('div', { className: 'category-toggle', role: 'group', 'aria-label': 'Place category' },
          Object.entries(CATEGORY_META).map(([cat, meta]) => h('button', {
            key: cat,
            type: 'button',
            className: `category-btn ${category === cat ? 'category-btn--active' : ''}`,
            onClick: () => setCategory(cat),
          }, meta.label))
        )
      ),
      h(FormField, { label: 'Name', error: errors.name }, h('input', { id: 'field-name', value: name, maxLength: 100, autoComplete: 'off', required: true, onChange: e => setName(e.target.value), placeholder: 'e.g. Café Narrows' })),
      h(FormField, { label: 'Description', error: errors.desc }, h('textarea', { id: 'field-desc', rows: 3, value: description, required: true, onChange: e => setDescription(e.target.value), placeholder: "Why do you want to visit? What's it known for?" })),
      h(FormField, { label: 'Street Address', optional: true }, h('input', { id: 'field-address', value: address, autoComplete: 'off', onChange: e => setAddress(e.target.value), placeholder: 'e.g. 123 Main St, Paris' })),
      h(FormField, { label: 'Map Link or Coordinates', error: errors.mapLink },
        h('div', { className: 'map-input-row' },
          h('input', { id: 'field-map', value: mapLink, autoComplete: 'off', required: true, onChange: e => { setMapLink(e.target.value); setMapStatus(''); }, placeholder: 'Paste a Google Maps link or type lat, lng' }),
          h('button', { type: 'button', id: 'btn-use-location', className: 'btn btn-ghost btn-use-location', onClick: useLocation }, '📍 Use my location')
        ),
        h('span', { id: 'map-extract-status', className: `map-extract-status ${mapStatus.startsWith('✓') ? 'map-extract-ok' : mapStatus.startsWith('⚠') ? 'map-extract-warn' : ''}` }, mapStatus)
      ),
      h(FormField, { label: 'Tags', optional: 'comma-separated' }, h('input', { id: 'field-tags', value: tags, autoComplete: 'off', onChange: e => setTags(e.target.value), placeholder: 'e.g. coffee, paris, weekend' })),
      h(FormField, { label: 'Photos', optional: true, error: errors.image },
        h('div', { id: 'photos-list', className: 'photos-list' }, photos.map((src, i) => h('div', { key: `${src}-${i}`, className: 'photos-list-item' },
          h('img', { src, alt: `Photo ${i + 1}` }),
          h('button', { type: 'button', className: 'photos-list-remove', 'aria-label': `Remove photo ${i + 1}`, onClick: () => setPhotos(prev => prev.filter((_, idx) => idx !== i)) }, '×')
        ))),
        h('div', { className: 'photo-source-tabs', role: 'tablist' },
          h('button', { type: 'button', className: `photo-tab ${photoTab === 'url' ? 'photo-tab--active' : ''}`, onClick: () => setPhotoTab('url') }, 'Link'),
          h('button', { type: 'button', className: `photo-tab ${photoTab === 'upload' ? 'photo-tab--active' : ''}`, onClick: () => setPhotoTab('upload') }, 'Upload')
        ),
        photoTab === 'url'
          ? h('div', { className: 'photo-url-row' }, h('input', { id: 'field-image', type: 'url', value: photoUrl, autoComplete: 'off', onChange: e => setPhotoUrl(e.target.value), placeholder: 'https://example.com/photo.jpg' }), h('button', { type: 'button', id: 'btn-add-photo-url', className: 'btn btn-ghost', style: { whiteSpace: 'nowrap', fontSize: '0.85rem' }, onClick: addPhotoUrl }, 'Add'))
          : h('div', null,
              h('label', {
                className: 'file-upload-label',
                htmlFor: 'field-image-file',
                onDragOver: e => { if (e.dataTransfer.types.includes('Files')) e.preventDefault(); },
                onDrop: e => { e.preventDefault(); uploadFiles(Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'))); },
              }, h('span', null, 'Choose photos... (or drag & drop / paste)')),
              h('input', { ref: fileRef, id: 'field-image-file', type: 'file', accept: 'image/*', multiple: true, className: 'file-input-hidden', onChange: e => uploadFiles(Array.from(e.target.files).filter(f => f.type.startsWith('image/'))) })
            )
      ),
      h(FormField, { label: 'Google Maps Rating', optional: 'optional, 1-5' },
        h('div', { className: 'google-rating-row' },
          h('input', { id: 'field-google-rating', type: 'number', min: 1, max: 5, step: 0.1, value: googleRating, onChange: e => setGoogleRating(e.target.value), placeholder: 'e.g. 4.3' }),
          h('button', { type: 'button', id: 'btn-fetch-rating', className: 'btn btn-ghost', style: { whiteSpace: 'nowrap', fontSize: '0.8rem' }, onClick: fetchRating }, 'Fetch from Maps')
        ),
        h('span', { id: 'fetch-rating-status', className: `map-extract-status ${ratingStatus.startsWith('✓') ? 'map-extract-ok' : ratingStatus.startsWith('⚠') ? 'map-extract-warn' : ''}` }, ratingStatus)
      ),
      h('div', { className: 'form-field' }, h('label', { className: 'checkbox-label' }, h('input', { id: 'field-visited', type: 'checkbox', checked: visited, onChange: e => { setVisited(e.target.checked); if (!e.target.checked) setRating(0); } }), " I've visited this place")),
      visited && h('div', { className: 'form-field', id: 'rating-wrap' },
        h('label', null, 'My Rating'),
        h('div', { className: 'star-picker', id: 'star-picker', role: 'group', 'aria-label': 'Star rating' },
          [1, 2, 3, 4, 5].map(val => h('button', { key: val, type: 'button', className: `star-btn ${rating >= val ? 'star-btn--active' : ''}`, 'aria-label': `${val} star`, onClick: () => setRating(val) }, '★'))
        )
      ),
      h('div', { className: 'form-actions' },
        h('button', { type: 'button', className: 'btn btn-ghost', onClick: onClose }, 'Cancel'),
        h('button', { type: 'submit', className: 'btn btn-primary', disabled: saving }, saving ? 'Saving...' : 'Save Place')
      )
    )
  );
}

function FormField({ label, optional, error, children }) {
  return h('div', { className: 'form-field' },
    h('label', null, label, optional && h('span', { className: 'optional' }, ` (${optional === true ? 'optional' : optional})`)),
    children,
    error && h('span', { className: 'field-error', role: 'alert' }, error)
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(h(App));
