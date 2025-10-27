import * as Joi from 'joi';
import * as bcryptjs from 'bcryptjs';
import * as crypto from 'crypto';
import * as dotenv from 'dotenv';
import * as express from 'express';
import * as fs from 'fs';
import * as jwt from 'jsonwebtoken';

import * as HttpStatus from '@qccareerschool/http-status';
import config from './config';
import * as keys from './keys';
import { logger } from './logger';
import pool from './pool';

dotenv.config();

type AccountType = 'admin' | 'tutor' | 'student';

export interface IAccessTokenPayload {
  id: number;
  type: AccountType;
  crmId?: number;
  exp: number;
  xsrf: string;
}

/**
 * .
 * @param req Express request
 * @param res Express response
 */
export function options(req: express.Request, res: express.Response): void {
  fs.readFile(__dirname + '/../options/authentication.json', 'utf8', (err, data) => {
    if (err) {
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).send({ error: err });
      return;
    }
    res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
    res.setHeader('Allow', 'POST,OPTIONS');
    res.send(JSON.parse(data));
  });
}

/**
 * Authenticates a user.
 * @param req Express request
 * @param res Express response
 */
export async function authenticate(req: express.Request, res: express.Response): Promise<void> {

  logger.info('trying to authenticate', req.body.username);

  try {

    // username is required
    if (typeof req.body.username === 'undefined') {
      throw new HttpStatus.BadRequest('no username provided');
    }

    // password is required
    if (typeof req.body.password === 'undefined') {
      throw new HttpStatus.BadRequest('no password provided');
    }

    // get a database connection from the pool
    const connection = await pool.getConnection();

    try {

      let id: number;
      let userType: string;

      // look for a student
      const sqlSelectStudents = 'SELECT id, password FROM students WHERE id = ? LIMIT 1';
      const students = await connection.query(sqlSelectStudents, req.body.username);
      if (students.length) {

        id = students[0].id;
        userType = 'student';

        const result = await bcryptjs.compare(req.body.password, students[0].password.replace('$2y$', '$2a$'));
        if (result === false) {
          logger.warn('Unsucesful authentication attempt', req.body.username);
          throw new HttpStatus.UnprocessableEntity('username or password is incorrect');
        }

      } else {

        // check for an admin user
        const salt = 'e3DpP6a3811CQx4b46pV58Bon542wbp50F3GG42E'; // the CakePHP salt
        const sqlSelectUsers = 'SELECT id, password FROM users WHERE username = ? LIMIT 1';
        const administrators = await connection.query(sqlSelectUsers, req.body.username);
        if (administrators.length) {

          id = administrators[0].id;
          userType = 'administrator';

          const hash = crypto.createHash('sha1').update(salt + req.body.password).digest('hex');
          if (hash !== administrators[0].password) {
            logger.warn('Unsucesful authentication attempt', req.body.username);
            throw new HttpStatus.UnprocessableEntity('username or password is incorrect');
          }

          // no admin or student found
        } else {
          logger.warn('Unsucesful authentication attempt', req.body.username);
          throw new HttpStatus.UnprocessableEntity('username or password is incorrect');
        }

      }

      const payload: IToken = {
        iss: 'https://crm.qccareerschool.com',
        sub: id,
        userType,
      };
      const ONE_DAY = 86400;
      const token = jwt.sign(payload, config.secret, { expiresIn: ONE_DAY });

      res.send({ token });

      return;

    } finally {
      pool.releaseConnection(connection);
    }

  } catch (err) {
    if (err instanceof HttpStatus.HttpResponse && err.isClientError()) {
      res.status(err.statusCode).send({ message: err.message });
      return;
    }
    logger.error(err);
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).send({ error: err });
  }
}

/**
 * Makes sure a user has a valid json web token to proceed.
 * @param req Express request
 * @param res Express response
 * @param next Express next function
 */
export async function checkAuthentication(req: express.Request, res: express.Response, next: express.NextFunction): Promise<void> {

  if (req.headers.authorization) { // old auth method

    try {

      let token = null;
      const authorizationHeader = req.headers.authorization;
      if (typeof authorizationHeader === 'string') {
        const parts = authorizationHeader.split(' ');
        const MIN_PARTS = 2;
        if (parts.length === MIN_PARTS) {
          const scheme = parts[0];
          const credentials = parts[1];
          if (scheme.toLowerCase() === 'bearer') {
            token = credentials;
          }
        }
      }

      if (!token) {
        throw new HttpStatus.Unauthorized();
      }

      let decoded = null;

      try {
        decoded = jwt.verify(token, config.secret, { issuer: 'https://crm.qccareerschool.com' });
      } catch (err) {
        throw new HttpStatus.UnprocessableEntity('invalid authentication token');
      }

      res.locals.userdata = decoded;

      return next();

    } catch (err) {
      if (err instanceof HttpStatus.HttpResponse && err.isClientError()) {
        res.status(err.statusCode).send({ message: err.message });
        return;
      }
      logger.error(err);
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).send({ error: err });
    }

  } else if (req.cookies.access) { // new authentication method

    const accessToken = req.cookies.access;
    if (typeof accessToken === 'undefined') {
      res.status(HttpStatus.BAD_REQUEST).send('No access token detected');
      return;
    }

    const payload = jwt.verify(accessToken, keys.publicKey) as IAccessTokenPayload;

    const schema = Joi.object().keys({
      id: Joi.number().required(),
      type: Joi.string().allow('admin', 'tutor', 'student').required(),
      crmId: Joi.number(),
      exp: Joi.number().required(),
      xsrf: Joi.string().required(),
    }).pattern(/./, Joi.any());

    const validationResult = schema.validate(payload);
    if (validationResult.error) {
      res.status(HttpStatus.BAD_REQUEST).send(validationResult.error.details[0].message);
      return;
    }

    if (process.env.MODE !== 'test') {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        const xsrfToken = req.headers['x-xsrf-token'];
        if (typeof xsrfToken === 'undefined') {
          res.status(HttpStatus.BAD_REQUEST).send('No XSRF token detected');
          return;
        }

        if (xsrfToken !== payload.xsrf) {
          res.status(HttpStatus.BAD_REQUEST).send('Invalid XSRF token detected');
          return;
        }
      }
    }

    res.locals.userdata = {
      sub: payload.type === 'student' ? payload.crmId : undefined,
      userType: payload.type === 'admin' ? 'administrator' : payload.type,
    };

    return next();

  } else {
    const err = new HttpStatus.Unauthorized('No authentication methods detected');
    res.status(HttpStatus.UNAUTHORIZED).send({ error: err, message: err.message });
  }
}

/**
 * Makes sure that the user using the resource is an administrator or is the student in question.
 * @param req Express request
 * @param res Express response
 * @param next Express next function
 */
export async function studentAccess(req: express.Request, res: express.Response, next: express.NextFunction): Promise<void> {
  try {
    if (typeof req.params.sId === 'undefined') {
      throw new HttpStatus.Unauthorized('Parameter sId not found.');
    }

    if (typeof res.locals.userdata === 'undefined') {
      throw new HttpStatus.Unauthorized('Variable res.locals.userdata not found.');
    }

    const token: IToken = res.locals.userdata;

    if (token.userType === 'administrator' || token.userType === 'student' && token.sub === parseInt(req.params.sId, 10)) {
      return next();
    }

    throw new HttpStatus.Unauthorized('You do not have permission to use this resource.');

  } catch (err) {
    if (err instanceof HttpStatus.HttpResponse && err.isClientError()) {
      res.status(err.statusCode).send({ message: err.message });
      return;
    }
    logger.error(err);
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).send({ error: err });
  }

}

interface IToken {
  iss: string;
  sub: number;
  userType: string;
}
