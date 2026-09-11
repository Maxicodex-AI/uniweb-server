const Chat = require('../models/Chat');

async function cleanupDeletedMessages() {
  try {
    const fifteenHoursAgo = new Date(Date.now() - 15 * 60 * 60 * 1000);
    await Chat.deleteMany({
      deletedForAll: true,
      deletedAt: { $lt: fifteenHoursAgo },
    });
    console.log('Cleaned up old deleted messages');
  } catch (err) {
    console.error('Cleanup error:', err);
  }
}

module.exports = { cleanupDeletedMessages };