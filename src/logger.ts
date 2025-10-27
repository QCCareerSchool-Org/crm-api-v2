import * as dotenv from 'dotenv';
import { createLogger, format, transports } from 'winston';
import { NodemailerTransport } from '@qccareerschool/winston-nodemailer';

dotenv.config();

if (typeof process.env.EMAIL_USERNAME === 'undefined') {
  throw new Error('EMAIL_USERNAME not specified in .env file');
}
const username = process.env.EMAIL_USERNAME;

if (typeof process.env.EMAIL_PASSWORD === 'undefined') {
  throw new Error('EMAIL_PASSWORD not specified in .env file');
}
const password = process.env.EMAIL_PASSWORD;

if (typeof process.env.EMAIL_HOST === 'undefined') {
  throw new Error('EMAIL_HOST not specified in .env file');
}
const host = process.env.EMAIL_HOST;

if (typeof process.env.EMAIL_TO === 'undefined') {
  throw new Error('EMAIL_TO not specified in .env file');
}
const to = process.env.EMAIL_TO;

if (typeof process.env.EMAIL_FROM === 'undefined') {
  throw new Error('EMAIL_FROM not specified in .env file');
}
const from = process.env.EMAIL_FROM;

export const logger = createLogger({
  level: 'info',
  format: format.json(),
  // defaultMeta: { service: 'user-service' },
  transports: [
    //
    // - Write all logs with level `error` and below to `error.log`
    // - Write all logs with level `info` and below to `combined.log`
    //
    new transports.File({ filename: 'error.log', level: 'error' }),
    new transports.File({ filename: 'combined.log' }),
    // new NodemailerTransport({
    //   auth: { pass: password, user: username },
    //   filter: ({ level, message, meta }) => level === 'error' || level === 'crit' || level === 'alert' || level === 'emerg',
    //   from,
    //   host,
    //   port: 587,
    //   secure: false,
    //   tags: [ 'crm-api' ],
    //   to,
    // }),
  ],
});

//
// If we're not in production then log to the `console` with the format:
// `${info.level}: ${info.message} JSON.stringify({ ...rest }) `
//
if (process.env.NODE_ENV === 'production') {
  logger.add(new NodemailerTransport({
    auth: { pass: password, user: username },
    filter: ({ level, message, meta }) => level === 'error' || level === 'crit' || level === 'alert' || level === 'emerg',
    from,
    host,
    port: 587,
    secure: false,
    tags: [ 'crm-api' ],
    to,
  }));
} else {
  logger.add(new transports.Console({
    format: format.simple(),
  }));
}







// export const logger = new winston.Logger({
//   transports: [
//     new winston.transports.Console({
//       colorize: true,
//     }),
//     new winston.transports.File({
//       filename: '/var/log/crm-api.log',
//       json: false,
//     }),
//     new NodemailerTransport({
//       auth: {
//         pass: password,
//         user: username,
//       },
//       filter: ({ level, message, meta }) => level === 'error' || level === 'crit' || level === 'alert' || level === 'emerg',
//       from,
//       host,
//       port: 587,
//       secure: false,
//       tags: [ 'crm-api' ],
//       to,
//     }),
//   ],
// });
