// Vercel entry. The API is the same NestJS app as `npm run start`, started once per warm function instance.
// Bundled into serverless-dist/handler.js by `npm run build:vercel` so the function needs no node_modules tracing.
require('reflect-metadata');
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../dist/app.module');
const { configureApp } = require('../dist/configure-app');
const { loadConfig } = require('../dist/config');

let ready;
function getServer() {
  ready ??= (async () => {
    const app = await NestFactory.create(AppModule, { logger: ['error', 'warn'] });
    configureApp(app, loadConfig());
    await app.init();
    return app.getHttpAdapter().getInstance();
  })();
  return ready;
}

module.exports = async (req, res) => {
  const server = await getServer();
  return server(req, res);
};
