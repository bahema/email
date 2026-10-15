import { config } from '../config.js';
import { openDatabase } from './database.js';
import { migrate } from './migrations.js';

const db = openDatabase(config.databasePath);
try { console.info(`Database ready. Schema version: ${migrate(db)}`); }
finally { db.close(); }
