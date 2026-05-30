import pino from 'pino';

const logger = pino({
  level: process.env.NEXT_PUBLIC_LOG_LEVEL ?? 'debug',
  browser: { asObject: false },
});

export default logger;
