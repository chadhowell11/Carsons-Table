import { supabase } from './supabase-client.js';
import { apiFetch } from './apiFetch.js';
import { withBtn } from './withBtn.js';
import { applyBrand } from './brand.js';

applyBrand();
const $ = (id) => document.getElementById(id);

$('signout').addEventListener('click', () => withBtn($('signout'), async () => {
  await supabase.auth.signOut();
  location.assign('/admin/login');
}, 'Signing out…'));

try {
  const me = await apiFetch('/api/admin/me');
  $('me-email').textContent = me.user.email || me.user.id;
  $('me-role').textContent = me.role;
  $('me-tenant').textContent = me.tenant.name;
  $('me-features').textContent = Object.entries(me.features).filter(([, on]) => on).map(([k]) => k).join(', ') || 'none';
  $('me').hidden = false;
  $('msg').textContent = '';
} catch (e) {
  $('msg').textContent = e.message;
  $('msg').className = 'msg bad';
}
