import { config } from '../config.js';
import { openDatabase } from '../db/database.js';
import { migrate } from '../db/migrations.js';
import { SettingsStore } from '../settings/store.js';
import { MarketingWorker } from '../marketing/worker.js';
if(!config.SETTINGS_ENCRYPTION_KEY)throw new Error('Run npm run security:setup first');
const db=openDatabase(config.databasePath);migrate(db);
const stop=new MarketingWorker(db,new SettingsStore(db,config.SETTINGS_ENCRYPTION_KEY,config.SITE_URL,config.TIMEZONE)).start(false);
console.info('Marketing campaign worker running');
function shutdown(){void stop().then(()=>{db.close();process.exit(0);});setTimeout(()=>process.exit(1),30000).unref();}
process.once('SIGINT',shutdown);process.once('SIGTERM',shutdown);
