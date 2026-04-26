// @ts-nocheck
const Modal = (() => {
    let currentPlace = null;
    let _carouselKeyHandler = null;
    function openDetail(place) {
        const modal = document.getElementById('modal-detail');
        const photos = place.photos || [];
        const carouselHtml = _buildCarousel(photos, place.name);
        const mapLinkHtml = buildMapLink(place.mapLink);
        const tagsHtml = place.tags.map(t => `<span class="tag-badge">${esc(t)}</span>`).join('');
        const dateStr = new Date(place.dateAdded).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
        const ratingHtml = (place.visited || place.googleRating)
            ? `<div class="detail-rating">
          ${place.visited ? (place.rating ? `<span class="detail-stars">${'★'.repeat(place.rating)}${'☆'.repeat(5 - place.rating)}</span>` : '<span class="detail-visited-only">✓ Visited</span>') : ''}
          ${place.googleRating ? `<span class="detail-google-rating">G ★ ${esc(String(place.googleRating))}</span>` : ''}
        </div>`
            : '';
        modal.querySelector('.detail-content').innerHTML = `
      ${carouselHtml}
      <h2 class="detail-title">${esc(place.name)}</h2>
      ${ratingHtml}
      ${place.address ? `<p class="detail-address"><a href="https://www.google.com/maps/search/${encodeURIComponent(place.address)}" target="_blank" rel="noopener noreferrer">📍 ${esc(place.address)}</a></p>` : ''}
      <p class="detail-desc">${esc(place.description)}</p>
      <div class="detail-map">${mapLinkHtml}</div>
      <div class="detail-tags">${tagsHtml}</div>
      <time class="detail-date">Added ${dateStr}</time>
    `;
        _open(modal, place);
        _initCarousel(modal.querySelector('.photo-carousel'));
    }
    function _buildCarousel(photos, altText) {
        if (photos.length === 0)
            return '';
        const slidesHtml = photos.map((src, i) => `<div class="carousel-slide" aria-hidden="${i > 0}">
        <img src="${esc(src)}" alt="${esc(altText)} photo ${i + 1}" onerror="this.parentElement.classList.add('slide-error')">
      </div>`).join('');
        const arrowsHtml = photos.length > 1
            ? `<button class="carousel-btn carousel-prev" aria-label="Previous photo">&#8249;</button>
         <button class="carousel-btn carousel-next" aria-label="Next photo">&#8250;</button>`
            : '';
        const dotsHtml = photos.length > 1
            ? `<div class="carousel-dots">${photos.map((_, i) => `<button class="carousel-dot${i === 0 ? ' carousel-dot--active' : ''}" data-index="${i}" aria-label="Photo ${i + 1}"></button>`).join('')}</div>`
            : '';
        return `<div class="photo-carousel" data-count="${photos.length}" data-current="0">
      <div class="carousel-track">${slidesHtml}</div>
      ${arrowsHtml}
      ${dotsHtml}
    </div>`;
    }
    function _initCarousel(el) {
        if (_carouselKeyHandler) {
            document.removeEventListener('keydown', _carouselKeyHandler);
            _carouselKeyHandler = null;
        }
        if (!el)
            return;
        const count = parseInt(el.dataset.count);
        if (count <= 1)
            return;
        let current = 0;
        function goTo(n) {
            current = ((n % count) + count) % count;
            el.querySelector('.carousel-track').style.transform = `translateX(-${current * 100}%)`;
            el.querySelectorAll('.carousel-dot').forEach((dot, i) => {
                dot.classList.toggle('carousel-dot--active', i === current);
            });
            el.querySelectorAll('.carousel-slide').forEach((slide, i) => {
                slide.setAttribute('aria-hidden', i !== current);
            });
        }
        el.querySelector('.carousel-prev').addEventListener('click', (e) => { e.stopPropagation(); goTo(current - 1); });
        el.querySelector('.carousel-next').addEventListener('click', (e) => { e.stopPropagation(); goTo(current + 1); });
        el.querySelectorAll('.carousel-dot').forEach((dot, i) => {
            dot.addEventListener('click', (e) => { e.stopPropagation(); goTo(i); });
        });
        // Touch swipe
        let touchStartX = 0;
        el.addEventListener('touchstart', (e) => { touchStartX = e.touches[0].clientX; }, { passive: true });
        el.addEventListener('touchend', (e) => {
            const dx = e.changedTouches[0].clientX - touchStartX;
            if (Math.abs(dx) > 40)
                goTo(dx < 0 ? current + 1 : current - 1);
        });
        _carouselKeyHandler = (e) => {
            if (!document.getElementById('modal-detail').classList.contains('modal--open'))
                return;
            if (e.key === 'ArrowLeft')
                goTo(current - 1);
            else if (e.key === 'ArrowRight')
                goTo(current + 1);
        };
        document.addEventListener('keydown', _carouselKeyHandler);
    }
    function openForm(place) {
        const modal = document.getElementById('modal-form');
        const form = document.getElementById('place-form');
        document.getElementById('form-title').textContent = place ? 'Edit Place' : 'Add New Place';
        form.reset();
        document.querySelectorAll('.field-error').forEach(el => el.textContent = '');
        Form.resetPhoto();
        Form.setRating(0);
        document.getElementById('field-visited').checked = false;
        document.getElementById('rating-wrap').hidden = true;
        Form.setCategory('restaurant');
        if (place) {
            document.getElementById('field-name').value = place.name;
            document.getElementById('field-desc').value = place.description;
            document.getElementById('field-address').value = place.address || '';
            document.getElementById('field-map').value = place.mapLink;
            document.getElementById('field-tags').value = place.tags.join(', ');
            document.getElementById('field-google-rating').value = place.googleRating || '';
            (place.photos || []).forEach(src => Form.addPhoto(src));
            const visited = place.visited || false;
            document.getElementById('field-visited').checked = visited;
            document.getElementById('rating-wrap').hidden = !visited;
            Form.setRating(visited ? (place.rating || 0) : 0);
            Form.setCategory(place.category || 'restaurant');
        }
        _open(modal, place || null);
        document.getElementById('field-name').focus();
    }
    function closeAll() {
        if (_carouselKeyHandler) {
            document.removeEventListener('keydown', _carouselKeyHandler);
            _carouselKeyHandler = null;
        }
        document.querySelectorAll('.modal').forEach(m => {
            m.classList.remove('modal--open');
            m.setAttribute('aria-hidden', 'true');
        });
        document.getElementById('modal-backdrop').classList.remove('backdrop--open');
        document.body.classList.remove('no-scroll');
        currentPlace = null;
    }
    function getCurrentPlace() { return currentPlace; }
    function _open(modal, placeToSet) {
        closeAll();
        if (placeToSet !== undefined)
            currentPlace = placeToSet;
        modal.classList.add('modal--open');
        modal.setAttribute('aria-hidden', 'false');
        document.getElementById('modal-backdrop').classList.add('backdrop--open');
        document.body.classList.add('no-scroll');
        const focusables = modal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (modal._trapHandler)
            modal.removeEventListener('keydown', modal._trapHandler);
        modal._trapHandler = (e) => {
            if (e.key !== 'Tab')
                return;
            if (e.shiftKey) {
                if (document.activeElement === first) {
                    e.preventDefault();
                    last.focus();
                }
            }
            else {
                if (document.activeElement === last) {
                    e.preventDefault();
                    first.focus();
                }
            }
        };
        modal.addEventListener('keydown', modal._trapHandler);
        if (first)
            first.focus();
    }
    function buildMapLink(raw) {
        if (!raw)
            return '';
        const latLng = raw.match(/^(-?\d+\.?\d*),\s*(-?\d+\.?\d*)$/);
        if (latLng) {
            return `<a href="https://www.google.com/maps?q=${latLng[1]},${latLng[2]}" target="_blank" rel="noopener noreferrer">Open in Google Maps ↗</a>`;
        }
        if (raw.startsWith('http')) {
            return `<a href="${esc(raw)}" target="_blank" rel="noopener noreferrer">Open in Maps ↗</a>`;
        }
        return '';
    }
    function esc(str) {
        return String(str)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
    return { openDetail, openForm, closeAll, getCurrentPlace };
})();
