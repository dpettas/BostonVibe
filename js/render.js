// @ts-nocheck
const Render = (() => {
    const CATEGORY_META = {
        restaurant: { label: '🍽 Restaurant', className: 'category-badge--restaurant' },
        bar: { label: '🍸 Bar', className: 'category-badge--bar' },
        shop: { label: '🛍 Shop', className: 'category-badge--shop' },
        experience: { label: '🏞 Experience', className: 'category-badge--experience' },
    };
    function placeCard(place, userLoc) {
        const article = document.createElement('article');
        article.className = 'place-card';
        article.dataset.id = place.id;
        const photos = place.photos || [];
        const firstPhoto = photos[0] || null;
        const hasPersonalRating = place.visited && place.rating;
        const imgAddressHtml = place.address
            ? `<span class="card-img-address">📍 ${escHtml(place.address)}</span>`
            : '';
        const thumbnailBadges = [];
        if (place.googleRating) {
            thumbnailBadges.push(`<span class="card-img-google-rating">Google ${escHtml(String(place.googleRating))}</span>`);
        }
        if (hasPersonalRating) {
            thumbnailBadges.push(`<span class="card-img-rating">Your ${'★'.repeat(place.rating)}${'☆'.repeat(5 - place.rating)}</span>`);
        }
        else if (place.visited) {
            thumbnailBadges.push(`<span class="card-img-rating visited-badge">✓ Visited</span>`);
        }
        const badgesHtml = thumbnailBadges.length
            ? `<div class="card-img-badges">${thumbnailBadges.join('')}</div>`
            : '';
        let imgHtml;
        if (!firstPhoto) {
            imgHtml = `<div class="card-img-wrap card-img-placeholder"><span>📍</span>${badgesHtml}${imgAddressHtml}</div>`;
        }
        else if (photos.length === 1) {
            imgHtml = `<div class="card-img-wrap"><img src="${escHtml(firstPhoto)}" alt="${escHtml(place.name)}" onerror="this.parentElement.classList.add('img-error');this.remove()">${badgesHtml}${imgAddressHtml}</div>`;
        }
        else {
            const slidesHtml = photos.map(p => `<img class="card-slide" src="${escHtml(p)}" alt="${escHtml(place.name)}" onerror="this.style.visibility='hidden'">`).join('');
            imgHtml = `<div class="card-img-wrap card-slideshow">
        <div class="card-slide-track" data-index="0">${slidesHtml}</div>
        <button class="card-slide-btn card-slide-prev" data-dir="-1" aria-label="Previous photo">&#8249;</button>
        <button class="card-slide-btn card-slide-next" data-dir="1" aria-label="Next photo">&#8250;</button>
        ${badgesHtml}<span class="card-img-count card-slide-counter">1 / ${photos.length}</span>${imgAddressHtml}
      </div>`;
        }
        const tagsHtml = place.tags.map(t => `<span class="tag-badge">${escHtml(t)}</span>`).join('');
        const categoryMeta = CATEGORY_META[place.category] || CATEGORY_META.restaurant;
        const categoryHtml = `<span class="category-badge ${categoryMeta.className}">${categoryMeta.label}</span>`;
        const dateStr = new Date(place.dateAdded).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
        const coordMatch = place.mapLink && place.mapLink.match(/^(-?\d+\.?\d*),\s*(-?\d+\.?\d*)$/);
        const locationHref = coordMatch
            ? `https://www.google.com/maps/search/${encodeURIComponent(place.name)}/@${coordMatch[1]},${coordMatch[2]},17z`
            : place.mapLink || '';
        const locationLabel = coordMatch
            ? escHtml(place.mapLink)
            : 'Open in Maps';
        const addressHref = place.address
            ? `https://www.google.com/maps/search/${encodeURIComponent(place.address)}`
            : locationHref;
        const addressHtml = addressHref
            ? `<a class="card-address" href="${escHtml(addressHref)}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()">📍 ${escHtml(place.address || locationLabel)}</a>`
            : '';
        let distanceHtml = '';
        if (userLoc && coordMatch) {
            const km = Geo.distance(userLoc.lat, userLoc.lng, parseFloat(coordMatch[1]), parseFloat(coordMatch[2]));
            distanceHtml = `<span class="card-distance">${Geo.format(km)} away</span>`;
        }
        article.innerHTML = `
      ${imgHtml}
      <div class="card-body">
        <div class="card-title-row">
          <h2 class="card-title">${escHtml(place.name)}</h2>
          ${distanceHtml}
        </div>
        <p class="card-desc">${escHtml(place.description)}</p>
        <div class="card-tags">${categoryHtml}${tagsHtml}</div>
        <time class="card-date" datetime="${escHtml(place.dateAdded)}">${dateStr}</time>
      </div>
    `;
        return article;
    }
    function tagPill(tag, isActive) {
        const btn = document.createElement('button');
        btn.className = 'tag-pill' + (isActive ? ' tag-pill--active' : '');
        btn.dataset.tag = tag;
        btn.textContent = tag;
        btn.setAttribute('aria-pressed', String(isActive));
        return btn;
    }
    function grid(places, userLoc) {
        const container = document.getElementById('places-grid');
        container.innerHTML = '';
        if (!places || places.length === 0) {
            emptyState(container, 'No places yet. Add your first one!');
            return;
        }
        const frag = document.createDocumentFragment();
        places.forEach(p => frag.appendChild(placeCard(p, userLoc)));
        container.appendChild(frag);
    }
    function tagSidebar(allTags, activeTags) {
        const list = document.getElementById('tag-list');
        list.innerHTML = '';
        if (!allTags || allTags.length === 0) {
            const li = document.createElement('li');
            li.className = 'tag-empty';
            li.textContent = 'No tags yet';
            list.appendChild(li);
            return;
        }
        const frag = document.createDocumentFragment();
        allTags.forEach(tag => {
            const li = document.createElement('li');
            li.appendChild(tagPill(tag, activeTags.has(tag)));
            frag.appendChild(li);
        });
        list.appendChild(frag);
    }
    function emptyState(container, message) {
        const div = document.createElement('div');
        div.className = 'empty-state';
        div.innerHTML = `<span class="empty-icon">🗺️</span><p>${escHtml(message)}</p>`;
        container.appendChild(div);
    }
    function escHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }
    return { placeCard, tagPill, grid, tagSidebar, emptyState };
})();
