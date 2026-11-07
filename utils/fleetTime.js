// utils/fleetTime.js
// "Today" for the fleet is a Nigerian calendar day (Africa/Lagos, UTC+1, no
// daylight saving). Always computed on the server so a driver cannot change
// it by changing their phone's clock.

const dayFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Africa/Lagos',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const hourFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Africa/Lagos',
  hour: '2-digit',
  hour12: false,
});

// 'YYYY-MM-DD'. offsetDays = -1 gives yesterday.
function lagosDay(offsetDays = 0, now = new Date()) {
  return dayFmt.format(new Date(now.getTime() + offsetDays * 86400000));
}

function lagosHour(now = new Date()) {
  return parseInt(hourFmt.format(now), 10) % 24;
}

function greeting(now = new Date()) {
  const h = lagosHour(now);
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

module.exports = { lagosDay, lagosHour, greeting };