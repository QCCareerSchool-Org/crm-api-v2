import * as express from 'express';
import * as fs from 'fs';

import * as HttpStatus from '@qccareerschool/http-status';
import { logger } from '../logger';
import * as paysafeCredentials from '../paysafe-credentials';
import pool from '../pool';

import { createOrderId } from './payment-method';

import { Paysafe } from '@qccareerschool/paysafe';
// import { Authorization } from '@qccareerschool/paysafe/dist/card-payments/authorization';
import { Card } from '@qccareerschool/paysafe/dist/card-payments/lib/card';
import { Verification } from '@qccareerschool/paysafe/dist/card-payments/verification';
// import { VoidAuth } from '@qccareerschool/paysafe/dist/card-payments/void-auth';
import { CardExpiry } from '@qccareerschool/paysafe/dist/common/card-expiry';
import { Address } from '@qccareerschool/paysafe/dist/customer-vault/address';
import { Card as ProfileCard } from '@qccareerschool/paysafe/dist/customer-vault/card';
import { Profile } from '@qccareerschool/paysafe/dist/customer-vault/profile';

/**
 * .
 * @param req Express request
 * @param res Express response
 */
export function options(req: express.Request, res: express.Response): void {
  fs.readFile(__dirname + '/../../options/students/payment-methods.json', 'utf8', (err, data) => {
    if (err) {
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).send({ error: err });
      return;
    }
    res.setHeader('Access-Control-Allow-Methods', 'HEAD,GET,POST,OPTIONS');
    res.setHeader('Allow', 'HEAD,GET,POST,OPTIONS');
    res.send(JSON.parse(data));
  });
}

/**
 * Outputs all of an enrollment's payment methods.
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
      const enrollments = await connection.query(sqlSelectEnrollments, [req.params.sId, req.params.eId]);
      if (!enrollments.length) {
        throw new HttpStatus.NotFound('enrollment not found');
      }

      // retrieve the payment methods
      let sqlSelectPaymentMethods = `
SELECT p.id, p.primary, t.name AS payment_type, p.pan, p.expiry_month, p.expiry_year,
p.transaction_count, p.eselect_plus_data_key, p.cardeasexml_card_hash, p.cardeasexml_card_reference
FROM payment_methods p
LEFT JOIN payment_types t ON t.id = p.payment_type_id
WHERE p.enrollment_id = ?
AND deleted = 0`;
      if (typeof req.query.cheques !== 'undefined' && req.query.cheques === '0') {
        sqlSelectPaymentMethods += `
AND NOT t.name = 'Cheques'`;
      }
      const paymentMethods = await connection.query(sqlSelectPaymentMethods, req.params.eId);
      const len = paymentMethods.length;

      for (let i = 0; i < len; i++) {
        if (paymentMethods[i].payment_type === 'eSelect Plus') {
          delete paymentMethods[i].cardeasexml_card_hash;
          delete paymentMethods[i].cardeasexml_card_reference;
        }
        if (paymentMethods[i].payment_type === 'CardEaseXML') {
          delete paymentMethods[i].eselect_plus_data_key;
        }
      }

      res.setHeader('X-Total', len);
      res.send(paymentMethods);

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
 * Creates a new payment method.
 * @param req Express request
 * @param res Express response
 */
export async function create(req: express.Request, res: express.Response): Promise<void> {
  try {

    if (!req.body.payment_type) {
      throw new HttpStatus.BadRequest('payment_type is required');
    }

    let eselectPlusDataKey: string | null = null;
    let cardeasexmlCardHash: string | null = null
    let cardeasexmlCardReference: string | null = null
    let paysafeProfileId: string | null = null
    let paysafeCardId: string | null = null
    let paysafePaymentToken: string | null = null
    let paymentType: string | null = null

    if (req.body.payment_type === 'credit card') {

      // credit card
      if (!req.body.csc) {
        throw new HttpStatus.BadRequest('csc is missing');
      }
      if (!(/^\d{3,4}/).test(req.body.csc)) {
        throw new HttpStatus.BadRequest('csc must be a three- or four-digit number');
      }

      // invalid payment type
    } else {
      throw new HttpStatus.UnprocessableEntity('invalid payment_type');
    }

    // pan
    const MIN_PAN_LENGTH = 12;
    const UNMASKED_DIGITS = 4;
    if (!req.body.pan) {
      throw new HttpStatus.BadRequest('pan is missing');
    }
    if (req.body.pan.length < MIN_PAN_LENGTH) {
      throw new HttpStatus.UnprocessableEntity('invalid pan: too short');
    }
    const pan = req.body.pan;
    let maskedPan = '*'.repeat(req.body.pan.length - UNMASKED_DIGITS) + req.body.pan.substr(req.body.pan.length - UNMASKED_DIGITS);

    // expiry month
    const MIN_MONTH = 1;
    const MAX_MONTH = 12;
    if (!req.body.expiry_month) {
      throw new HttpStatus.BadRequest('expiry_month is missing');
    }
    if (!(/^\d+$/).test(req.body.expiry_month)) {
      throw new HttpStatus.UnprocessableEntity('expiry_month must be a number');
    }
    const expiryMonth = parseInt(req.body.expiry_month, 10);
    if (expiryMonth < MIN_MONTH || expiryMonth > MAX_MONTH) {
      throw new HttpStatus.UnprocessableEntity('invalid expiry month: must be between 1 and 12');
    }

    // expiry year
    const CURRENT_YEAR = new Date().getFullYear();
    const MAXIMUM_CARD_AGE = 8;
    const MAX_YEAR = CURRENT_YEAR + MAXIMUM_CARD_AGE;
    if (!req.body.expiry_year) {
      throw new HttpStatus.BadRequest('expiry_year is missing');
    }
    if (!(/^\d+$/).test(req.body.expiry_year)) {
      throw new HttpStatus.UnprocessableEntity('expiry_year must be an integer');
    }
    const expiryYear = parseInt(req.body.expiry_year, 10);
    if (expiryYear < CURRENT_YEAR || expiryYear > MAX_YEAR) {
      throw new HttpStatus.UnprocessableEntity(`invalid expiry year: must be between ${CURRENT_YEAR} and ${MAX_YEAR}`);
    }

    // check expiration
    const CURRENT_MONTH = new Date().getMonth() + 1;
    if (expiryYear === CURRENT_YEAR && expiryMonth < CURRENT_MONTH) {
      throw new HttpStatus.UnprocessableEntity('expired card');
    }

    // get a database connection from the pool
    const connection = await pool.getConnection();

    try {

      interface IEnrollment {
        student_id?: number;
        currency_code: string;
        course_prefix: string;
        telephone_number: string;
        email_address: string;
      }

      let enrollments: IEnrollment[] | null = null;

      interface IStudent {
        id: number;
        sex: string;
        first_name: string;
        last_name: string;
        address1: string;
        address2: string | null;
        city: string;
        province_code: string | null;
        postal_code: string | null;
        country_code: string;
        email_address: string;
        telephone_number: string | null;
      }

      // check that this student exists
      const sqlSelectStudent = `
SELECT s.id, s.sex, s.first_name, s.last_name, s.address1, s.address2, s.city, s.postal_code, s.email_address, s.telephone_number, c.code AS country_code, p.code AS province_code
FROM students s
LEFT JOIN countries c ON c.id = s.country_id
LEFT JOIN provinces p ON p.id = s.province_id
WHERE s.id = ?;
`;
      const students: IStudent[] = await connection.query(sqlSelectStudent, req.params.sId);
      if (!students.length) {
        throw new HttpStatus.NotFound('student not found');
      }

      // check that this enrollment exists and some information about it
      const sql = `
SELECT c.code AS currency_code, courses.prefix AS course_prefix, s.telephone_number, s.email_address
FROM enrollments e
LEFT JOIN currencies c ON c.id = e.currency_id
LEFT JOIN courses ON courses.id = e.course_id
LEFT JOIN students s ON s.id = e.student_id
WHERE e.student_id = ?
AND e.id = ?
LIMIT 1`;
      enrollments = await connection.query(sql, [req.params.sId, req.params.eId]) as IEnrollment[];
      if (!enrollments.length) {
        throw new HttpStatus.NotFound('enrollment not found');
      }

      let company;
      if (enrollments[0].currency_code === 'GBP' || enrollments[0].currency_code === 'AUD' || enrollments[0].currency_code === 'NZD') {
        company = 'GB';
      } else if (enrollments[0].currency_code === 'USD') {
        company = 'US';
      } else {
        company = 'CA';
      }

      if (req.body.payment_type === 'credit card') { // tokenize the credit card

        // initialize paysafe object
        let accountNumber: string;
        let apiKey: string;
        let apiPassword: string;

        if (company === 'CA') {
          apiKey = paysafeCredentials.caApiKey;
          apiPassword = paysafeCredentials.caApiPassword;
          if (enrollments[0].currency_code === 'CAD') {
            accountNumber = paysafeCredentials.caAccountCAD;
          } else if (enrollments[0].currency_code === 'USD') {
            accountNumber = paysafeCredentials.caAccountUSD;
          } else if (enrollments[0].currency_code === 'GBP') {
            accountNumber = paysafeCredentials.caAccountGBP;
          } else if (enrollments[0].currency_code === 'AUD') {
            accountNumber = paysafeCredentials.caAccountAUD;
          } else if (enrollments[0].currency_code === 'NZD') {
            accountNumber = paysafeCredentials.caAccountNZD;
          } else {
            throw new HttpStatus.Conflict('Unsupported currency for Paysafe CA');
          }
        } else if (company === 'US') {
          apiKey = paysafeCredentials.usApiKey;
          apiPassword = paysafeCredentials.usApiPassword;
          if (enrollments[0].currency_code === 'USD') {
            accountNumber = paysafeCredentials.usAccountUSD;
          } else {
            throw new HttpStatus.Conflict('Unsupported currency for Paysafe GB');
          }
        } else if (company === 'GB') {
          apiKey = paysafeCredentials.gbApiKey;
          apiPassword = paysafeCredentials.gbApiPassword;
          if (enrollments[0].currency_code === 'GBP') {
            accountNumber = paysafeCredentials.gbAccountGBP;
          } else if (enrollments[0].currency_code === 'AUD') {
            accountNumber = paysafeCredentials.gbAccountAUD;
          } else if (enrollments[0].currency_code === 'NZD') {
            accountNumber = paysafeCredentials.gbAccountNZD;
          } else {
            throw new HttpStatus.Conflict('Unsupported currency for Paysafe GB');
          }
        } else {
          throw new HttpStatus.Conflict('Invalid Paysafe company');
        }
        const paysafe = new Paysafe(apiKey, apiPassword, paysafeCredentials.environment, accountNumber);

        // create a new profile and card at Paysafe
        logger.info('creating profile');
        const profile = new Profile();
        profile.setLocale('en_US');
        profile.setMerchantCustomerId(createCustomerId(enrollments[0].course_prefix + req.params.eId));
        profile.setFirstName(students[0].first_name);
        profile.setLastName(students[0].last_name);
        profile.setGender(students[0].sex === 'M' ? 'M' : 'F');
        profile.setEmail(students[0].email_address);
        if (students[0].telephone_number !== null) {
          profile.setPhone(students[0].telephone_number);
        }
        logger.debug('Profile Request', profile);
        const profileResult = await paysafe.getCustomerServiceHandler().createProfile(profile);
        const profileError = profileResult.getError();
        if (typeof profileError !== 'undefined') {
          throw new HttpStatus.BadRequest(profileError.getMessage());
        }
        logger.info('Profile Result', profileResult);
        const profileId = profileResult.getId() as string;
        paysafeProfileId = profileId;
        if (typeof profileId === 'undefined') {
          throw new HttpStatus.InternalServerError('profile id is empty');
        }

        // create an address
        logger.info('creating address');
        const address = new Address();
        address.setStreet(students[0].address1);
        if (students[0].address2) {
          address.setStreet2(students[0].address2);
        }
        address.setCity(students[0].city);
        if (['CA', 'US', 'AU'].indexOf(students[0].country_code) !== -1 && students[0].province_code !== null) {
          address.setState(students[0].province_code);
        }
        address.setZip(students[0].postal_code === null || students[0].postal_code.length === 0 ? 'NA' : students[0].postal_code);
        address.setCountry(students[0].country_code);
        address.setDefaultShippingAddressIndicator(true);
        logger.debug('Address Request', address);
        const addressResult = await paysafe.getCustomerServiceHandler().createAddress(profileId, address);
        if (typeof addressResult.getError() !== 'undefined') {
          throw addressResult.getError();
        }
        logger.debug('Address Result', addressResult);
        const addressId = addressResult.getId();
        if (typeof addressId === 'undefined') {
          throw new HttpStatus.InternalServerError('address id is empty');
        }

        // create a card
        logger.info('creating card');
        const cardExpiry = new CardExpiry();
        cardExpiry.setMonth(expiryMonth);
        cardExpiry.setYear(expiryYear);
        const profileCard = new ProfileCard();
        profileCard.setCardNum(pan);
        profileCard.setCardExpiry(cardExpiry);
        const cardResult = await paysafe.getCustomerServiceHandler().createCard(profileId, profileCard);
        const cardError = cardResult.getError();
        if (typeof cardError !== 'undefined') {
          throw new HttpStatus.BadRequest(cardError.getMessage());
        }
        logger.info('Card Result', cardResult);
        const cardId = cardResult.getId() as string;
        paysafeCardId = cardId;
        const pt = cardResult.getPaymentToken();
        if (!pt) {
          throw new HttpStatus.InternalServerError('Payment token is undefined');
        }
        paysafePaymentToken = pt;
        maskedPan = cardResult.getCardBin() + '*'.repeat(pan.length - (cardResult.getCardBin()?.length ?? 0) - (cardResult.getLastDigits()?.length ?? 0)) + cardResult.getLastDigits();
        if (typeof cardId === 'undefined') {
          throw new HttpStatus.InternalServerError('card id is empty');
        }
        const cardExpiryResult = cardResult.getCardExpiry();
        if (typeof cardExpiryResult === 'undefined') {
          throw new HttpStatus.InternalServerError('card expiry is empty');
        }

        // update the card's billingAddressId
        logger.info('updating card');
        const cardUpdate = new ProfileCard();
        cardUpdate.setCardExpiry(cardExpiryResult); // TODO: why are we doing this?
        cardUpdate.setBillingAddressId(addressId);
        const cardUpdateResult = await paysafe.getCustomerServiceHandler().updateCard(profileId, cardId, cardUpdate);
        const cardUpdateError = cardUpdateResult.getError()
        if (typeof cardUpdateError !== 'undefined') {
          throw new HttpStatus.BadRequest(cardUpdateError.getMessage());
        }

        // check to see if the card is valid
        logger.info('card verification');
        const testCard = new Card();
        testCard.setPaymentToken(paysafePaymentToken);
        const verification = new Verification();
        verification.setMerchantRefNum(createOrderId());
        verification.setCard(testCard);
        const verificationResult = await paysafe.getCardServiceHandler().verify(verification);
        logger.info('Verification Result', verificationResult);
        const verificationError = verificationResult.getError();
        if (typeof verificationError !== 'undefined') {
          throw new HttpStatus.BadRequest(verificationError.getMessage());
        }

        paymentType = 'Paysafe';
      }

      const post = {
        enrollment_id: req.params.eId,
        pan: maskedPan,
        expiry_month: expiryMonth,
        expiry_year: expiryYear,
        eselect_plus_data_key: eselectPlusDataKey,
        cardeasexml_card_hash: cardeasexmlCardHash,
        cardeasexml_card_reference: cardeasexmlCardReference,
        paysafe_profile_id: paysafeProfileId,
        paysafe_card_id: paysafeCardId,
        paysafe_payment_token: paysafePaymentToken,
        paysafe_company: company,
        notified: paymentType === 'Paysafe' ? 0 : 1,
      };

      const sqlInsertPaymentMethod = `
INSERT INTO
  payment_methods
SET
  ?,
  payment_type_id = (SELECT id FROM payment_types WHERE name = ?),
  created = NOW(),
  modified = NOW()`;
      await connection.beginTransaction();
      let newPaymentMethod: any;
      try {
        newPaymentMethod = await connection.query(sqlInsertPaymentMethod, [post, paymentType]);
        await connection.query('UPDATE payment_methods SET `primary` = 0 WHERE enrollment_id = ?', req.params.eId);
        await connection.query('UPDATE payment_methods SET `primary` = 1 WHERE id = ?', newPaymentMethod.insertId);
        await connection.commit();
      } catch (err) {
        await connection.rollback();
        logger.error('Could not store new credit card in database');
        throw err;
      }

      res.setHeader('Location', `/v2/students/${req.params.sId}/enrollments/${req.params.eId}/paymentMethods/${newPaymentMethod.insertId}`);
      res.status(HttpStatus.CREATED).send({ id: newPaymentMethod.insertId });

      return;

    } finally {
      pool.releaseConnection(connection);
    }

  } catch (err) {
    if (err instanceof HttpStatus.HttpResponse && err.isClientError()) {
      res.status(err.statusCode).send({ message: err.message });
      logger.warn('error adding payment method', err);
      return;
    }
    logger.error('error adding payment method', err);
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).send({ error: err });
  }
}

function createCustomerId(studentNumber: string): string {
  const now = new Date();
  const dateString = now.getFullYear().toString() +
    (now.getMonth() + 1).toString() +
    now.getDate().toString() +
    now.getHours().toString() +
    now.getMinutes().toString() +
    now.getSeconds().toString() +
    now.getMilliseconds().toString();
  return studentNumber + '_' + dateString;
}
