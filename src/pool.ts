import * as dotenv from 'dotenv';
import * as mysql from 'promise-mysql';

dotenv.config();

export default mysql.createPool({
  connectionLimit: 100,
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  charset: process.env.DB_CHARSET,
  debug: false,
});
