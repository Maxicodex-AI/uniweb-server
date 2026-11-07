// scripts/migrateFleet.js
//
// Manual way to run the fleet migration:  node scripts/migrateFleet.js
// You normally do not need this: the server runs the same migration
// automatically every time it starts (see utils/fleetMigration.js).

require('dotenv').config();
const mongoose = require('mongoose');
const { runFleetMigration } = require('../utils/fleetMigration');

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const result = await runFleetMigration();
  console.log('Done.', result);
  await mongoose.disconnect();
})().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});