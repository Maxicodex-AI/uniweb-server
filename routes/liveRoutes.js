const express = require('express');

const router = express.Router();

const auth = require('../middleware/auth');

const {
  startLive,
  getLive,
  endLive,
  joinLive,
} = require('../controllers/liveController');


// start live
router.post("/", auth, startLive);

// get live
router.get("/", auth, getLive);

// end live
router.put("/:id/end", auth, endLive);

// join live
router.get("/:id/join", auth, joinLive);


module.exports = router;