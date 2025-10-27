import Big from 'big.js';
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
  fs.readFile(__dirname + '/../../options/students/enrollments.json', 'utf8', (err, data) => {
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
 * Outputs all of a student's enrollments
 * @param req Express request
 * @param res Express response
 */
export async function get(req: express.Request, res: express.Response): Promise<void> {

  const sql = `
SELECT
  e.id,
  e.course_id,
  e.enrollment_date,
  e.payment_plan,
  e.status,
  e.status_date,
  e.grad_email_date,
  e.currency_id,
  e.cost,
  e.no_shipping,
  e.discount,
  e.installment,
  e.payment_frequency,
  e.payment_start,
  e.prepared_date,
  e.shipped_date,
  e.diploma
FROM
  enrollments e
WHERE
  e.student_id = ?`;

  const sqlSelectCourse = `
SELECT
  c.code,
  c.name,
  c.prefix,
  c.school_id
FROM
  courses c
WHERE
  c.id = ?
LIMIT 1`;

  const sqlSelectCurrency = `
SELECT
  c.code,
  c.name,
  c.symbol,
  c.exchange_rate
FROM
  currencies c
WHERE
  c.id = ?
LIMIT 1`;

  const sqlSelectTransactions = `
SELECT
  SUM(t.amount) AS amount_paid
FROM
  transactions t
WHERE
  t.enrollment_id = ?
    AND
  t.extra_charge = 0`;

  try {

    // get a database connection from the pool
    const connection = await pool.getConnection();

    try {

      // check that this student exists
      const students = await connection.query('SELECT id FROM students WHERE id = ?', req.params.sId);
      if (!students.length) {
        throw new HttpStatus.NotFound('student not found');
      }

      // retrieve the list of enrollments
      const enrollments = await connection.query(sql, req.params.sId);

      // get course, currency, and transacion data
      const reqs = enrollments.map(async (e: any) => {

        const courses = await connection.query(sqlSelectCourse, e.course_id);
        if (!courses.length) {
          throw new HttpStatus.InternalServerError('course not found');
        }
        e.course = courses[0];

        const currencies = await connection.query(sqlSelectCurrency, e.currency_id);
        if (!currencies.length) {
          throw new HttpStatus.InternalServerError('currency not found');
        }
        e.currency = currencies[0];

        const transactions = await connection.query(sqlSelectTransactions, e.id);
        if (transactions[0].amount_paid === null) {
          e.amount_paid = 0;
          e.remaining_balance = parseFloat(Big(e.cost).minus(e.discount).toFixed(2));
        } else {
          e.amount_paid = transactions[0].amount_paid;
          e.remaining_balance = parseFloat(Big(e.cost).minus(e.discount).minus(e.amount_paid).toFixed(2));
        }
      });

      await Promise.all(reqs);

      res.setHeader('X-Total', enrollments.length);
      res.send(enrollments);

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
