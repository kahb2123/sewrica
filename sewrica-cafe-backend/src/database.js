const mysql = require('mysql2/promise');

const config = {
  host: process.env.MYSQL_HOST || process.env.MYSQLHOST || '127.0.0.1',
  port: Number(process.env.MYSQL_PORT || process.env.MYSQLPORT || 3306),
  user: process.env.MYSQL_USER || process.env.MYSQLUSER || 'root',
  password: process.env.MYSQL_PASSWORD || process.env.MYSQLPASSWORD || '',
  database: process.env.MYSQL_DATABASE || process.env.MYSQLDATABASE || 'sewrica_cafe',
  waitForConnections: true,
  connectionLimit: Number(process.env.MYSQL_CONNECTION_LIMIT || 10),
  charset: 'utf8mb4'
};

const pool = mysql.createPool(config);
let connected = false;

const initialize = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_documents (
      collection_name VARCHAR(64) NOT NULL,
      document_id VARCHAR(64) NOT NULL,
      document_json JSON NOT NULL,
      created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
        ON UPDATE CURRENT_TIMESTAMP(3),
      PRIMARY KEY (collection_name, document_id),
      INDEX idx_app_documents_collection (collection_name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin
  `);
  connected = true;
  return pool;
};

const getConnection = () => pool.getConnection();
const isConnected = () => connected;
const close = async () => {
  connected = false;
  await pool.end();
};

module.exports = { initialize, getConnection, isConnected, close, pool };
