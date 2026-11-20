// utils/complaintCategories.js
// What a student can report, and which reports are treated as high priority.
module.exports.CATEGORIES = {
  unsafe_driving: { label: 'Unsafe driving', priority: 'high' },
  harassment: { label: 'Harassment or threatening behaviour', priority: 'high' },
  overcharging: { label: 'Overcharging', priority: 'normal' },
  rude_behaviour: { label: 'Rude behaviour', priority: 'normal' },
  vehicle_condition: { label: 'Dirty or unsafe tricycle', priority: 'normal' },
  lost_item: { label: 'Lost item', priority: 'normal' },
  other: { label: 'Something else', priority: 'normal' },
};