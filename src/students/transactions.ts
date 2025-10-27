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
  fs.readFile(__dirname + '/../../options/students/transactions.json', 'utf8', (err, data) => {
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
 * Outputs an enrollment's transactions.
 * @param req Express request
 * @param res Express response
 */
export async function get(req: express.Request, res: express.Response): Promise<void> {

  try {

    // get a database connection from the pool
    const connection = await pool.getConnection();

    try {

      // check that this student exists
      const students = await connection.query('SELECT id FROM students WHERE id = ?', req.params.sId);
      if (!students.length) {
        throw new HttpStatus.NotFound('student not found');
      }

      // check that this enrollment exists
      const sqlSelectEnrollments = 'SELECT id FROM enrollments WHERE student_id = ? AND id = ?';
      const enrollments = await connection.query(sqlSelectEnrollments, [ req.params.sId, req.params.eId ]);
      if (!enrollments.length) {
        throw new HttpStatus.NotFound('enrollment not found');
      }

      // retrieve the list of transactions
      let sqlSelectTransactions = `
SELECT id, parent_id, transaction_date, transaction_time,
amount, attempted_amount, USD_amount, payment_method_id,
order_id, response_code, authorization_code, reference_number,
transaction_number, response, description, extra_charge
FROM transactions
WHERE enrollment_id = ?`;

      if (typeof req.query.type !== 'undefined') {
        if (req.query.type === 'tuition') {
          sqlSelectTransactions += ' AND extra_charge = 0';
        } else if (req.query.type === 'extra') {
          sqlSelectTransactions += ' AND extra_charge = 1';
        } else if (req.query.type === 'both') {
          // do not restrict
        } else {
          throw new HttpStatus.BadRequest('invalid transaction type');
        }
      } else {
        sqlSelectTransactions += ' AND extra_charge = 0';
      }

      const transactions = await connection.query(sqlSelectTransactions, req.params.eId);
      const len = transactions.length;

      // get the payment_method for each transaction
      const sqlSelectPaymentMethod = `
SELECT id, pan, expiry_month, expiry_year
FROM payment_methods
WHERE id = ?
LIMIT 1`;

      for (let i = 0; i < len; i++) {
        const paymentMethods = await connection.query(sqlSelectPaymentMethod, transactions[i].payment_method_id);
        if (paymentMethods.length) {
          transactions[i].payment_method = paymentMethods[0];
        }
      }

      res.send(transactions);

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
