// Vercel Serverless Function entry: delegates every request to the compiled NestJS app.
// `npm run vercel-build` compiles src/ → dist/ before Vercel bundles this function.
module.exports = require('../dist/serverless').default;
