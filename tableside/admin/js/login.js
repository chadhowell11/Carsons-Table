import { supabase } from './supabase-client.js';
import { apiFetch, ApiError } from './apiFetch.js';
import { withBtn } from './withBtn.js';
import { applyBrand } from './brand.js';

applyBrand();
const $ = (id) => document.getElementById(id);
const msg = (text, kind = '') => { const m = $('msg'); m.textContent = text; m.className = `msg ${kind}`; };
const show = (state) => { for (const s of document.querySelectorAll('[data-state]')) s.hidden = s.dataset.state !== state; };

function nextUrl() {
  const n = new URLSearchParams(location.search).get('next');
  return n && n.startsWith('/admin') && !n.startsWith('/admin/login') ? n : '/admin/';
}

// After any successful sign-in, ask the server whether this user belongs here.
async function checkMembership() {
  try {
    await apiFetch('/api/admin/me', {}, { redirectOn401: false });
    location.assign(nextUrl());
  } catch (e) {
    if (e instanceof ApiError && e.code === 'NOT_A_MEMBER') {
      const { data } = await supabase.auth.getUser();
      $('who').textContent = (data.user && data.user.email) || '';
      $('not-member-msg').textContent = e.message;
      show('not-member');
      msg('');
      return;
    }
    show('form');
    msg(e.message, 'bad');
  }
}

$('login').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const email = $('email').value.trim();
  const password = $('password').value;
  if (!email || !password) { msg('Enter your email and password.', 'bad'); return; }
  withBtn($('signin'), async () => {
    msg('');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      // 400 from the auth service is a wrong email/password; anything else is the service.
      msg(error.status === 400 ? 'That email and password don’t match.' : 'The sign-in service didn’t respond. Try again in a moment.', 'bad');
      return;
    }
    await checkMembership();
  }, 'Signing in…');
});

$('magic').addEventListener('click', () => {
  const email = $('email').value.trim();
  if (!email) { msg('Enter your email first.', 'bad'); return; }
  withBtn($('magic'), async () => {
    const { error } = await supabase.auth.signInWithOtp({
      email, options: { shouldCreateUser: false, emailRedirectTo: `${location.origin}/admin/login` },
    });
    if (error) msg(`We couldn’t send the link: ${error.message}`, 'bad');
    else msg(`Check ${email} for a sign-in link.`, 'ok');
  }, 'Sending…');
});

$('signout').addEventListener('click', () => withBtn($('signout'), async () => {
  await supabase.auth.signOut();
  show('form');
  msg('Signed out.', 'ok');
}, 'Signing out…'));

// Returning from a magic link, or already signed in on this device.
const { data } = await supabase.auth.getSession();
if (data.session) await checkMembership();
