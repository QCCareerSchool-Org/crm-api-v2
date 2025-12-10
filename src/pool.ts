import * as dotenv from 'dotenv';
import mysql, { PoolOptions } from 'mysql2/promise';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const config: PoolOptions = {
  connectionLimit: 100,
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  charset: process.env.DB_CHARSET,
  debug: false,
};

console.log('local');

const pool = mysql.createPool(config);

(async function test() {
  console.log('local');
  const [ result ] =  await pool.query(`SHOW VARIABLES LIKE '%ssl%'`)
  console.log(result);
})();

export default pool;
