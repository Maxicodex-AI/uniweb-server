// utils/openStatus.js
// Is a provider open right now? Worked out on the server, in Nigerian time, so
// a wrong phone clock cannot mislead a student.

const WEEKDAY = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const LIVE_TRUST_MS = 12 * 3600 * 1000; // a manual Open/Busy/Closed is trusted for 12 hours

function lagosNow(date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Lagos', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(date);
  const get = t => (parts.find(p => p.type === t) || {}).value || '';
  return { day: WEEKDAY[get('weekday')] ?? 0, mins: (parseInt(get('hour'), 10) % 24) * 60 + parseInt(get('minute'), 10) };
}

const toMin = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };

function scheduledOpen(p, now) {
  if (p.open24h) return true;
  if (!p.hours || p.hours.length === 0) return null; // no schedule set
  const { day, mins } = lagosNow(now);
  return p.hours.some(h => h.days.includes(day) && mins >= toMin(h.open) && mins < toMin(h.close));
}

// -> { state: 'open' | 'busy' | 'closed' | 'unknown', text }
function providerStatus(p, now = new Date()) {
  const fresh = p.liveStatusUpdatedAt && now - new Date(p.liveStatusUpdatedAt) < LIVE_TRUST_MS;
  if (fresh && p.liveStatus === 'closed') return { state: 'closed', text: 'Closed' };
  if (fresh && p.liveStatus === 'busy') return { state: 'busy', text: 'Open · busy right now' };
  if (fresh && p.liveStatus === 'open') return { state: 'open', text: 'Open now' };

  const s = scheduledOpen(p, now);
  if (s === true) return { state: 'open', text: p.open24h ? 'Open 24 hours' : 'Open now' };
  if (s === false) return { state: 'closed', text: 'Closed right now' };
  return { state: 'unknown', text: 'Opening hours not set' };
}

// What a student may see. Never the password, owner's email or review details.
function publicProvider(p, now = new Date()) {
  const hasPin = p.location && p.location.lat != null && p.location.lng != null;
  return {
    _id: p._id,
    businessName: p.businessName,
    type: p.type,
    address: p.address,
    description: p.description,
    services: p.services || [],
    hours: p.hours || [],
    open24h: !!p.open24h,
    location: hasPin ? { lat: p.location.lat, lng: p.location.lng } : null,
    phone: p.showPhone ? p.phone : '',
    status: providerStatus(p, now),
  };
}

module.exports = { lagosNow, providerStatus, publicProvider };