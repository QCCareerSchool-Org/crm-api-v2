import * as dotenv from 'dotenv';
import { readFileSync } from 'fs';
import * as mysql from 'promise-mysql';

dotenv.config();

const config: mysql.PoolConfig = {
  connectionLimit: 100,
  host: process.env.REMOTE_DB_HOST,
  user: process.env.REMOTE_DB_USER,
  password: process.env.REMOTE_DB_PASSWORD,
  database: process.env.REMOTE_DB_DATABASE,
  charset: process.env.REMOTE_DB_CHARSET,
  debug: false,
};

if (!process.env.REMOTE_DB_KEY_FILE) {
  throw Error('Environment variable REMOTE_DB_KEY_FILE is required');
}
if (!process.env.REMOTE_DB_CERT_FILE) {
  throw Error('Environment variable REMOTE_DB_CERT_FILE is required');
}
if (!process.env.REMOTE_DB_CA_FILE) {
  throw Error('Environment variable REMOTE_DB_CA_FILE is required');
}

if (process.env.REMOTE_DB_SSL) {
  config.ssl = {
    key: readFileSync(process.env.REMOTE_DB_KEY_FILE),
    cert: readFileSync(process.env.REMOTE_DB_CERT_FILE),
    ca: readFileSync(process.env.REMOTE_DB_CA_FILE),
  };
}

const pool = mysql.createPool(config);

(async function test() {
  await pool.query(`SHOW VARIABLES LIKE '%ssl%'`);
})();

export default pool;
