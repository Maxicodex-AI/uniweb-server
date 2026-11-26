// utils/healthValidate.js
// Shared checks for opening hours and services (used for the medical centre
// settings and for provider listings).
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const clean = (v, max) => String(v == null ? '' : v).trim().slice(0, max);

// -> { value: [...] } or { error: 'message' }
function validateHours(input) {
  const hours = Array.isArray(input) ? input : [];
  if (hours.length > 10) return { error: 'Too many opening-hour rows (10 at most).' };
  const out = [];
  for (const h of hours) {
    const days = Array.isArray(h.days)
      ? [...new Set(h.days.map(Number))].filter(d => Number.isInteger(d) && d >= 0 && d <= 6)
      : [];
    if (days.length === 0) return { error: 'Each opening-hours row needs at least one day.' };
    if (!TIME_RE.test(h.open) || !TIME_RE.test(h.close)) return { error: 'Opening and closing times must look like 08:00.' };
    if (h.open >= h.close) return { error: 'Closing time must be later than opening time.' };
    out.push({ label: clean(h.label, 40), days: days.sort(), open: h.open, close: h.close });
  }
  return { value: out };
}

function cleanServices(input) {
  const list = Array.isArray(input) ? input : [];
  if (list.length > 20) return { error: 'Too many services (20 at most).' };
  return { value: list.map(s => clean(s, 40)).filter(Boolean) };
}

module.exports = { validateHours, cleanServices, clean };