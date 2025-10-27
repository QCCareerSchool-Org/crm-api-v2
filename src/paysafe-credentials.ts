import * as dotenv from 'dotenv';

dotenv.config();

if (typeof process.env.PAYSAFE_ENVIRONMENT === 'undefined') {
  throw new Error('PAYSAFE_ENVIRONMENT is undefined');
}
if (process.env.PAYSAFE_ENVIRONMENT !== 'LIVE' && process.env.PAYSAFE_ENVIRONMENT !== 'TEST') {
  throw new Error('PAYSAFE_ENVIRONMENT must be LIVE or TEST');
}
export const environment = process.env.PAYSAFE_ENVIRONMENT;

/* CA */
if (typeof process.env.CA_PAYSAFE_API_KEY === 'undefined') {
  throw new Error('CA_PAYSAFE_API_KEY is undefined');
}
export const caApiKey = process.env.CA_PAYSAFE_API_KEY;

if (typeof process.env.CA_PAYSAFE_API_PASSWORD === 'undefined') {
  throw new Error('CA_PAYSAFE_API_PASSWORD is undefined');
}
export const caApiPassword = process.env.CA_PAYSAFE_API_PASSWORD;

if (typeof process.env.CA_PAYSAFE_ACCOUNT_NUMBER_CAD === 'undefined') {
  throw new Error('CA_PAYSAFE_ACCOUNT_NUMBER_CAD is undefined');
}
export const caAccountCAD = process.env.CA_PAYSAFE_ACCOUNT_NUMBER_CAD;

if (typeof process.env.CA_PAYSAFE_ACCOUNT_NUMBER_USD === 'undefined') {
  throw new Error('CA_PAYSAFE_ACCOUNT_NUMBER_USD is undefined');
}
export const caAccountUSD = process.env.CA_PAYSAFE_ACCOUNT_NUMBER_USD;

if (typeof process.env.CA_PAYSAFE_ACCOUNT_NUMBER_GBP === 'undefined') {
  throw new Error('CA_PAYSAFE_ACCOUNT_NUMBER_GBP is undefined');
}
export const caAccountGBP = process.env.CA_PAYSAFE_ACCOUNT_NUMBER_GBP;

if (typeof process.env.CA_PAYSAFE_ACCOUNT_NUMBER_AUD === 'undefined') {
  throw new Error('CA_PAYSAFE_ACCOUNT_NUMBER_AUD is undefined');
}
export const caAccountAUD = process.env.CA_PAYSAFE_ACCOUNT_NUMBER_AUD;

if (typeof process.env.CA_PAYSAFE_ACCOUNT_NUMBER_NZD === 'undefined') {
  throw new Error('CA_PAYSAFE_ACCOUNT_NUMBER_NZD is undefined');
}
export const caAccountNZD = process.env.CA_PAYSAFE_ACCOUNT_NUMBER_NZD;


/* US */
if (typeof process.env.US_PAYSAFE_API_KEY === 'undefined') {
  throw new Error('US_PAYSAFE_API_KEY is undefined');
}
export const usApiKey = process.env.US_PAYSAFE_API_KEY;

if (typeof process.env.US_PAYSAFE_API_PASSWORD === 'undefined') {
  throw new Error('US_PAYSAFE_API_PASSWORD is undefined');
}
export const usApiPassword = process.env.US_PAYSAFE_API_PASSWORD;

if (typeof process.env.US_PAYSAFE_ACCOUNT_NUMBER_USD === 'undefined') {
  throw new Error('US_PAYSAFE_ACCOUNT_NUMBER_USD is undefined');
}
export const usAccountUSD = process.env.US_PAYSAFE_ACCOUNT_NUMBER_USD;

/* GB */
if (typeof process.env.GB_PAYSAFE_API_KEY === 'undefined') {
  throw new Error('GB_PAYSAFE_API_KEY is undefined');
}
export const gbApiKey = process.env.GB_PAYSAFE_API_KEY;

if (typeof process.env.GB_PAYSAFE_API_PASSWORD === 'undefined') {
  throw new Error('GB_PAYSAFE_API_PASSWORD is undefined');
}
export const gbApiPassword = process.env.GB_PAYSAFE_API_PASSWORD;

if (typeof process.env.GB_PAYSAFE_ACCOUNT_NUMBER_GBP === 'undefined') {
  throw new Error('GB_PAYSAFE_ACCOUNT_NUMBER_GBP is undefined');
}
export const gbAccountGBP = process.env.GB_PAYSAFE_ACCOUNT_NUMBER_GBP;

if (typeof process.env.GB_PAYSAFE_ACCOUNT_NUMBER_AUD === 'undefined') {
  throw new Error('GB_PAYSAFE_ACCOUNT_NUMBER_AUD is undefined');
}
export const gbAccountAUD = process.env.GB_PAYSAFE_ACCOUNT_NUMBER_AUD;

if (typeof process.env.GB_PAYSAFE_ACCOUNT_NUMBER_NZD === 'undefined') {
  throw new Error('GB_PAYSAFE_ACCOUNT_NUMBER_NZD is undefined');
}
export const gbAccountNZD = process.env.GB_PAYSAFE_ACCOUNT_NUMBER_NZD;
