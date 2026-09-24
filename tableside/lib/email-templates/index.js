// @ts-check
// Email templates. Each takes data and returns { subject, text, html }.
// Values are escaped for HTML; no template names a tenant — data does.
import { escapeHtml as h } from '../../renderer/html.js';

/** @param {{ restaurant: string, inviter?: string, role: string, url: string }} d */
export function staffInvite(d) {
  const who = d.inviter ? `${d.inviter} has invited you` : 'You have been invited';
  return {
    subject: `You're invited to ${d.restaurant}'s staff admin`,
    text: `${who} to help manage ${d.restaurant}'s website as ${d.role}.\n\nSet your password and sign in:\n${d.url}\n\nIf you weren't expecting this, you can ignore it.`,
    html: `<p>${h(who)} to help manage <b>${h(d.restaurant)}</b>'s website as ${h(d.role)}.</p><p><a href="${h(d.url)}">Set your password and sign in</a></p><p>If you weren't expecting this, you can ignore it.</p>`,
  };
}

/** @param {{ restaurant: string, url: string }} d */
export function passwordReset(d) {
  return {
    subject: `Reset your ${d.restaurant} admin password`,
    text: `Someone asked to reset the password for your ${d.restaurant} admin account.\n\nChoose a new password:\n${d.url}\n\nIf that wasn't you, ignore this email; your password hasn't changed.`,
    html: `<p>Someone asked to reset the password for your <b>${h(d.restaurant)}</b> admin account.</p><p><a href="${h(d.url)}">Choose a new password</a></p><p>If that wasn't you, ignore this email; your password hasn't changed.</p>`,
  };
}
