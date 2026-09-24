// Fills brand slots from window.__BRAND__ (name, logo). Pages never hardcode them.
export function applyBrand(doc = document) {
  const b = window.__BRAND__ || {};
  for (const el of doc.querySelectorAll('[data-brand-name]')) el.textContent = b.name || '';
  if (b.logo) {
    for (const el of doc.querySelectorAll('[data-brand-mark]')) {
      const img = doc.createElement('img');
      img.src = b.logo; img.alt = ''; img.height = 44;
      el.replaceWith(img);
    }
  }
  if (b.name) doc.title = `${doc.title} · ${b.name}`;
}
