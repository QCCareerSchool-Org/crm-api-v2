import * as validator from 'email-validator';
import * as express from 'express';
import * as fs from 'fs';

import * as HttpStatus from '@qccareerschool/http-status';
import { logger } from '../logger';
import pool from '../pool';
import { RowDataPacket } from 'mysql2';
import { ICountry } from '../countries/country';
import { IProvince } from '../countries/provinces';

/**
 * .
 * @param req Express request
 * @param res Express reponse
 */
export function options(req: express.Request, res: express.Response): void {
  fs.readFile(__dirname + '/../../options/students/student.json', 'utf8', (err, data) => {
    if (err) {
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).send({ error: err });
      return;
    }
    res.setHeader('Access-Control-Allow-Methods', 'HEAD,GET,PATCH,OPTIONS');
    res.setHeader('Allow', 'HEAD,GET,PATCH,OPTIONS');
    res.send(JSON.parse(data));
  });
}

/**
 * Outputs a student.
 * @param req Express request
 * @param res Express reponse
 */
export async function get(req: express.Request, res: express.Response): Promise<void> {

  try {

    // get a database connection from the pool
    const connection = await pool.getConnection();

    try {

      const sqlSelectStudent = `
SELECT sex, first_name, last_name, address1, address2, city, province_id,
postal_code, country_id, telephone_country_code, telephone_number, email_address
FROM students
WHERE id = ?
LIMIT 1`;
      const [students] = await connection.query<IStudent[]>(sqlSelectStudent, [req.params.sId]);
      const student = students[0];
      if (!student) {
        throw new HttpStatus.NotFound('student not found');
      }
      const result = student;

      // get country data
      const sqlSelectCountry = `
SELECT id, code, name
FROM countries
WHERE id = ?
LIMIT 1`;
      const [countries] = await connection.query<ICountry[]>(sqlSelectCountry, [student.country_id]);
      const country = countries[0];
      if (!country) {
        throw new HttpStatus.InternalServerError('country not found');
      }
      result.country = country;

      if (student.province_id !== null) {

        // get province data
        const sqlSelectProvince = `
SELECT id, code, name
FROM provinces
WHERE id = ?
LIMIT 1`;
        const [provinces] = await connection.query<IProvince[]>(sqlSelectProvince, [student.province_id]);
        if (!provinces.length) {
          throw new HttpStatus.InternalServerError('province not found');
        }
        result.province = provinces[0];

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

/**
 * Patches arbitrary data in a student.
 * @param req Express request
 * @param res Express response
 */
export async function patch(req: express.Request, res: express.Response): Promise<void> {

  try {

    interface IPayload {
      address1?: string;
      address2?: string;
      city?: string;
      province_code?: string | null;
      province_id?: number | null;
      postal_code?: string | null;
      country_code?: string;
      country_id?: number;
      telephone_country_code?: number;
      telephone_number?: string | null;
      email_address?: string | null;
    }

    const payload: IPayload = {};

    // first_name, string, not null
    if (typeof req.body.first_name !== 'undefined') {
      // no action
    }

    // last_name, string, not null
    if (typeof req.body.last_name !== 'undefined') {
      // no acction
    }

    // address1, string, not null
    if (typeof req.body.address1 !== 'undefined') {
      if (!req.body.address1.length) {
        throw new HttpStatus.UnprocessableEntity('invalid address1');
      }
      payload.address1 = req.body.address1;
    }

    // address2, string, not null
    if (typeof req.body.address2 !== 'undefined') {
      payload.address2 = req.body.address2;
    }

    // city, string, not null
    if (typeof req.body.city !== 'undefined') {
      if (!req.body.city.length) {
        throw new HttpStatus.UnprocessableEntity('invalid city');
      }
      payload.city = req.body.city;
    }

    // province_id, integer, can be null
    if (typeof req.body.province_id !== 'undefined') {
      if (!req.body.province_id.length) {
        payload.province_id = null;
      } else {
        payload.province_id = parseInt(req.body.province_id, 10);
      }
    }

    // postal_code, string, can be null
    if (typeof req.body.postal_code !== 'undefined') {
      if (!req.body.postal_code.length) {
        payload.postal_code = null;
      } else {
        payload.postal_code = req.body.postal_code;
      }
    }

    // country_id, integer, not null {
    if (typeof req.body.country_id !== 'undefined') {
      if (!req.body.country_id.length) {
        throw new HttpStatus.UnprocessableEntity('invalid country_id');
      }
      payload.country_id = parseInt(req.body.country_id, 10);
    }

    // telephone_country_code, integer, not null
    if (typeof req.body.telephone_country_code !== 'undefined') {
      if (!req.body.telephone_country_code.length) {
        throw new HttpStatus.UnprocessableEntity('invalid telephone_country_code');
      }
      payload.telephone_country_code = parseInt(req.body.telephone_country_code, 10);
    }

    // telephone_number
    if (typeof req.body.telephone_number !== 'undefined') {
      if (!req.body.telephone_number.length) {
        payload.telephone_number = null;
      } else {
        payload.telephone_number = req.body.telephone_number;
      }
    }

    // email_address
    if (typeof req.body.email_address !== 'undefined') {
      if (!req.body.email_address.length) {
        payload.email_address = null;
      } else {
        payload.email_address = req.body.email_address;
      }
    }

    // get a database connection from the pool
    const connection = await pool.getConnection();

    try {

      // check that this student exists
      const [students] = await connection.query<IStudent[]>('SELECT id FROM students WHERE id = ?', [req.params.sId]);
      if (!students.length) {
        throw new HttpStatus.NotFound('student not found');
      }

      if (typeof req.body.country_id !== 'undefined' || typeof req.body.province_id !== 'undefined') {
        // a country or a province was supplied

        let countryName: string | null = null;

        if (typeof req.body.country_id === 'undefined') { // no country supplied

          // look up this student's existing country
          const sql = `SELECT c.name
                        FROM countries c
                        LEFT JOIN students s ON s.country_id = c.id
                        WHERE s.id = ?
                        LIMIT 1`;
          const [countries] = await connection.query<ICountry[]>(sql, [req.params.sId]);
          const country = countries[0];
          if (!country) {
            throw Error('Country not found');
          }
          countryName = country.name.toLowerCase();

        } else { // country was supplied

          // look up the supplied country
          const sql = 'SELECT c.name FROM countries c WHERE c.id = ?';
          const [countries] = await connection.query<ICountry[]>(sql, [req.body.country_id]);
           const country = countries[0];
          if (!country) {
            throw Error('Country not found');
          }
          countryName = country.name.toLowerCase();
        }

        if (countryName === 'canada' || countryName === 'united states' || countryName === 'australia') {
          if (typeof req.body.province_id !== 'undefined' && !req.body.province_id.length) {
            throw new HttpStatus.Conflict(`province_id can not be null for ${countryName}.`);
          }
        } else {
          payload.province_id = null; // overwrite any province
        }
      }

      // update the students table
      const sqlUpdateStudent = 'UPDATE students SET ? WHERE id = ? LIMIT 1';
      await connection.query(sqlUpdateStudent, [payload, req.params.sId]);

      // add a record to the notes table
      try {
        const note = `Student updated information:\n ${JSON.stringify(payload, null, '\t')}`;
        const sqlInsertNote = 'INSERT INTO notes SET `student_id` = ?, `note` = ?, `created` = NOW(), `modified` = NOW()';
        await connection.query(sqlInsertNote, [req.params.sId, note]);
      } catch (err) {
        logger.error(err);
      }

      logger.info('account change', [req.params, payload]);
      res.status(HttpStatus.NO_CONTENT).end();

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

/**
 * .
 * @param req Express request
 * @param res Express reponse
 */
export function addressOptions(req: express.Request, res: express.Response): void {
  fs.readFile(__dirname + '/../../options/students/student-address.json', 'utf8', (err, data) => {
    if (err) {
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).send({ error: err });
      return;
    }
    res.setHeader('Access-Control-Allow-Methods', 'HEAD,GET,PUT,OPTIONS');
    res.setHeader('Allow', 'HEAD,GET,PUT,OPTIONS');
    res.send(JSON.parse(data));
  });
}

/**
 * Outputs a student's physical address.
 * @param req Express request
 * @param res Express response
 */
export async function getAddress(req: express.Request, res: express.Response): Promise<void> {

  logger.info('getAddress', req.params);
  try {

    // get a database connection from the pool
    const connection = await pool.getConnection();

    try {

      const sqlSelectStudent = `
SELECT address1, address2, city, province_id, postal_code, country_id
FROM students
WHERE id = ?
LIMIT 1`;
      const [ students ] = await connection.query<IStudent[]>(sqlSelectStudent, [req.params.sId]);
      const student = students[0];
      if (!student) {
        throw new HttpStatus.NotFound('student not found');
      }
      const result = student;

      // get country data
      const sqlSelectCountry = `
SELECT id, code, name
FROM countries
WHERE id = ?
LIMIT 1`;
      const [countries] = await connection.query<ICountry[]>(sqlSelectCountry, [student.country_id]);
      const country = countries[0];
      if (!country) {
        throw new HttpStatus.InternalServerError('country not found');
      }
      result.country = country;

      if (student.province_id !== null) {

        // get province data
        const sqlSelectProvince = `
SELECT id, code, name
FROM provinces
WHERE id = ?
LIMIT 1`;
        const [ provinces ] = await connection.query<IProvince[]>(sqlSelectProvince, student.province_id);
        if (!provinces.length) {
          throw new HttpStatus.InternalServerError('province not found');
        }
        result.province = provinces[0];

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

/**
 * Updates a student's physical address.
 * @param req Express request
 * @param res Express response
 */
export async function updateAddress(req: express.Request, res: express.Response): Promise<void> {

  logger.info('updateAddress', req.body);
  try {

    // address1, string, not null
    if (typeof req.body.address1 === 'undefined') {
      throw new HttpStatus.BadRequest('address1 is required');
    }
    if (!req.body.address1.length) {
      throw new HttpStatus.UnprocessableEntity('invalid address1');
    }
    const address1: string = req.body.address1;

    // address2, string, not null (can be empty)
    if (typeof req.body.address2 === 'undefined') {
      throw new HttpStatus.BadRequest('address2 is required');
    }
    const address2: string = req.body.address2;

    // city, string, not null
    if (typeof req.body.city === 'undefined') {
      throw new HttpStatus.BadRequest('city is required');
    }
    if (!req.body.city.length) {
      throw new HttpStatus.UnprocessableEntity('invalid city');
    }
    const city: string = req.body.city;

    // province_id, integer, null
    if (typeof req.body.province_id === 'undefined') {
      throw new HttpStatus.BadRequest('province_id is required');
    }
    const provinceId = req.body.province_id.length ? parseInt(req.body.province_id, 10) : null;

    // postal_code, string, null
    if (typeof req.body.postal_code === 'undefined') {
      throw new HttpStatus.BadRequest('postal_code is required');
    }
    const postalCode: string = req.body.postal_code.length ? req.body.postal_code : null;

    // country_id, integer, not null
    if (typeof req.body.country_id === 'undefined') {
      throw new HttpStatus.BadRequest('country_id is required');
    }
    const countryId = typeof req.body.country_id === 'string' ? parseInt(req.body.country_id, 10) : req.body.country_id;

    const payload = {
      address1,
      address2,
      city,
      province_id: provinceId,
      postal_code: postalCode,
      country_id: countryId,
    };

    // get a database connection from the pool
    const connection = await (await pool).getConnection();

    try {

      // check that this student exists
      const students = await connection.query('SELECT id FROM students WHERE id = ?', [req.params.sId]);
      if (!students.length) {
        throw new HttpStatus.NotFound('student not found');
      }

      // look up the supplied country
      const sqlSelectCountries = 'SELECT c.name, c.needs_postal_code FROM countries c WHERE c.id = ?';
      const [countries] = await connection.query<ICountry[]>(sqlSelectCountries, [payload.country_id]);
      const country = countries[0];
      if (!country) {
        throw new HttpStatus.UnprocessableEntity('invalid country_id');
      }
      const countryName = country.name.toLowerCase();
      const needsPostalCode = country.needs_postal_code;

      if (countryName === 'canada' || countryName === 'united states' || countryName === 'australia') {
        if (payload.province_id === null) {
          throw new HttpStatus.Conflict(`province_id can not be null for ${countryName}.`);
        }
      } else {
        payload.province_id = null; // overwrite any province that was provided
      }

      if (needsPostalCode) {
        if (payload.postal_code === null) {
          throw new HttpStatus.Conflict(`postal_code is required for ${countryName}`);
        }
      }

      // lookup the supplied province_id
      if (payload.province_id !== null) {
        const sqlSelectProvinces = 'SELECT p.name FROM provinces p WHERE p.country_id = ? and p.id = ?';
        const provinces = await connection.query(sqlSelectProvinces, [payload.country_id, payload.province_id]);
        if (!provinces.length) {
          throw new HttpStatus.UnprocessableEntity('invalid province_id');
        }
      }

      // update the students table
      await connection.query('UPDATE students SET ? WHERE id = ? LIMIT 1', [payload, req.params.sId]);

      // add a record to the notes table
      try {
        const payloadNote = {
          student_id: req.params.sId,
          note: `Student updated address:\n ${JSON.stringify(payload, null, '\t')}`,
        };
        await connection.query('INSERT INTO notes SET ?, `created` = NOW(), `modified` = NOW()', payloadNote);
      } catch (err) {
        logger.error(err);
      }

      logger.info('address changed', [req.params, payload]);
      return res.status(HttpStatus.NO_CONTENT).end();

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

/**
 * .
 * @param req Express request
 * @param res Express reponse
 */
export function emailAddressOptions(req: express.Request, res: express.Response): void {
  fs.readFile(__dirname + '/../../options/students/student-email.json', 'utf8', (err, data) => {
    if (err) {
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).send({ error: err });
      return;
    }
    res.setHeader('Access-Control-Allow-Methods', 'HEAD,GET,PUT,OPTIONS');
    res.setHeader('Allow', 'HEAD,GET,PUT,OPTIONS');
    res.send(JSON.parse(data));
  });
}

/**
 * Outputs a student's email address.
 * @param req Express request
 * @param res Express response
 */
export async function getEmailAddress(req: express.Request, res: express.Response): Promise<void> {

  try {

    // get a database connection from the pool
    const connection = await (await pool).getConnection();

    try {

      const sqlSelectStudent = `SELECT email_address
                                FROM students
                                WHERE id = ?
                                LIMIT 1`;
      const [students] = await connection.query<IStudent[]>(sqlSelectStudent, [req.params.sId]);
      const student = students[0];
      if (!student) {
        throw new HttpStatus.NotFound('student not found');
      }
      const result = student.email_address;

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

/**
 * Updates a student's email address.
 * @param req Express request
 * @param res Express response
 */
export async function updateEmailAddress(req: express.Request, res: express.Response): Promise<void> {

  logger.info('updateEmailAddress');

  try {

    // email_address, string, null
    if (typeof req.body.email_address === 'undefined') {
      throw new HttpStatus.BadRequest('email_address is required');
    }
    let emailAddress: string | null = null;
    if (req.body.email_address.length) {
      const valid = validator.validate(req.body.email_address);
      if (valid === false) {
        throw new HttpStatus.UnprocessableEntity('invalid email_address');
      }
      emailAddress = req.body.email_address;
    }

    const payload = {
      email_address: emailAddress,
    };

    // get a database connection from the pool
    const connection = await (await pool).getConnection();

    try {

      // check that this student exists
      const students = await connection.query('SELECT id FROM students WHERE id = ?', [req.params.sId]);
      if (!students.length) {
        throw new HttpStatus.NotFound('student not found');
      }

      // update the students table
      await connection.query('UPDATE students SET ? WHERE id = ? LIMIT 1', [payload, req.params.sId]);

      // add a record to the notes table
      try {
        const payloadNote = {
          student_id: req.params.sId,
          note: `Student updated email address:\n ${JSON.stringify(payload, null, '\t')}`,
        };
        await connection.query('INSERT INTO notes SET ?, `created` = NOW(), `modified` = NOW()', payloadNote);
      } catch (err) {
        logger.error(err);
      }

      logger.info('email address changed', [req.params, payload]);
      return res.status(HttpStatus.NO_CONTENT).end();

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

/**
 * .
 * @param req Express request
 * @param res Express reponse
 */
export function telephoneNuberOptions(req: express.Request, res: express.Response): void {
  fs.readFile(__dirname + '/../../options/students/student-tel.json', 'utf8', (err, data) => {
    if (err) {
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).send({ error: err });
      return;
    }
    res.setHeader('Access-Control-Allow-Methods', 'HEAD,GET,PUT,OPTIONS');
    res.setHeader('Allow', 'HEAD,GET,PUT,OPTIONS');
    res.send(JSON.parse(data));
  });
}

/**
 * Outputs a student's telephone number and country dialing code.
 * @param req Express request
 * @param res Express response
 */
export async function getTelephoneNumber(req: express.Request, res: express.Response): Promise<void> {

  try {

    // get a database connection from the pool
    const connection = await pool.getConnection();

    try {

      const sqlSelectStudent = `SELECT telephone_country_code, telephone_number
                                FROM students
                                WHERE id = ?
                                LIMIT 1`;
      const [students] = await connection.query<IStudent[]>(sqlSelectStudent, [req.params.sId]);
      const student = students[0];
      if (!student) {
        throw new HttpStatus.NotFound('student not found');
      }
      const result = {
        country_code: student.telephone_country_code,
        number: student.telephone_number,
      };

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

export async function updateTelephoneNumber(req: express.Request, res: express.Response): Promise<void> {

  try {

    // country_code: integer, not null
    if (typeof req.body.country_code === 'undefined') {
      throw new HttpStatus.BadRequest('country_code is required');
    }
    if (!req.body.country_code.length) {
      throw new HttpStatus.UnprocessableEntity('invalid country_code');
    }
    const telephoneCountryCode = parseInt(req.body.country_code, 10);

    const NORTH_AMERICA_DIALING_CODE = 1;
    const GB_DIALING_CODE = 44;
    const AU_DIALING_CODE = 61;
    const NZ_DIALING_CODE = 64;

    // number: integer, null
    if (typeof req.body.number === 'undefined') {
      throw new HttpStatus.BadRequest('number is required');
    }
    const bodyNumber = req.body.number;
    if (typeof bodyNumber !== 'string') {
      throw new HttpStatus.BadRequest('number must be of type string');
    }
    let telephoneNumber: string | null = null;
    if (bodyNumber.length) {
      if (telephoneCountryCode === NORTH_AMERICA_DIALING_CODE) {
        telephoneNumber = fixNATelephoneNumber(req.body.number);
      } else {
        telephoneNumber = bodyNumber;
        telephoneNumber = telephoneNumber.replace(/[^\d]/g, '');
        if (telephoneCountryCode === AU_DIALING_CODE) {
          if (!/^((1300|1800)[0-9]{6})|0[1-9][0-9]{8}$/.test(telephoneNumber)) {
            throw new HttpStatus.BadRequest('Invalid telephone number. The format must be 0xxxxxxxxx, 1300xxxxxx, or 1800xxxxxx.');
          }
        } else if (telephoneCountryCode === GB_DIALING_CODE || telephoneCountryCode === NZ_DIALING_CODE) {
          if (telephoneNumber.substring(0, 1) !== '0') {
            telephoneNumber = '0' + telephoneNumber;
          }
        }
      }
    }

    const payload = {
      telephone_country_code: telephoneCountryCode,
      telephone_number: telephoneNumber,
    };

    // get a database connection from the pool
    const connection = await (await pool).getConnection();

    try {

      // check that this student exists
      const students = await connection.query('SELECT id FROM students WHERE id = ?', [req.params.sId]);
      if (!students.length) {
        throw new HttpStatus.NotFound('student not found');
      }

      // update the students table
      await connection.query('UPDATE students SET ? WHERE id = ? LIMIT 1', [payload, req.params.sId]);

      // add a record to the notes table
      try {
        const payloadNote = {
          student_id: req.params.sId,
          note: `Student updated telephone number:\n ${JSON.stringify(payload, null, '\t')}`,
        };
        await connection.query('INSERT INTO notes SET ?, `created` = NOW(), `modified` = NOW()', payloadNote);
      } catch (err) {
        logger.error(err);
      }

      logger.info('telephone number changed', [req.params, payload]);
      res.status(HttpStatus.OK).send({ telephone_number: payload });

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

/**
 * Formats a telephone number like XXX-XXX-XXXX.
 * @param telephoneNumber a telephone number
 */
function fixNATelephoneNumber(telephoneNumber: string): string {
  /* tslint:disable:no-magic-numbers */

  const strippedNumber = telephoneNumber.replace(/\D/, '');

  if (strippedNumber.length === 10) {
    return `${strippedNumber.substr(0, 3)}-${strippedNumber.substr(3, 3)}-${strippedNumber.substr(6, 4)}`;
  }

  if (strippedNumber.length === 11 && strippedNumber.substr(0, 1) === '1') {
    return `${strippedNumber.substr(1, 3)}-${strippedNumber.substr(4, 3)}-${strippedNumber.substr(7, 4)}`;
  }

  return telephoneNumber; // there's nothing we can do

  /* tslint:enable:no-magic-numbers */
}

export interface IStudent extends RowDataPacket {
  id: number;
  sex: string;
  first_name: string;
  last_name: string;
  address1: string;
  address2: string;
  city: string;
  province_id: number;
  postal_code: string;
  country_id: number;
  telephone_country_code: number;
  telephone_number: string;
  email_address: string;
  country?: ICountry;
  province?: IProvince;
}