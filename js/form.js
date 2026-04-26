const Form = (() => {
  let _currentRating = 0;
  let _activePhotoTab = 'url';
  let _photos = [];
  const _pendingPhotoUploads = new Set();
  let _photoBatchId = 0;
  let _currentCategory = 'restaurant';

  function init(onSave) {
    document.getElementById('place-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      clearErrors();
      const submitBtn = e.currentTarget.querySelector('button[type="submit"]');
      if (submitBtn) submitBtn.disabled = true;
      try {
        await _waitForPhotoUploads();
        const { valid, data, errors } = validate();
        if (!valid) { showErrors(errors); return; }
        await onSave(data);
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });

    // Category toggle
    document.querySelectorAll('.category-btn').forEach(btn => {
      btn.addEventListener('click', () => setCategory(btn.dataset.category));
    });

    // Visited toggle
    document.getElementById('field-visited').addEventListener('change', (e) => {
      document.getElementById('rating-wrap').hidden = !e.target.checked;
      if (!e.target.checked) setRating(0);
    });

    // Star picker
    document.querySelectorAll('.star-btn').forEach(btn => {
      btn.addEventListener('click', () => setRating(parseInt(btn.dataset.value)));
      btn.addEventListener('mouseenter', () => highlightStars(parseInt(btn.dataset.value)));
    });
    document.getElementById('star-picker').addEventListener('mouseleave', () => highlightStars(_currentRating));

    // Photo source tabs
    document.querySelectorAll('[data-photo-tab]').forEach(tab => {
      tab.addEventListener('click', () => _switchPhotoTab(tab.dataset.photoTab));
    });

    // URL Add button
    document.getElementById('btn-add-photo-url').addEventListener('click', () => {
      const url = document.getElementById('field-image').value.trim();
      if (!url) return;
      if (!url.startsWith('http')) {
        document.getElementById('err-image').textContent = 'URL must start with http or https.';
        return;
      }
      document.getElementById('err-image').textContent = '';
      _addPhoto(url);
      document.getElementById('field-image').value = '';
    });

    // File input (multiple)
    document.getElementById('field-image-file').addEventListener('change', (e) => {
      Array.from(e.target.files)
        .filter(f => f.type.startsWith('image/'))
        .forEach(f => _addPhotoFromFile(f));
      e.target.value = '';
    });

    // Drag-and-drop on upload label
    const uploadLabel = document.querySelector('.file-upload-label');
    uploadLabel.addEventListener('dragover', (e) => {
      if (!e.dataTransfer.types.includes('Files')) return;
      e.preventDefault();
      uploadLabel.classList.add('file-upload-label--drag');
    });
    uploadLabel.addEventListener('dragleave', () => {
      uploadLabel.classList.remove('file-upload-label--drag');
    });
    uploadLabel.addEventListener('drop', (e) => {
      e.preventDefault();
      uploadLabel.classList.remove('file-upload-label--drag');
      Array.from(e.dataTransfer.files)
        .filter(f => f.type.startsWith('image/'))
        .forEach(f => {
          _switchPhotoTab('upload');
          _addPhotoFromFile(f);
        });
    });

    // Remove photo (delegated)
    document.getElementById('photos-list').addEventListener('click', (e) => {
      const btn = e.target.closest('.photos-list-remove');
      if (!btn) return;
      _photos.splice(parseInt(btn.dataset.index), 1);
      _renderPhotosList();
    });
  }

  function _addPhoto(src) {
    _photos.push(src);
    _renderPhotosList();
  }

  function _renderPhotosList() {
    const list = document.getElementById('photos-list');
    if (!list) return;
    list.innerHTML = '';
    _photos.forEach((src, i) => {
      const item = document.createElement('div');
      item.className = 'photos-list-item';
      item.innerHTML = `
        <img src="${_esc(src)}" alt="Photo ${i + 1}">
        <button type="button" class="photos-list-remove" data-index="${i}" aria-label="Remove photo ${i + 1}">✕</button>
      `;
      list.appendChild(item);
    });
  }

  function _switchPhotoTab(tab) {
    _activePhotoTab = tab;
    document.querySelectorAll('[data-photo-tab]').forEach(btn => {
      const active = btn.dataset.photoTab === tab;
      btn.classList.toggle('photo-tab--active', active);
      btn.setAttribute('aria-selected', active);
    });
    document.getElementById('photo-panel-url').hidden = tab !== 'url';
    document.getElementById('photo-panel-upload').hidden = tab !== 'upload';
  }

  function resetPhoto() {
    _photos = [];
    _photoBatchId += 1;
    _pendingPhotoUploads.clear();
    _activePhotoTab = 'url';
    _switchPhotoTab('url');
    document.getElementById('field-image').value = '';
    const fi = document.getElementById('field-image-file');
    if (fi) fi.value = '';
    _renderPhotosList();
  }

  function addPhoto(src) {
    _addPhoto(src);
  }

  function setPhotoFromFile(file) {
    _addPhotoFromFile(file);
  }

  async function _addPhotoFromFile(file) {
    const batchId = _photoBatchId;
    const error = document.getElementById('err-image');
    if (error) error.textContent = 'Saving photo...';
    const upload = (async () => {
      const src = await ImageUtils.resizeAndSave(file);
      if (batchId === _photoBatchId) _addPhoto(src);
    })();
    _pendingPhotoUploads.add(upload);
    try {
      await upload;
      if (error) error.textContent = '';
    } catch {
      if (error) error.textContent = 'Photo could not be saved. Make sure the local server is running.';
    } finally {
      _pendingPhotoUploads.delete(upload);
    }
  }

  async function _waitForPhotoUploads() {
    if (_pendingPhotoUploads.size === 0) return;
    await Promise.allSettled(Array.from(_pendingPhotoUploads));
  }

  function setCategory(cat) {
    _currentCategory = cat;
    document.getElementById('field-category').value = cat;
    document.querySelectorAll('.category-btn').forEach(btn => {
      btn.classList.toggle('category-btn--active', btn.dataset.category === cat);
    });
  }

  function setRating(val) {
    _currentRating = val;
    document.getElementById('field-rating').value = val;
    highlightStars(val);
  }

  function highlightStars(val) {
    document.querySelectorAll('.star-btn').forEach(btn => {
      btn.classList.toggle('star-btn--active', parseInt(btn.dataset.value) <= val);
    });
  }

  function validate() {
    const category = document.getElementById('field-category').value || 'restaurant';
    const name     = document.getElementById('field-name').value.trim();
    const desc     = document.getElementById('field-desc').value.trim();
    const address  = document.getElementById('field-address').value.trim();
    const mapLink  = document.getElementById('field-map').value.trim();
    const tagsRaw  = document.getElementById('field-tags').value.trim();
    const visited  = document.getElementById('field-visited').checked;
    const rating   = visited ? (parseInt(document.getElementById('field-rating').value) || 0) : 0;
    const grRaw    = parseFloat(document.getElementById('field-google-rating').value);
    const googleRating = (!isNaN(grRaw) && grRaw >= 1 && grRaw <= 5)
      ? Math.round(grRaw * 10) / 10 : 0;

    // Auto-include any URL left in the URL field
    const photos = [..._photos];
    if (_activePhotoTab === 'url') {
      const urlVal = document.getElementById('field-image').value.trim();
      if (urlVal && urlVal.startsWith('http')) photos.push(urlVal);
    }

    const errors = {};
    if (!name) errors.name = 'Name is required.';
    else if (name.length > 100) errors.name = 'Name must be 100 characters or fewer.';
    if (!desc) errors.desc = 'Description is required.';
    if (!mapLink) errors.mapLink = 'Map link or coordinates are required.';

    const valid = Object.keys(errors).length === 0;
    return {
      valid, errors,
      data: valid ? { name, description: desc, address, mapLink, tags: tagsRaw, photos, visited, rating, googleRating, category } : null,
    };
  }

  function clearErrors() {
    document.querySelectorAll('.field-error').forEach(el => el.textContent = '');
  }

  function showErrors(errors) {
    const map = { name: 'err-name', desc: 'err-desc', mapLink: 'err-map' };
    Object.entries(errors).forEach(([field, msg]) => {
      const el = document.getElementById(map[field]);
      if (el) el.textContent = msg;
    });
    const firstField = { name: 'field-name', desc: 'field-desc', mapLink: 'field-map' };
    const firstError = Object.keys(errors)[0];
    if (firstError && firstField[firstError]) document.getElementById(firstField[firstError]).focus();
  }

  function _esc(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  return { init, setRating, setCategory, resetPhoto, addPhoto, setPhotoFromFile };
})();
