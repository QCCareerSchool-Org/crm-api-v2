import bodyParser from 'body-parser';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import fs from 'fs';
import helmet from 'helmet';
import http from 'http';
import https from 'https';
import { logger } from './logger';

import { authenticate, checkAuthentication, options as authenticateOptions } from './authentication';
import { router as countryRouter, routerSecure as countryRouterSecure } from './countries/index';
import { router as countryCodesRouter, routerSecure as countryCodesRouterSecure } from './country-calling-codes/index';
import { router as studentRouter, routerSecure as studentRouterSecure } from './students/index';

dotenv.config();

if (typeof process.env.PORT === 'undefined') {
  throw Error('Environment variable PORT is undefined');
}
const HTTP_PORT = process.env.PORT;
const VERSION = 2;

// configuration
const app = express();
app.use(helmet());
app.use(compression());
app.use(cors({
  origin: [
    'https://studentcenter.qccareerschool.com',
    'http://localstudentcenter.com:4200',
    'http://livestudentcenter.com:4200',
  ],
  exposedHeaders: ['X-Total'],
  credentials: true,
}));
app.use(cookieParser());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// // middleware for CORS
// app.use((req: express.Request, res: express.Response, next: express.NextFunction): void => {
//   // allow any website to connect
//   res.setHeader('Access-Control-Allow-Origin', '*');
//   // allow the Authorization header in requests
//   res.setHeader('Access-Control-Allow-Headers', 'Authorization,Content-Type');
//   // allow the X-Total header in responses
//   res.setHeader('Access-Control-Expose-Headers', 'X-Total');
//   next();
// });

const router = express.Router();

router.options('/authenticate', authenticateOptions);
router.post('/authenticate', authenticate);

router.use(countryRouter);
router.use(countryCodesRouter);
router.use(studentRouter);

router.use(checkAuthentication); // all routes after this require authentication

router.use(countryRouterSecure);
router.use(countryCodesRouterSecure);
router.use(studentRouterSecure);

app.get('/', (req, res) => {
  res.send(`API at /v${VERSION}`);
});
app.use(`/v${VERSION}`, router);

process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception', err);
});

// start the server
http.createServer(app).listen(HTTP_PORT);
logger.info(`Server running on port ${HTTP_PORT}`);
