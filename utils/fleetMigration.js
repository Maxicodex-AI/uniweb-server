// utils/fleetMigration.js
//
// Brings an existing database up to date with the fleet update. It runs
// automatically every time the server starts (see server.js), and is safe to
// run any number of times: once everything is migrated it finds nothing to
// do and returns in a few milliseconds.
//
//  1. Drops the old unique index on Driver.tricycleNumber. New drivers have no
//     tricycle number until their first daily check-in, and that old index
//     would reject the second one.
//  2. Marks every driver saved before this update (no accountStatus yet) as
//     "approved" so nobody is locked out, takes them off shift, and tidies
//     phone numbers (+234... becomes 0...).
//  3. Turns the tricycle numbers of those drivers into entries in the new
//     roster. Only the drivers migrated in step 2 are used, so a tricycle an
//     admin later renames or deletes is never brought back.
//
// It uses the raw collections on purpose: Mongoose would apply the new
// defaults (accountStatus 'pending') to old documents while reading them.

const mongoose = require('mongoose');

const normalizePhone = p => {
  let s = String(p || '').replace(/[\s\-()]/g, '');
  if (s.startsWith('+234')) s = '0' + s.slice(4);
  else if (s.startsWith('234') && s.length === 13) s = '0' + s.slice(3);
  return s;
};

async function runFleetMigration({ log = console.log, db = mongoose.connection.db } = {}) {
  const drivers = db.collection('drivers');
  const vehicles = db.collection('vehicles');

  // ----- 1. Old unique index -----
  let indexes = [];
  try {
    indexes = await drivers.indexes();
  } catch (err) {
    // The collection does not exist yet (a brand new database): nothing to do
  }
  if (indexes.some(ix => ix.name === 'tricycleNumber_1')) {
    await drivers.dropIndex('tricycleNumber_1');
    log('Fleet migration: dropped old index tricycleNumber_1');
  }

  // ----- 2. Drivers saved before the fleet update -----
  const old = await drivers.find({ accountStatus: { $exists: false } }).toArray();
  if (old.length === 0) return { migrated: 0, vehiclesCreated: 0 };

  log(`Fleet migration: updating ${old.length} existing driver(s)`);

  for (const d of old) {
    const set = {
      accountStatus: 'approved',
      statusReason: null,
      isFleetAdmin: false,
      locationConsent: false, // they agree on their next sign-in
      isOnShift: false,
      status: 'offline',
      currentVehicle: null,
      checkedInDay: null,
    };

    const fixed = normalizePhone(d.phone);
    if (fixed && fixed !== d.phone) {
      const clash = await drivers.findOne({ phone: fixed, _id: { $ne: d._id } });
      if (clash) log(`Fleet migration: phone clash, left unchanged for ${d.name} (${d.phone})`);
      else set.phone = fixed;
    }

    await drivers.updateOne({ _id: d._id }, { $set: set });
    log(`Fleet migration: approved ${d.name}`);
  }

  // ----- 3. Roster from the tricycle numbers of those drivers -----
  let vehiclesCreated = 0;
  for (const d of old) {
    const number = String(d.tricycleNumber || '').trim().toUpperCase();
    if (!number) continue;
    const r = await vehicles.updateOne(
      { number },
      {
        $setOnInsert: {
          number,
          plate: '',
          seats: d.totalSeats || 3,
          status: 'available',
          notes: 'Imported from an existing driver',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      },
      { upsert: true }
    );
    if (r.upsertedCount) vehiclesCreated += 1;
  }
  log(`Fleet migration: ${vehiclesCreated} tricycle(s) added to the roster`);

  return { migrated: old.length, vehiclesCreated };
}

module.exports = { runFleetMigration };