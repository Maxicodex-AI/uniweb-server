const express = require('express');
const router = express.Router();

router.post('/run', async (req, res) => {
  try {
    const { language, version, files } = req.body;

    if (!language || !files) {
      return res.status(400).json({
        message: 'Language and files are required',
      });
    }

    const pistonRes = await fetch('https://emkc.org/api/v2/piston/execute', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        language,
        version: version || '*',
        files,
      }),
    });

    const data = await pistonRes.json();

    if (!pistonRes.ok) {
      return res.status(pistonRes.status).json(data);
    }

    res.json(data);
  } catch (error) {
    console.error('Code execution error:', error);

    res.status(500).json({
      message: 'Failed to execute code',
      error: error.message,
    });
  }
});

module.exports = router;