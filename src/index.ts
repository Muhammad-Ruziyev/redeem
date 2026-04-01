import Fastify from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { logger } from './infrastructure/logger';
import { redeemRoutes } from './presentation/routes/redeem.routes';
import { accountRoutes } from './presentation/routes/account.routes';
import { forceRefreshRoutes } from './presentation/routes/force-refresh.routes';
import { config } from './config/env';

// Import workers to ensure they start when the app starts
import './application/workers/redeem.worker';
import './application/workers/session-refresh.worker';

export const buildApp = () => {
  const app = Fastify({
    // We disable the built-in fastify logger creation
    // because we want to use our custom instantiated Pino logger
    loggerInstance: logger,
  });

  // Add Zod validation to Fastify
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  // Register routes
  app.register(redeemRoutes, { prefix: '/api/v1' });
  app.register(accountRoutes, { prefix: '/api/v1' });
  app.register(forceRefreshRoutes, { prefix: '/api/v1' });

  // Healthcheck endpoint
  app.get('/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  return app;
};

const start = async () => {
  const app = buildApp();
  try {
    await app.listen({ port: config.APP_PORT, host: '0.0.0.0' });
    logger.info(`Server listening on port ${config.APP_PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

// Automatically start the application
start();
