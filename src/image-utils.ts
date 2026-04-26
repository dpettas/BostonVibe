// @ts-nocheck
const ImageUtils = (() => {
  const IMAGE_API_PATH = '/api/images';

  function resize(file, maxSize = 1000, quality = 0.76) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.onload = (ev) => {
        const img = new Image();
        img.onerror = () => reject(new Error('Failed to load image'));
        img.onload = () => {
          let w = img.width, h = img.height;
          if (w > maxSize || h > maxSize) {
            if (w >= h) { h = Math.round(h * maxSize / w); w = maxSize; }
            else { w = Math.round(w * maxSize / h); h = maxSize; }
          }
          const canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          canvas.getContext('2d').drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL('image/webp', quality));
        };
        img.src = ev.target.result;
      };
      reader.readAsDataURL(file);
    });
  }

  async function saveDataUrl(dataUrl) {
    if (!String(dataUrl).startsWith('data:image/')) return dataUrl;

    const res = await fetch(IMAGE_API_PATH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dataUrl }),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok || !payload.url) {
      throw new Error(payload.error || `Image save failed: ${res.status}`);
    }
    return payload.url;
  }

  async function resizeAndSave(file, maxSize, quality) {
    const dataUrl = await resize(file, maxSize, quality);
    return saveDataUrl(dataUrl);
  }

  return { resize, saveDataUrl, resizeAndSave };
})();
