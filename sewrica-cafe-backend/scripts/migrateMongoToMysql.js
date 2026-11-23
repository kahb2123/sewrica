require('dotenv').config();

const { MongoClient, ObjectId } = require('mongodb');
const database = require('../src/database');

const SOURCE_COLLECTIONS = [
  'users',
  'menuitems',
  'orders',
  'counters',
  'menucategories',
  'ingredients',
  'ingredientwithdrawals',
  'expenses',
  'giveaways'
];
const BATCH_SIZE = 250;

const normalizeBson = (value) => {
  if (value instanceof ObjectId) return value.toHexString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(normalizeBson);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, normalizeBson(child)])
    );
  }
  return value;
};

const writeBatch = async (connection, collectionName, documents) => {
  if (!documents.length) return;
  const placeholders = documents.map(() => '(?, ?, CAST(? AS JSON))').join(', ');
  const parameters = documents.flatMap((document) => [
    collectionName,
    String(document._id),
    JSON.stringify(document)
  ]);
  await connection.query(
    `INSERT INTO app_documents (collection_name, document_id, document_json)
     VALUES ${placeholders}
     ON DUPLICATE KEY UPDATE document_id = VALUES(document_id)`,
    parameters
  );
};

const migrate = async () => {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    throw new Error('Set MONGODB_URI to the source MongoDB connection string before migrating.');
  }

  const client = new MongoClient(mongoUri);
  let connection;
  try {
    await database.initialize();
    await client.connect();
    const sourceDb = client.db();
    connection = await database.getConnection();
    const available = new Set(
      (await sourceDb.listCollections({}, { nameOnly: true }).toArray()).map((entry) => entry.name)
    );

    for (const collectionName of SOURCE_COLLECTIONS) {
      if (!available.has(collectionName)) continue;
      const cursor = sourceDb.collection(collectionName).find({});
      let batch = [];
      let imported = 0;
      for await (const sourceDocument of cursor) {
        const document = normalizeBson(sourceDocument);
        batch.push(document);
        if (batch.length === BATCH_SIZE) {
          await writeBatch(connection, collectionName, batch);
          imported += batch.length;
          batch = [];
        }
      }
      if (batch.length) {
        await writeBatch(connection, collectionName, batch);
        imported += batch.length;
      }
      console.log(`Migrated ${imported} records from ${collectionName}`);
    }
    console.log('MongoDB-to-MySQL copy complete. MongoDB source records were left unchanged.');
  } finally {
    if (connection) connection.release();
    await client.close();
    await database.close();
  }
};

migrate().catch((error) => {
  console.error('MongoDB-to-MySQL migration failed:', error.message);
  process.exitCode = 1;
});
