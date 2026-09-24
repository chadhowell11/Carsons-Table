// withBtn(btn, fn, busyLabel?) — every button that does work shows the click
// landed before the work starts: spinner (aria-busy), label swap, disabled,
// double-click guard. Restored in finally, whatever fn does.
export async function withBtn(btn, fn, busyLabel) {
  if (btn.getAttribute('aria-busy') === 'true') return undefined;
  const label = btn.textContent;
  btn.setAttribute('aria-busy', 'true');
  btn.disabled = true;
  if (busyLabel) btn.textContent = busyLabel;
  try {
    return await fn();
  } finally {
    btn.removeAttribute('aria-busy');
    btn.disabled = false;
    btn.textContent = label;
  }
}
