import * as Joi from 'joi';

export const envValidation = Joi.object({
  // Application
  APP_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  PORT: Joi.number().port().default(3000),
  LOG_LEVEL: Joi.string().valid('debug', 'info', 'warn', 'error').default('info'),

  // Swagger
  SWAGGER_ENABLED: Joi.string().valid('true', 'false').default('true'),

  // Client auth config
  CLIENTS_CONFIG_PATH: Joi.string().optional(),

  // Model
  MODEL_PROVIDER: Joi.string().valid('openai', 'amvera').default('openai'),
  MODEL_ENDPOINT: Joi.string().uri().optional(),
  MODEL_NAME: Joi.string().optional(),
  MODEL_TIMEOUT_MS: Joi.number().integer().min(1000).default(120_000),
  MODEL_API_KEY_PATH: Joi.string().optional(),

  // Request limits
  REQUEST_BODY_LIMIT: Joi.number()
    .integer()
    .min(1024)
    .default(1024 * 1024),
  REQUEST_TIMEOUT_MS: Joi.number().integer().min(1000).default(300_000),
}).unknown(true);
