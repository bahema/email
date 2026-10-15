import { config } from '../config.js';
import { openDatabase } from '../db/database.js';
import { migrate } from '../db/migrations.js';
import { SettingsStore } from '../settings/store.js';
import { TransactionalWorker } from '../mail/worker.js';

if(!config.SETTINGS_ENCRYPTION_KEY)throw new Error('Run npm run security:setup first');
const db=openDatabase(config.databasePath);migrate(db);
const worker=new TransactionalWorker(db,new SettingsStore(db,config.SETTINGS_ENCRYPTION_KEY,config.SITE_URL,config.TIMEZONE),config.SETTINGS_ENCRYPTION_KEY);
const stopWorker=worker.start(false);
console.info('Transactional mail worker running');
function stop(){void stopWorker().then(()=>{db.close();process.exit(0);});setTimeout(()=>process.exit(1),30000).unref();}
process.once('SIGINT',stop);process.once('SIGTERM',stop);

