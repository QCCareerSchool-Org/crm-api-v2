import * as express from 'express';
import * as fs from 'fs';

import * as HttpStatus from '@qccareerschool/http-status';
import { logger } from '../logger';
import pool from '../pool';

/**
 * .
 * @param req Express request
 * @param res Express response
 */
export function options(req: express.Request, res: express.Response): void {
  fs.readFile(__dirname + '/../../options/countries/countries.json', 'utf8', (err, data) => {
    if (err) {
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).send({ error: err });
      return;
    }
    res.setHeader('Access-Control-Allow-Methods', 'HEAD,GET,OPTIONS');
    res.setHeader('Allow', 'HEAD,GET,OPTIONS');
    res.send(JSON.parse(data));
  });
}

/**
 * Outputs the countries collection. Can be filtered on name or code via the query string.
 * @param req Express request
 * @param res Express response
 */
export async function get(req: express.Request, res: express.Response): Promise<void> {

  try {

    // get a database connection from the pool
    const connection = await pool.getConnection();

    try {

      // retrieve the list of countries
      let sql: string;
      let countries;

      if (typeof req.query.code !== 'undefined' && req.query.code.length) {
        sql = 'SELECT id, code, name FROM countries WHERE code LIKE ? ORDER BY name';
        countries = await connection.query(sql, req.query.code);
      } else if (typeof req.query.name !== 'undefined' && req.query.name.length) {
        sql = 'SELECT id, code, name FROM countries WHERE name LIKE ? ORDER BY name';
        countries = await connection.query(sql, req.query.name);
      } else {
        sql = 'SELECT id, code, name FROM countries ORDER BY name';
        countries = await connection.query(sql);
      }

      res.setHeader('X-Total', countries.length);
      res.send(countries);

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
