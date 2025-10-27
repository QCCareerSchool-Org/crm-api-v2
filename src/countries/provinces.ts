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
  fs.readFile(__dirname + '/../../options/countries/provinces.json', 'utf8', (err, data) => {
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
 * Outputs a country's provinces
 * @param req Express request
 * @param res Express response
 */
export async function get(req: express.Request, res: express.Response): Promise<void> {

  const countrySql = 'SELECT id FROM countries WHERE id = ? LIMIT 1;';
  const sql = 'SELECT id, code, name FROM provinces WHERE country_id = ?;';

  try {

    // get a database connection from the pool
    const connection = await pool.getConnection();

    try {

      const countries = await connection.query(countrySql, req.params.cId);
      if (!countries.length)
        throw new HttpStatus.NotFound('Country not found.');

      // retrieve the list of provinces
      const provinces = await connection.query(sql, req.params.cId);

      res.setHeader('X-Total', provinces.length);
      res.send(provinces);

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
 * Outputs the provinces collection
 * @param req Express request
 * @param res Express response
 */
export async function getAll(req: express.Request, res: express.Response): Promise<void> {

  try {

    // get a database connection from the pool
    const connection = await pool.getConnection();

    try {

      let sql = null;
      let data = null;

      if (typeof req.query.code !== 'undefined' && req.query.code.length) {
        sql = 'SELECT p.id, p.code, p.name, p.country_id, c.id AS country_id, c.code AS country_code, c.name AS country_name FROM provinces p LEFT JOIN countries c ON c.id = p.country_id WHERE p.code LIKE ?';
        data = req.query.code;
      } else if (typeof req.query.name !== 'undefined' && req.query.name.length) {
        sql = 'SELECT p.id, p.code, p.name, p.country_id , c.id AS country_id, c.code AS country_code, c.name AS country_name FROM provinces p LEFT JOIN countries c ON c.id = p.country_id WHERE p.name LIKE ?';
        data = req.query.name;
      } else {
        sql = 'SELECT p.id, p.code, p.name, p.country_id, c.id AS country_id, c.code AS country_code, c.name AS country_name FROM provinces p LEFT JOIN countries c ON c.id = p.country_id';
      }

      const provinces = await connection.query(sql, data);

      const result = [];
      for (const p of provinces) {
        result.push({
          id: p.id,
          code: p.code,
          name: p.name,
          country: {
            id: p.country_id,
            code: p.country_code,
            name: p.country_name,
          },
        });
      }

      res.setHeader('X-Total', result.length);
      res.send(result);

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
