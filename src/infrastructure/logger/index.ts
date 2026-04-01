import pino from 'pino';
import { config } from '../../config/env';

// OBS-02: Structured logs
export const logger = pino({
  level: config.LOG_LEVEL,
  formatters: {
    level: (label) => {
      return { level: label.toUpperCase() };
    },
  },
  redact: {
    // Security: Do not log secrets (Zero-Tolerance Policy)
    paths: [
      'password', 
      'password_encrypted', 
      'cookies', 
      'session_cookies',
      'headers.cookie',
      'headers.authorization'
    ],
    censor: '[REDACTED]',
  },
  transport: process.env.NODE_ENV !== 'production' 
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
        }
      }
    : undefined,
});
