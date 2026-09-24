// @ts-check
// One definition of every shared list (OHF §3). Postgres check constraints mirror
// these; test/static/schema-coverage.test.js enumerates this file and fails if a
// constraint's value set differs from the list here. Any per-key map (labels,
// icons, colors) must be derived from these or tested against them.

export const TENANT_STATUS = /** @type {const} */ (['draft', 'live', 'paused', 'archived']);
export const ROLES = /** @type {const} */ (['owner', 'manager', 'staff']);
/** Higher rank = more authority. Derived from ROLES order, never hand-typed. */
export const ROLE_RANK = Object.freeze(Object.fromEntries(ROLES.map((r, i) => [r, ROLES.length - i])));

export const FEATURES = /** @type {const} */ (['ordering', 'reservations', 'specials', 'events', 'gallery', 'members', 'squareSync']);

/** 0 = Sunday, matching JS Date#getDay and hours.dow. */
export const DOW = /** @type {const} */ ([0, 1, 2, 3, 4, 5, 6]);
export const DOW_LABELS = Object.freeze(['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']);

export const CONTENT_STATUS = /** @type {const} */ (['draft', 'published']);
export const SPECIAL_STATUS = /** @type {const} */ (['draft', 'published', 'archived']);
export const EVENT_STATUS = /** @type {const} */ (['draft', 'published', 'cancelled']);

export const DIETARY_TAGS = /** @type {const} */ (['vegetarian', 'vegan', 'gluten_free', 'dairy_free', 'contains_nuts', 'shellfish', 'spicy']);
export const DIETARY_LABELS = Object.freeze({
  vegetarian: 'Vegetarian', vegan: 'Vegan', gluten_free: 'Gluten-free', dairy_free: 'Dairy-free',
  contains_nuts: 'Contains nuts', shellfish: 'Contains shellfish', spicy: 'Spicy',
});

export const AVAILABILITY = /** @type {const} */ (['available', 'sold_out', 'hidden']);
export const AVAILABILITY_LABELS = Object.freeze({ available: 'Available', sold_out: 'Sold out', hidden: 'Hidden' });

export const MENU_KINDS = /** @type {const} */ (['food', 'drinks', 'wine', 'brunch', 'dessert', 'kids', 'other']);
export const MENU_LAYOUTS = /** @type {const} */ (['cards', 'table']);
export const MEDIA_KINDS = /** @type {const} */ (['dish', 'hero', 'exterior', 'logo', 'favicon', 'og', 'other']);
export const SPECIAL_KINDS = /** @type {const} */ (['drink', 'food', 'happy_hour', 'other']);
export const EVENT_KINDS = /** @type {const} */ (['live_music', 'trivia', 'tasting', 'private', 'holiday', 'other']);
export const MODIFIER_SELECTION = /** @type {const} */ (['one', 'many']);
export const ORDERING_MODES = /** @type {const} */ (['off', 'pickup', 'curbside', 'both']);
export const RESERVATION_MODES = /** @type {const} */ (['off', 'request']);

// Reserved for Phase 2 (tables exist in 0003, no UI yet).
export const ORDER_MODES = /** @type {const} */ (['pickup', 'curbside']);
export const ORDER_STATUSES = /** @type {const} */ (['new', 'accepted', 'ready', 'completed', 'cancelled']);
export const PAYMENT_STATES = /** @type {const} */ (['none', 'link_sent', 'paid']);
export const RESERVATION_STATUSES = /** @type {const} */ (['new', 'confirmed', 'declined', 'no_show']);
export const RESERVATION_SOURCES = /** @type {const} */ (['web', 'phone', 'walk_in', 'staff']);
export const NOTIFICATION_CHANNELS = /** @type {const} */ (['email', 'sms']);
export const NOTIFICATION_STATUSES = /** @type {const} */ (['pending', 'sent', 'failed', 'suppressed']);

export const AUDIT_ACTIONS = /** @type {const} */ (['insert', 'update', 'delete']);

/**
 * Which columns each enum constrains. The schema-coverage guard reads this and
 * asserts each listed column carries a check constraint with exactly these values.
 * An enum that constrains nothing in SQL is listed with [] and a reason.
 */
export const ENUM_COLUMNS = Object.freeze({
  TENANT_STATUS: ['platform.tenants.status'],
  ROLES: ['platform.staff_memberships.role'],
  DOW: ['hours.dow'],
  CONTENT_STATUS: [
    'locations.status', 'hours.status', 'hours_exceptions.status', 'media.status', 'menus.status',
    'menu_sections.status', 'menu_items.status', 'item_servings.status', 'modifier_groups.status',
    'modifiers.status', 'site_content.status',
  ],
  SPECIAL_STATUS: ['specials.status'],
  EVENT_STATUS: ['events.status'],
  DIETARY_TAGS: ['menu_items.dietary_tags'],
  AVAILABILITY: ['menu_items.availability'],
  MENU_KINDS: ['menus.kind'],
  MENU_LAYOUTS: ['menus.layout'],
  MEDIA_KINDS: ['media.kind'],
  SPECIAL_KINDS: ['specials.kind'],
  EVENT_KINDS: ['events.kind'],
  MODIFIER_SELECTION: ['modifier_groups.selection'],
  ORDERING_MODES: ['locations.ordering_mode'],
  RESERVATION_MODES: ['locations.reservation_mode'],
  ORDER_MODES: ['orders.mode'],
  ORDER_STATUSES: ['orders.status'],
  PAYMENT_STATES: ['orders.payment_state'],
  RESERVATION_STATUSES: ['reservation_requests.status'],
  RESERVATION_SOURCES: ['reservation_requests.source'],
  NOTIFICATION_CHANNELS: ['notifications_outbox.channel'],
  NOTIFICATION_STATUSES: ['notifications_outbox.status'],
  AUDIT_ACTIONS: ['platform.audit_log.action'],
  FEATURES: [], // stored as keys of platform.tenants.features jsonb; normalized in lib/tenants.js
});
