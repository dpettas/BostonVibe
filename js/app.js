// @ts-nocheck
document.addEventListener('DOMContentLoaded', async () => {
    const APP_VERSION = '2026-04-24-2';
    let activeTags = new Set();
    let searchQuery = '';
    let activeCategory = 'all';
    let editingPlace = null;
    let userLoc = null;
    let sortByDistance = false;
    function updateStorageStatus() {
        const el = document.getElementById('storage-status');
        if (!el)
            return;
        const mode = Store.mode();
        const usingFileDb = mode === 'file';
        el.className = `storage-status ${usingFileDb ? 'storage-status--ok' : 'storage-status--warn'}`;
        el.textContent = usingFileDb
            ? `Storage: File DB · ${APP_VERSION}`
            : `Storage fallback only · ${APP_VERSION}`;
        el.title = usingFileDb
            ? 'Data is being written to the JSON database file through the local server.'
            : 'The file-backed database is unavailable, so the app is not using the primary storage path.';
    }
    function coordsOf(place) {
        const m = place.mapLink && place.mapLink.match(/^(-?\d+\.?\d*),\s*(-?\d+\.?\d*)$/);
        return m ? { lat: parseFloat(m[1]), lng: parseFloat(m[2]) } : null;
    }
    function getFiltered() {
        let all = Places.getAll();
        all = Tags.search(all, searchQuery);
        all = Tags.filter(all, activeTags);
        if (activeCategory !== 'all') {
            all = all.filter(p => (p.category || 'restaurant') === activeCategory);
        }
        if (sortByDistance && userLoc) {
            all.sort((a, b) => {
                const ca = coordsOf(a), cb = coordsOf(b);
                const da = ca ? Geo.distance(userLoc.lat, userLoc.lng, ca.lat, ca.lng) : Infinity;
                const db = cb ? Geo.distance(userLoc.lat, userLoc.lng, cb.lat, cb.lng) : Infinity;
                return da - db;
            });
        }
        return all;
    }
    function rerender() {
        const filtered = getFiltered();
        Render.grid(filtered, sortByDistance ? userLoc : null);
        Render.tagSidebar(Tags.getAll(), activeTags);
        updateTagCount(filtered.length, Places.getAll().length);
    }
    function updateTagCount(shown, total) {
        const el = document.getElementById('results-count');
        if (!el)
            return;
        el.textContent = shown === total
            ? `${total} place${total !== 1 ? 's' : ''}`
            : `${shown} of ${total} places`;
    }
    await Store.init();
    updateStorageStatus();
    // Initial render
    rerender();
    // Search
    let searchDebounce;
    document.getElementById('search-input').addEventListener('input', (e) => {
        clearTimeout(searchDebounce);
        searchDebounce = setTimeout(() => {
            searchQuery = e.target.value;
            rerender();
        }, 200);
    });
    // Clear search
    document.getElementById('btn-clear-search').addEventListener('click', () => {
        document.getElementById('search-input').value = '';
        searchQuery = '';
        rerender();
    });
    // Tag filter — delegated
    document.getElementById('tag-list').addEventListener('click', (e) => {
        const pill = e.target.closest('.tag-pill');
        if (!pill)
            return;
        const tag = pill.dataset.tag;
        if (activeTags.has(tag))
            activeTags.delete(tag);
        else
            activeTags.add(tag);
        rerender();
    });
    // Clear all tag filters
    document.getElementById('btn-clear-tags').addEventListener('click', () => {
        activeTags.clear();
        rerender();
    });
    // Category filter
    document.querySelector('.category-filter').addEventListener('click', (e) => {
        const btn = e.target.closest('.category-filter-btn');
        if (!btn)
            return;
        activeCategory = btn.dataset.cat;
        document.querySelectorAll('.category-filter-btn').forEach(b => {
            b.classList.toggle('category-filter-btn--active', b.dataset.cat === activeCategory);
        });
        rerender();
    });
    // Place card click — delegated
    document.getElementById('places-grid').addEventListener('click', (e) => {
        // Thumbnail slideshow navigation
        const slideBtn = e.target.closest('.card-slide-btn');
        if (slideBtn) {
            e.stopPropagation();
            const wrap = slideBtn.closest('.card-img-wrap');
            const track = wrap.querySelector('.card-slide-track');
            const slides = track.querySelectorAll('.card-slide');
            const dir = parseInt(slideBtn.dataset.dir, 10);
            let idx = parseInt(track.dataset.index, 10);
            idx = (idx + dir + slides.length) % slides.length;
            track.dataset.index = idx;
            track.style.transform = `translateX(-${idx * 100}%)`;
            const counter = wrap.querySelector('.card-slide-counter');
            if (counter)
                counter.textContent = `${idx + 1} / ${slides.length}`;
            return;
        }
        const card = e.target.closest('.place-card');
        if (!card)
            return;
        const place = Places.getById(card.dataset.id);
        if (place)
            Modal.openDetail(place);
    });
    // Add button
    document.getElementById('btn-add').addEventListener('click', () => {
        editingPlace = null;
        Modal.openForm(null);
    });
    // Detail modal — edit button
    document.getElementById('btn-detail-edit').addEventListener('click', () => {
        const place = Modal.getCurrentPlace();
        if (place) {
            editingPlace = place;
            Modal.openForm(place);
        }
    });
    // Detail modal — delete button
    document.getElementById('btn-detail-delete').addEventListener('click', async () => {
        const place = Modal.getCurrentPlace();
        if (!place)
            return;
        if (!confirm(`Delete "${place.name}"? This cannot be undone.`))
            return;
        const removed = await Places.remove(place.id);
        if (!removed)
            return;
        Modal.closeAll();
        rerender();
    });
    // "Use my location" in the add form
    document.getElementById('btn-use-location').addEventListener('click', async () => {
        const btn = document.getElementById('btn-use-location');
        const status = document.getElementById('map-extract-status');
        btn.textContent = '⏳ Getting location…';
        btn.disabled = true;
        try {
            const loc = await Geo.get();
            document.getElementById('field-map').value = `${loc.lat.toFixed(6)}, ${loc.lng.toFixed(6)}`;
            status.className = 'map-extract-status map-extract-ok';
            status.textContent = '✓ Using your current location';
        }
        catch (e) {
            status.className = 'map-extract-status map-extract-warn';
            status.textContent = `⚠ ${e.message}`;
        }
        finally {
            btn.textContent = '📍 Use my location';
            btn.disabled = false;
        }
    });
    // "Near me" sort in sidebar
    document.getElementById('btn-sort-distance').addEventListener('click', async () => {
        const btn = document.getElementById('btn-sort-distance');
        if (sortByDistance) {
            sortByDistance = false;
            btn.textContent = '📍 Near me';
            btn.classList.remove('btn--active');
            rerender();
            return;
        }
        btn.textContent = '⏳ Getting location…';
        btn.disabled = true;
        try {
            userLoc = await Geo.get();
            sortByDistance = true;
            btn.textContent = '✓ Sorted by distance';
            btn.classList.add('btn--active');
        }
        catch (e) {
            btn.textContent = '📍 Near me';
            const status = document.createElement('p');
            status.style.cssText = 'font-size:0.75rem;color:var(--danger);margin-top:0.4rem';
            status.textContent = e.message;
            btn.parentElement.appendChild(status);
            setTimeout(() => status.remove(), 4000);
        }
        finally {
            btn.disabled = false;
            rerender();
        }
    });
    // Google Maps URL paste → auto-extract name + coords
    document.getElementById('field-map').addEventListener('paste', (e) => {
        // Read pasted text (may not be in input value yet)
        const pasted = (e.clipboardData || window.clipboardData).getData('text');
        if (!pasted)
            return;
        const result = (typeof GMaps !== 'undefined') ? GMaps.parseUrl(pasted) : null;
        if (!result)
            return;
        const status = document.getElementById('map-extract-status');
        if (result.shortened) {
            status.className = 'map-extract-status map-extract-warn';
            status.textContent = '⚠ Shortened link — coordinates cannot be extracted. Use "Copy link" from the browser address bar for full details.';
            return;
        }
        const parts = [];
        if (result.name) {
            const nameField = document.getElementById('field-name');
            if (!nameField.value.trim()) {
                nameField.value = result.name;
                parts.push(`name: "${result.name}"`);
            }
        }
        if (result.lat && result.lng) {
            // Replace the field value with clean coords after paste
            setTimeout(() => {
                e.target.value = `${result.lat}, ${result.lng}`;
            }, 0);
            parts.push(`coords: ${result.lat}, ${result.lng}`);
        }
        if (parts.length > 0) {
            status.className = 'map-extract-status map-extract-ok';
            status.textContent = `✓ Extracted — ${parts.join(' · ')}`;
        }
        else {
            status.className = 'map-extract-status map-extract-warn';
            status.textContent = '⚠ Link recognised but no data could be extracted.';
        }
    });
    // Clear extract status when user manually edits the map field
    document.getElementById('field-map').addEventListener('input', () => {
        const status = document.getElementById('map-extract-status');
        status.textContent = '';
        status.className = 'map-extract-status';
    });
    // Global paste handler — routes clipboard images to the open modal
    document.addEventListener('paste', async (e) => {
        const imageItem = Array.from(e.clipboardData.items).find(i => i.type.startsWith('image/'));
        if (!imageItem)
            return;
        const file = imageItem.getAsFile();
        if (!file)
            return;
        const detailOpen = document.getElementById('modal-detail').classList.contains('modal--open');
        const formOpen = document.getElementById('modal-form').classList.contains('modal--open');
        if (detailOpen) {
            const place = Modal.getCurrentPlace();
            if (!place)
                return;
            e.preventDefault();
            try {
                const photoUrl = await ImageUtils.resizeAndSave(file);
                const updated = await Places.update(place.id, { ...place, photos: [...(place.photos || []), photoUrl], tags: place.tags.join(',') });
                if (updated) {
                    Modal.openDetail(updated);
                    rerender();
                }
            }
            catch { }
        }
        else if (formOpen) {
            e.preventDefault();
            Form.setPhotoFromFile(file);
        }
    });
    // Detail modal — drag-and-drop photo
    const detailModal = document.getElementById('modal-detail');
    detailModal.addEventListener('dragover', (e) => {
        if (!e.dataTransfer.types.includes('Files'))
            return;
        e.preventDefault();
        detailModal.classList.add('modal--drag');
    });
    detailModal.addEventListener('dragleave', (e) => {
        if (detailModal.contains(e.relatedTarget))
            return;
        detailModal.classList.remove('modal--drag');
    });
    detailModal.addEventListener('drop', async (e) => {
        e.preventDefault();
        detailModal.classList.remove('modal--drag');
        const file = Array.from(e.dataTransfer.files).find(f => f.type.startsWith('image/'));
        if (!file)
            return;
        const place = Modal.getCurrentPlace();
        if (!place)
            return;
        try {
            const photoUrl = await ImageUtils.resizeAndSave(file);
            const updated = await Places.update(place.id, {
                ...place,
                photos: [...(place.photos || []), photoUrl],
                tags: place.tags.join(','),
            });
            if (updated) {
                Modal.openDetail(updated);
                rerender();
            }
        }
        catch {
            // silently ignore resize errors
        }
    });
    // Fetch Google Maps rating
    document.getElementById('btn-fetch-rating').addEventListener('click', async () => {
        const mapUrl = document.getElementById('field-map').value.trim();
        const status = document.getElementById('fetch-rating-status');
        const btn = document.getElementById('btn-fetch-rating');
        if (!mapUrl || !mapUrl.startsWith('http')) {
            status.className = 'map-extract-status map-extract-warn';
            status.textContent = '⚠ Paste a Google Maps URL in the Map field first.';
            return;
        }
        btn.disabled = true;
        btn.textContent = '⏳ Fetching…';
        status.className = 'map-extract-status';
        status.textContent = '';
        try {
            const rating = await GMapsRating.fetch(mapUrl);
            if (rating) {
                document.getElementById('field-google-rating').value = rating;
                status.className = 'map-extract-status map-extract-ok';
                status.textContent = `✓ Found rating: ${rating}`;
            }
            else {
                status.className = 'map-extract-status map-extract-warn';
                status.textContent = '⚠ Rating not found in page — enter it manually.';
            }
        }
        catch (e) {
            status.className = 'map-extract-status map-extract-warn';
            status.textContent = `⚠ ${e.message}`;
        }
        finally {
            btn.disabled = false;
            btn.textContent = 'Fetch from Maps';
        }
    });
    // Form save
    Form.init(async (data) => {
        let savedPlace = null;
        if (editingPlace) {
            savedPlace = await Places.update(editingPlace.id, data);
        }
        else {
            savedPlace = await Places.add(data);
        }
        if (!savedPlace)
            return;
        editingPlace = null;
        Modal.closeAll();
        rerender();
    });
    // Close buttons
    document.querySelectorAll('[data-close-modal]').forEach(btn => {
        btn.addEventListener('click', () => Modal.closeAll());
    });
    // Backdrop click
    document.getElementById('modal-backdrop').addEventListener('click', () => Modal.closeAll());
    // Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape')
            Modal.closeAll();
    });
});
