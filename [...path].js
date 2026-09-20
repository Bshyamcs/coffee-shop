'use strict';
// Vercel serverless entry: every /api/* request lands here (catch-all route).
const { handle } = require('../lib/app');

module.exports = (req, res) => handle(req, res);
