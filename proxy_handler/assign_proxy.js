// proxy_handler/assign_proxy.js
const fs = require('fs');
const path = require('path');
const log4js = require('log4js');
const { initDB } = require('../init_db.js');

// Configure log4js
log4js.configure({
  appenders: {
    file: { type: 'file', filename: 'assign_proxy.log' },
    console: { type: 'console' }
  },
  categories: {
    default: { appenders: ['console', 'file'], level: 'info' }
  }
});

const logger = log4js.getLogger();

/**
 * Retrieve the list of proxies from the filtered_proxies table.
 */
async function getFilteredProxiesFromDB(db) {
  const rows = await db.all('SELECT proxy, success, fail FROM filtered_proxies');
  return rows.map(row => ({
    proxy: row.proxy,
    success: JSON.parse(row.success || '[]'),
    fail: JSON.parse(row.fail || '[]')
  }));
}

/**
 * Read one key per line from a file.
 */
function readKeysFromFile(filePath) {
  return fs.readFileSync(filePath, 'utf8')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(key => ({ key }));
}

/**
 * Assign proxies to each key. 
 * By default we assign 5 proxies per key (or fewer if not enough remain).
 */
function assignProxiesToKeys(keys, proxies) {
  // Create a working copy of the proxy list
  const availableProxies = [...proxies];
  
  return keys.map(k => {
    // Take first 5 proxies from the available list
    const assignedProxies = availableProxies.splice(0, 1); // 0, 5 if assign 5 driver for 1 key 
    return {
      key: k.key,
      proxies: assignedProxies.map(proxy => ({
        proxy: proxy.proxy
      }))
    };
  });
}

/**
 * Save the key-proxy mappings into the database.
 * Assumes you have a 'keys' table and a 'keys_proxies' table.
 */
async function saveKeyProxyMappings(db, keysWithProxies) {
  for (const k of keysWithProxies) {
    // Insert or ignore if key already exists
    await db.run(
      `INSERT OR IGNORE INTO keys (the_key) VALUES (?)`,
      [k.key]
    );
    
    // Get the key's row ID
    const { id } = await db.get(
      'SELECT id FROM keys WHERE the_key = ?',
      [k.key]
    );

    // Insert proxy associations
    for (const proxy of k.proxies) {
      await db.run(
        `INSERT OR IGNORE INTO keys_proxies (key_id, proxy) 
         VALUES (?, ?)`,
        [id, proxy.proxy]
      );
    }
  }
}

/**
 * Writes out proxies that have any failures into a file.
 */
async function saveFailedProxies(proxies, outputDir = './output') {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const failedProxies = proxies
    .filter(p => p.fail.length > 0)
    .map(p => p.proxy);

  const filePath = path.join(outputDir, 'failed_proxies.txt');
  fs.writeFileSync(filePath, failedProxies.join('\n'), 'utf8');
  logger.info(`Total failed proxies saved: ${failedProxies.length}`);
}

/**
 * Main function to read keys, assign proxies, and save mappings.
 */
async function processKeysAndProxies(keyFilePath, outputDir = './output') {
  try {
    const db = await initDB();
    
    // Load data
    const proxyList = await getFilteredProxiesFromDB(db);
    const keys = readKeysFromFile(keyFilePath);
    
    // Assign proxies
    const keysWithProxies = assignProxiesToKeys(keys, proxyList);
    
    // Save to database
    await saveKeyProxyMappings(db, keysWithProxies);
    
    // Save failed proxies
    await saveFailedProxies(proxyList, outputDir);
    
    await db.close();
    logger.info('Proxy assignment completed successfully');
  } catch (error) {
    logger.error(`Processing failed: ${error.message}`);
  }
}

module.exports = { processKeysAndProxies };
