'use strict';
// Vercel serverless entry. vercel.json rewrites every /api/* request here and passes the original
// path in the `__path` query parameter, so routing never depends on Vercel's filename matching.
const { handle } = require('../lib/app');

module.exports = (req, res) => handle(req, res);
