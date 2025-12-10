import * as dotenv from 'dotenv';
import * as mysql from 'promise-mysql';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const config = {
  connectionLimit: 100,
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  charset: process.env.DB_CHARSET,
  debug: false,
};

const pool = mysql.createPool(config);

(async function test() {
  console.log((await pool).query(`SHOW VARIABLES LIKE '%ssl%'`));
})();

export default pool;
