// utils/phone.js
// 08012345678, +2348012345678 and 234 801 234 5678 are the same number.
function normalizePhone(p) {
  let s = String(p || '').replace(/[\s\-()]/g, '');
  if (s.startsWith('+234')) s = '0' + s.slice(4);
  else if (s.startsWith('234') && s.length === 13) s = '0' + s.slice(3);
  return s;
}
const PHONE_RE = /^0\d{10}$/;
module.exports = { normalizePhone, PHONE_RE };