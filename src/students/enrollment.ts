import Big from 'big.js';
import * as express from 'express';
import * as fs from 'fs';

import * as HttpStatus from '@qccareerschool/http-status';
import { logger } from '../logger';
import pool from '../pool';
import { RowDataPacket } from 'mysql2';

/**
 * .
 * @param req Express request
 * @param res Express response
 */
export function options(req: express.Request, res: express.Response): void {
  fs.readFile(__dirname + '/../../options/students/enrollment.json', 'utf8', (err, data) => {
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
 * Outputs a single enrollment.
 * @param req Express request
 * @param res Express response
 */
export async function get(req: express.Request, res: express.Response): Promise<void> {

  const sql = `
SELECT
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
  e.student_id = ?
    AND
  e.id = ?
LIMIT 1`;

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
LIMIT 1;`;

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
LIMIT 1;`;

  const sqlSelectTransactions = `
SELECT
  SUM(t.amount) AS amount_paid
FROM
  transactions t
WHERE
  t.enrollment_id = ?
    AND
  t.extra_charge = 0;`;

  try {

    // get a database connection from the pool
    const connection = await pool.getConnection();

    try {

      // check that this student exists
      const students = await connection.query('SELECT id FROM students WHERE id = ?', [req.params.sId]);
      if (!students.length) {
        throw new HttpStatus.NotFound('student not found');
      }

      // retrieve the enrollment
      const [ enrollments ] = await connection.query<IEnrollment[]>(sql, [ req.params.sId, req.params.eId ]);
      const enrollment = enrollments[0];
      if (!enrollment) {
        throw new HttpStatus.NotFound('enrollment not found');
      }

      const result = enrollment;
      
      interface ICourse extends RowDataPacket {

      };

      // get course, currency, and transaction data
      const [ courses] = await connection.query<ICourse[]>(sqlSelectCourse, [result.course_id]);
      const course = courses[0];
      if (!course) {
        throw new HttpStatus.InternalServerError('course not found');
      }
      result.course = course;

      const currencies = await connection.query(sqlSelectCurrency, [result.currency_id]);
      if (!currencies.length) {
        throw new HttpStatus.InternalServerError('currency not found');
      }
      result.currency = currencies[0];

      interface ITransaction extends RowDataPacket {
          amount_paid: number | null;
        }

      const [ transactions ] = await connection.query<ITransaction[]>(sqlSelectTransactions, req.params.eId);
      const transaction = transactions[0];
      if (!transaction) {
        throw Error('No transaction');
      }
      if (transaction.amount_paid === null) {
        result.amount_paid = 0;
        result.remaining_balance = parseFloat(Big(result.cost).minus(result.discount).toFixed(2));
      } else {
        result.amount_paid = transaction.amount_paid;
        result.remaining_balance = parseFloat(Big(result.cost).minus(result.discount).minus(result.amount_paid).toFixed(2));
      }

      res.send(result);

      return;

    } finally {
      connection.release();
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
 export interface IEnrollment extends RowDataPacket {
    status: string;
    installment: number;
    owing: number;
    account_id: number | null;
  }