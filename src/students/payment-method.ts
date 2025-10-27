import { Paysafe } from '@qccareerschool/paysafe';
import { Authorization } from '@qccareerschool/paysafe/dist/card-payments/authorization';
import { Card } from '@qccareerschool/paysafe/dist/card-payments/lib/card';
import { Settlement } from '@qccareerschool/paysafe/dist/card-payments/settlement';
import * as HttpStatus from '@qccareerschool/http-status';
import * as express from 'express';
import * as fs from 'fs';

import { logger } from '../logger';
import * as paysafeCredentials from '../paysafe-credentials';
import pool from '../pool';
import remotePool from '../remote-pool';

/**
 * .
 * @param req Express request
 * @param res Express response
 */
export function options(req: express.Request, res: express.Response): void {
  fs.readFile(__dirname + '/../../options/students/payment-method.json', 'utf8', (err, data) => {
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
 * Outputs a payment method.
 * @param req Express request
 * @param res Express reponse
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
      const enrollments = await connection.query('SELECT id FROM enrollments WHERE student_id = ? AND id = ?', [ req.params.sId, req.params.eId ]);
      if (!enrollments.length) {
        throw new HttpStatus.NotFound('enrollment not found');
      }

      // retrieve the payment method
      const sqlSelectPaymentMethod = `
SELECT p.id, p.primary, t.name AS payment_type, p.pan, p.expiry_month, p.expiry_year, p.transaction_count,
p.eselect_plus_data_key, p.cardeasexml_card_hash, p.cardeasexml_card_reference
FROM payment_methods p
LEFT JOIN payment_types t ON t.id = p.payment_type_id
WHERE p.id = ?
AND enrollment_id = ?
AND deleted = 0
LIMIT 1`;
      const paymentMethods = await connection.query(sqlSelectPaymentMethod, [ req.params.pId, req.params.eId ]);
      if (!paymentMethods.length) {
        throw new HttpStatus.NotFound('payment method not found');
      }

      if (paymentMethods[0].payment_type === 'eSelect Plus') {
        delete paymentMethods[0].cardeasexml_card_hash;
        delete paymentMethods[0].cardeasexml_card_reference;
      } else if (paymentMethods[0].payment_type === 'CardEase XML') {
        delete paymentMethods[0].eselect_plus_data_key;
      }

      res.send(paymentMethods[0]);

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
 * .
 * @param req Express request
 * @param res Express response
 */
export function setPrimaryOptions(req: express.Request, res: express.Response): void {
  fs.readFile(__dirname + '/../../options/students/payment-method-set-primary.json', 'utf8', (err, data) => {
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
 * Sets this payment method as the primary payment method and sets all other
 * payment methods of this enrollment to not primary
 * @param req Express request
 * @param res Express response
 */
export async function setPrimary(req: express.Request, res: express.Response): Promise<void> {

  try {

    // get a database connection from the pool
    const connection = await pool.getConnection();

    try {

      // check that this student exists
      const students = await connection.query('SELECT id FROM students WHERE id = ?', req.params.sId);
      if (!students.length) {
        throw new HttpStatus.NotFound('student not found');
      }

      // check that this enrollment exists and belongs to this student
      const enrollments = await connection.query('SELECT id FROM enrollments WHERE student_id = ? AND id = ?', [ req.params.sId, req.params.eId ]);
      if (!enrollments.length) {
        throw new HttpStatus.NotFound('enrollment not found');
      }

      // check that this payment method exists and belongs to this enrollment
      const paymentMethods = await connection.query('SELECT id FROM payment_methods WHERE enrollment_id = ? AND id = ?', [ req.params.eId, req.params.pId ]);
      if (!paymentMethods.length) {
        throw new HttpStatus.NotFound('payment method not found');
      }

      // set this payment method as the primary one
      await connection.beginTransaction();

      try {
        await connection.query('UPDATE payment_methods SET `primary` = 0 WHERE enrollment_id = ?', req.params.eId);
        await connection.query('UPDATE payment_methods SET `primary` = 1 WHERE id = ?', req.params.pId);
        await connection.commit();
      } catch (err) {
        await connection.rollback();
        throw err;
      }

      res.status(HttpStatus.NO_CONTENT).end();

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
 * .
 * @param req Express request
 * @param res Express response
 */
export function chargeOptions(req: express.Request, res: express.Response): void {
  fs.readFile(__dirname + '/../../options/students/payment-method-charge.json', 'utf8', (err, data) => {
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
 * Charges the specified payment_method.
 * @param req Express request
 * @param res Express response
 */
export async function charge(req: express.Request, res: express.Response): Promise<void> {

  logger.info('charge');

  interface IEnrollment {
    status: string;
    installment: number;
    owing: number;
    account_id: number | null;
  }

  interface IPaymentMethod {
    student_id?: number;
    enrollment_id?: number;
    eselect_plus_data_key: string | null;
    eselect_plus_issuer_id: string | null;
    cardeasexml_card_hash: string | null;
    cardeasexml_card_reference: string | null;
    paysafe_payment_token: string;
    paysafe_company: string;
    payment_type: string;
    currency_code: string;
    exchange_rate: number;
    course_prefix: string;
  }

  const TIMESTRING_TIME_LENGTH = 8;

  const sqlSelectEnrollments = `
SELECT e.status, e.installment, e.cost - e.discount - COALESCE(SUM(amount), 0) AS owing, e.account_id
FROM enrollments e
LEFT JOIN transactions t ON t.enrollment_id = e.id
WHERE e.student_id = ? AND e.id = ? AND t.extra_charge = 0
LIMIT 1`;

  const sqlSelectPaymentMethod = `
SELECT
  p.eselect_plus_data_key,
  p.eselect_plus_issuer_id,
  p.cardeasexml_card_hash,
  p.cardeasexml_card_reference,
  p.paysafe_payment_token,
  p.paysafe_company,
  t.name AS payment_type,
  c.code AS currency_code,
  c.exchange_rate,
  courses.prefix AS course_prefix
FROM
  payment_methods p
LEFT JOIN
  payment_types t ON t.id = p.payment_type_id
LEFT JOIN
  enrollments e ON e.id = p.enrollment_id
LEFT JOIN
  currencies c ON c.id = e.currency_id
LEFT JOIN
  courses ON courses.id = e.course_id
WHERE
  p.enrollment_id = ?
  AND p.id = ?
  AND p.deleted = 0
LIMIT 1`;

  try {

    if (typeof req.body.amount === 'undefined') {
      throw new HttpStatus.BadRequest('amount not specified');
    }

    let amount = parseFloat(req.body.amount);
    if (isNaN(amount)) {
      throw new HttpStatus.BadRequest('amount is not a number');
    }

    const PRECISION = 2;
    const FACTOR = Math.pow(10, PRECISION);
    amount = Math.round(amount * FACTOR) / FACTOR;

    if (amount <= 0) {
      throw new HttpStatus.BadRequest('amount must be positive');
    }

    const MAX_CHARGE = 1800;
    if (amount > MAX_CHARGE) {
      throw new HttpStatus.BadRequest('amount is limited to 1800');
    }

    // get a database connection from the pool
    const connection = await pool.getConnection();

    try {

      // check that this student exists
      const students = await connection.query('SELECT id FROM students WHERE id = ?', req.params.sId);
      if (!students.length) {
        throw new HttpStatus.NotFound('student not found');
      }

      // check that this enrollment exists and belongs to this student, and retrive the enrollment's status and amount owing
      const enrollments: IEnrollment[] = await connection.query(sqlSelectEnrollments, [ req.params.sId, req.params.eId ]);
      if (!enrollments.length) {
        throw new HttpStatus.NotFound('enrollment not found');
      }
      logger.info(`${req.params.sId} ${req.params.eId}`, enrollments[0]);

      // check that this payment method exists and belongs to this enrollment
      const paymentMethods: IPaymentMethod[] = await connection.query(sqlSelectPaymentMethod, [ req.params.eId, req.params.pId ]);
      if (!paymentMethods.length) {
        throw new HttpStatus.NotFound('payment method not found');
      }

      // deny for T, H, or W students
      if (enrollments[0].status === 'T') {
        throw new HttpStatus.Conflict('Student has transferred');
      }
      // if (enrollments[0].status === 'H') {
      //   throw new HttpStatus.Conflict('Course is on hold');
      // }
      if (enrollments[0].status === 'W') {
        throw new HttpStatus.Conflict('Course is withdrawn');
      }

      // only works for eSelectPlus and CardEaseXML
      if (paymentMethods[0].payment_type !== 'eSelect Plus' && paymentMethods[0].payment_type !== 'CardEaseXML' && paymentMethods[0].payment_type !== 'Paysafe') {
        throw new HttpStatus.Conflict('unsupported payment method');
      }

      if (amount > enrollments[0].owing) {
        throw new HttpStatus.BadRequest('Amount is higher than amount owing');
      }

      interface IPayloadInsertTransaction {
        enrollment_id: number;
        transaction_date: string;
        transaction_time: string;
        amount: number;
        attempted_amount: number;
        payment_method_id: number;
        order_id: string;
        response_code: number | null;
        authorization_code: string | null;
        reference_number: string | null;
        transaction_number?: string;
        response?: string | null;
        description: string;
        transaction_type: string;
        notified: number;
        USD_amount?: number;
      }

      const sqlInsertTransaction = 'INSERT INTO transactions SET ?, created = NOW(), modified = NOW()';
      const sqlUpdatePaymentMethod = 'UPDATE payment_methods SET transaction_count = transaction_count + 1 WHERE id = ?';

      if (paymentMethods[0].payment_type === 'Paysafe') {

        logger.info('paysafe');

        const merchantRefNum = createOrderId();
        const decimalMultipier = 100;
        const minorAmount = Math.round(amount * decimalMultipier);

        // initialize paysafe object
        let accountNumber: string;
        let apiKey: string;
        let apiPassword: string;
        if (paymentMethods[0].paysafe_company === 'CA') {
          apiKey = paysafeCredentials.caApiKey;
          apiPassword = paysafeCredentials.caApiPassword;
          if (paymentMethods[0].currency_code === 'CAD') {
            accountNumber = paysafeCredentials.caAccountCAD;
          } else if (paymentMethods[0].currency_code === 'USD') {
            accountNumber = paysafeCredentials.caAccountUSD;
          } else if (paymentMethods[0].currency_code === 'GBP') {
            accountNumber = paysafeCredentials.caAccountGBP;
          } else if (paymentMethods[0].currency_code === 'AUD') {
            accountNumber = paysafeCredentials.caAccountAUD;
          } else if (paymentMethods[0].currency_code === 'NZD') {
            accountNumber = paysafeCredentials.caAccountNZD;
          } else {
            throw new HttpStatus.Conflict('Unsupported currency for Paysafe CA');
          }
        } else if (paymentMethods[0].paysafe_company === 'US') {
          apiKey = paysafeCredentials.usApiKey;
          apiPassword = paysafeCredentials.usApiPassword;
          if (paymentMethods[0].currency_code === 'USD') {
            accountNumber = paysafeCredentials.usAccountUSD;
          } else {
            throw new HttpStatus.Conflict('Unsupported currency for Paysafe US');
          }
        } else if (paymentMethods[0].paysafe_company === 'GB') {
          apiKey = paysafeCredentials.gbApiKey;
          apiPassword = paysafeCredentials.gbApiPassword;
          if (paymentMethods[0].currency_code === 'GBP') {
            accountNumber = paysafeCredentials.gbAccountGBP;
          } else if (paymentMethods[0].currency_code === 'AUD') {
            accountNumber = paysafeCredentials.gbAccountAUD;
          } else if (paymentMethods[0].currency_code === 'NZD') {
            accountNumber = paysafeCredentials.gbAccountNZD;
          } else {
            throw new HttpStatus.Conflict('Unsupported currency for Paysafe GB');
          }
        } else {
          throw new HttpStatus.Conflict('Invalid Paysafe company');
        }
        const paysafe = new Paysafe(apiKey, apiPassword, paysafeCredentials.environment, accountNumber);

        // create a card
        const card = new Card();
        card.setPaymentToken(paymentMethods[0].paysafe_payment_token);

        // create an authorization
        const authorization = new Authorization();
        authorization.setCard(card);
        authorization.setAmount(minorAmount);
        authorization.setSettleWithAuth(true);
        authorization.setMerchantRefNum(merchantRefNum);
        authorization.setRecurring('RECURRING');

        const result = await paysafe.getCardServiceHandler().authorize(authorization);
        logger.info(`${req.params.sId} ${req.params.eId} charge result`, result);
        if (typeof result.getError() !== 'undefined') {
          logger.info(`${req.params.sId} ${req.params.eId} authorization failed`, result.getError());
          // throw new HttpStatus.BadRequest('Authorization failed');
        }

        // add transaction to the database
        const transactionTime = typeof result.getTxnTime() !== 'undefined' ? result.getTxnTime() as Date : new Date();
        let settlementId: string | null = null;
        if (typeof result.getSettlements() !== 'undefined') {
          const settlements = result.getSettlements() as Settlement[];
          if (settlements.length) {
            if (typeof settlements[0].getId() !== 'undefined') {
              settlementId = settlements[0].getId() as string;
            }
          }
        }
        const payload: IPayloadInsertTransaction = {
          enrollment_id: parseInt(req.params.eId, 10),
          transaction_date: stringDate(transactionTime),
          transaction_time: transactionTime.toTimeString().substring(0, TIMESTRING_TIME_LENGTH),
          amount: result.getStatus() === 'COMPLETED' ? amount : 0,
          attempted_amount: amount,
          payment_method_id: parseInt(req.params.pId, 10),
          order_id: merchantRefNum,
          response_code: result.getError()?.getCode() ?? null,
          authorization_code: typeof result.getAuthCode() !== 'undefined' ? result.getAuthCode() as string : null,
          reference_number: settlementId,
          response: result.getError()?.getMessage() ?? null,
          description: 'student-initiated',
          transaction_type: 'charge',
          notified: 0,
        };

        await connection.beginTransaction();
        try {
          await connection.query(sqlInsertTransaction, payload);
          await connection.query(sqlUpdatePaymentMethod, req.params.pId);
          await connection.commit();
        } catch (err) {
          await connection.rollback();
          logger.error('Could not store Paysafe transaction', err);
          throw err;
        }

        if (result.getStatus() !== 'COMPLETED') {
          throw new HttpStatus.BadRequest('Payment method failed');
        }
      } else {
        throw new HttpStatus.Conflict('Unsupported payment method');
      }

      if (amount >= Math.min(enrollments[0].installment, enrollments[0].owing)) {
        logger.info(`${req.params.sId} ${req.params.eId} amount is greater than or equal to the installment`);

        // remove "hold" status from internal database
        logger.info(`${req.params.sId} ${req.params.eId} status is ${enrollments[0].status}`);
        if (enrollments[0].status === 'H') {
          logger.info(`${req.params.sId} ${req.params.eId} account is on hold`);
          try {
            await connection.query('UPDATE enrollments SET status = NULL, status_date = NULL WHERE id = ?', req.params.eId);
          } catch (err) {
            logger.error('Error updating status', err);
          }
        } else {
          logger.info(`${req.params.sId} ${req.params.eId} account not on hold`);
        }

        // remove "hold" status from student center
        try {
          await remotePool.query('UPDATE students SET on_hold = 0 WHERE account_id = ? AND course_code = ?', [
            enrollments[0].account_id,
            paymentMethods[0].course_prefix,
          ]);
        } catch (err) {
          logger.error('Error updating student center status', err);
        }

      } else {
        logger.info(`${req.params.sId} ${req.params.eId} amount is too small to change status`);
      }

      res.status(HttpStatus.OK).send({ success: true });

      return;

    } finally {
      pool.releaseConnection(connection);
    }

  } catch (err) {
    console.log('here', err);
    console.log(err instanceof HttpStatus.HttpResponse);
    console.log((err as HttpStatus.HttpResponse).isClientError());
    if (err instanceof HttpStatus.HttpResponse && err.isClientError()) {
      console.log('message', err.message);
      res.status(err.statusCode).send({ message: err.message });
      logger.info('Client Error', err);
      return;
    }
    logger.error(err);
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).send({ error: err });
  }
}

export function createOrderId() {

  // generate the date part
  const now = new Date();
  /* tslint:disable:no-magic-numbers */
  const dateString = now.getFullYear().toString() +
    (now.getMonth() + 1).toString().padStart(2, '0') +
    now.getDate().toString().padStart(2, '0') +
    now.getHours().toString().padStart(2, '0') +
    now.getMinutes().toString().padStart(2, '0') +
    now.getSeconds().toString().padStart(2, '0') +
    now.getMilliseconds().toString().padStart(3, '0');
  /* tslint:enable:no-magic-numbers */

  // generate the random part
  const MAX = 99999;
  const MIN = 10000;
  const randomString = (Math.floor(Math.random() * (MAX - MIN)) + MIN).toString();

  return `${dateString}_si_${randomString}`;
}

const stringDate = (d: Date): string => `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;
