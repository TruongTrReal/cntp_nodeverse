// automationManager.js
const fs = require('fs');
const path = require('path');
const os = require('os');
const { Builder } = require('selenium-webdriver');
const proxyChain = require('proxy-chain');

// The token plugin should have something like tokenPlugin.login() and tokenPlugin.check() for 'cntp'
const TokenPlugin = require('./tokenHandler');

const { initDB } = require('../init_db');
const {
  MAX_LOGIN_RETRIES,
  PROFILE_CLEANUP_ON_FAILURE,
  CHECK_INTERVAL,
  STAGGER_DELAY,
  EXTENSIONS,
  configureChromeOptions,
  FAILED_TASKS_PATH,
  logger
} = require('./config');

const { tabReset } = require('./automationHelpers');

// Ensure output and profiles directories exist
['./output', './profiles'].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

class AutomationManager {
  constructor() {
    this.tokenPlugin = new TokenPlugin();
    this.chromeOptions = configureChromeOptions();
    this.db = null;
  }

  /**
   * Lazy-load a single DB connection.
   */
  async getDB() {
    if (!this.db) {
      this.db = await initDB();
    }
    return this.db;
  }

  /**
   * Main entry point: load all (key, proxy) pairs, and handle each.
   */
  async run() {
    try {
      const keyProxyPairs = await this.loadKeyProxyData();
      const taskPromises = [];

      for (const kp of keyProxyPairs) {
        // kp => { id, the_key, proxy }
        taskPromises.push(
          this.handleKeyProxyTask(kp).catch(e => logger.error(`Task failed: ${e.message}`))
        );
        // Stagger the next key-proxy launch
        await this.sleep(STAGGER_DELAY);
      }

      await Promise.all(taskPromises);
      logger.info('[SYSTEM] All cntp automation tasks completed');

    } catch (error) {
      logger.error(`[SYSTEM ERROR] ${error.message}`);
    }
  }

  /**
   * Orchestrates the flow for a single key + proxy pair.
   *  1. Ensure there's a "cntp" task row in task_monitoring for (key_id, proxy).
   *  2. If that task is "success" or "failed", do nothing.
   *  3. Otherwise, try to login + check. On success => mark "success". On final fail => mark "failed".
   */
  async handleKeyProxyTask(kp) {
    const { id: keyId, the_key, proxy } = kp;
    const profilePath = this.getProfilePath(the_key, proxy);

    // Setup a single "cntp" task if it doesn't exist
    await this.initializeCNTPTask(keyId, proxy);

    // Check current state (pending, success, failed)
    let state = await this.getCNTPTaskState(keyId, proxy);
    if (state === 'success' || state === 'failed') {
      logger.info(`[SKIP] Key=${the_key}, Proxy=${proxy} is already marked as '${state}'.`);
      return;
    }

    // Attempt the automation
    let loginAttempts = 0;
    let driver;
    try {
      driver = await this.initializeDriver(profilePath, proxy);
      let loginSuccess = false;

      // Try login up to MAX_LOGIN_RETRIES times
      while (!loginSuccess && loginAttempts < MAX_LOGIN_RETRIES) {
        try {
          loginSuccess = await this.tokenPlugin.login(driver, 'cntp', the_key, proxy);
        } catch (error) {
          logger.error(`[LOGIN ERROR] ${error.message}`);
        }
        if (!loginSuccess) {
          loginAttempts++;
          logger.warn(`[RETRY] cntp login failed for key=${the_key}. Attempt ${loginAttempts}/${MAX_LOGIN_RETRIES}`);
        }
      }

      if (!loginSuccess) {
        logger.error(`[FAILURE] cntp login failed after ${MAX_LOGIN_RETRIES} attempts for key=${the_key}`);
        await this.updateCNTPTaskState(keyId, proxy, 'failed', 0);
        this.logFailedTask(the_key, proxy);
        return;
      }

      // If login succeeded, run check
      const checkResult = await this.tokenPlugin.check(driver, 'cntp', the_key, proxy);
      if (checkResult === false) {
        logger.warn(`[CHECK FAILURE] cntp check returned false for key=${the_key}`);
        await this.updateCNTPTaskState(keyId, proxy, 'failed', 0);
        this.logFailedTask(the_key, proxy);
      } else {
        // If checkResult is numeric (e.g., points), store it in the DB
        logger.info(`[CHECK SUCCESS] cntp check for key=${the_key} returned: ${checkResult}`);
        await this.updateCNTPTaskState(keyId, proxy, 'success', checkResult);
      }

    } catch (error) {
      logger.error(`[FATAL ERROR] Key=${the_key}: ${error.message}`);
      this.handleCleanup(profilePath);
    } finally {
      await tabReset(driver);
    }
  }

  /**
   * Initialize the single cntp row in task_monitoring if it doesn't exist.
   */
  async initializeCNTPTask(keyId, proxy) {
    try {
      const db = await this.getDB();
      // See if it exists
      const existing = await db.get(
        `SELECT id FROM task_monitoring WHERE key_id = ? AND proxy = ? AND service = 'cntp'`,
        [keyId, proxy]
      );
      if (!existing) {
        await db.run(
          `INSERT INTO task_monitoring (key_id, proxy, service, state, retry_count, point)
           VALUES (?, ?, 'cntp', 'pending', 0, 0)`,
          [keyId, proxy]
        );
        logger.info(`Initialized cntp task for key=${keyId}, proxy=${proxy}`);
      }
    } catch (error) {
      logger.error(`Failed to initialize cntp task for key_id=${keyId} and proxy=${proxy}: ${error.message}`);
    }
  }

  /**
   * Get the current state of the cntp task (pending, success, failed).
   */
  async getCNTPTaskState(keyId, proxy) {
    try {
      const db = await this.getDB();
      const row = await db.get(
        `SELECT state FROM task_monitoring
         WHERE key_id = ? AND proxy = ? AND service = 'cntp'`,
        [keyId, proxy]
      );
      return row ? row.state : null;
    } catch (error) {
      logger.error(`Failed to fetch cntp task state for key_id=${keyId}, proxy=${proxy}: ${error.message}`);
      return null;
    }
  }

  /**
   * Update the cntp task state in task_monitoring, including "point".
   */
  async updateCNTPTaskState(keyId, proxy, newState, point = 0) {
    try {
      const db = await this.getDB();
      await db.run(
        `UPDATE task_monitoring
         SET state = ?,
             last_updated = CURRENT_TIMESTAMP,
             point = ?
         WHERE key_id = ? AND proxy = ? AND service = 'cntp'`,
        [newState, point, keyId, proxy]
      );
      logger.info(`Updated cntp task for key_id=${keyId}, proxy=${proxy} -> ${newState}, point=${point}`);
    } catch (error) {
      logger.error(`Failed to update cntp task state: ${error.message}`);
    }
  }

  /**
   * Build the Chrome driver with the user-profile folder & proxy.
   */
  async initializeDriver(profilePath, proxyUrl) {
    const options = configureChromeOptions();
    const parsedProxy = await this.processProxy(proxyUrl);

    options.addArguments(`--user-data-dir=${profilePath}`);
    options.addArguments(`--proxy-server=${parsedProxy.url}`);

    // If the proxy has user:pass authentication, handle it
    if (parsedProxy.auth) {
      options.addArguments(`--proxy-auth=${parsedProxy.auth}`);
    }

    // If you have a specialized extension you want to load for cntp, do it here.
    await this.validateExtensions();
    const extConfig = EXTENSIONS['cntp'];
    if (extConfig && extConfig.valid) {
      try {
        options.addExtensions(extConfig.path);
        logger.info('[EXTENSION] Loaded cntp extension');
      } catch (error) {
        logger.error(`Failed to load cntp extension: ${error.message}`);
      }
    }

    const driver = await new Builder()
      .forBrowser('chrome')
      .setChromeOptions(options)
      .build();

    // Wait a moment for the browser to launch
    await driver.sleep(5000);
    await tabReset(driver);

    return driver;
  }

  /**
   * Convert the user-supplied proxy into an anonymized proxy-chain URL if needed.
   */
  async processProxy(proxyUrl) {
    const anonymized = await proxyChain.anonymizeProxy(`http://${proxyUrl}`);
    const parsed = new URL(anonymized);
    return {
      url: `${parsed.protocol}//${parsed.hostname}:${parsed.port}`,
      auth: parsed.username && parsed.password ? `${parsed.username}:${parsed.password}` : null
    };
  }

  /**
   * Remove the profile folder if configured to do so and if there's no reason to keep it.
   */
  handleCleanup(profilePath) {
    if (PROFILE_CLEANUP_ON_FAILURE) {
      try {
        fs.rmSync(profilePath, { recursive: true, force: true });
        logger.info(`[CLEANUP] Removed profile ${profilePath}`);
      } catch (error) {
        logger.error(`[PROFILE CLEANUP ERROR] ${error.message}`);
      }
    }
  }

  /**
   * If a cntp task fails, log it to JSON for post-mortem.
   */
  logFailedTask(the_key, proxy) {
    const entry = { key: the_key, proxy, service: 'cntp', timestamp: new Date().toISOString() };
    const data = fs.existsSync(FAILED_TASKS_PATH)
      ? JSON.parse(fs.readFileSync(FAILED_TASKS_PATH))
      : [];
    
    data.push(entry);
    fs.writeFileSync(FAILED_TASKS_PATH, JSON.stringify(data, null, 2));
  }

  /**
   * Confirm that any required extension file is readable and is a real Chrome extension.
   */
  async validateExtensions() {
    for (const [name, extConfig] of Object.entries(EXTENSIONS)) {
      if (!extConfig.path) continue; // skip blank config
      try {
        await fs.promises.access(extConfig.path, fs.constants.R_OK);
        const buffer = await fs.promises.readFile(extConfig.path);
        extConfig.valid = buffer.slice(0, 4).toString() === 'Cr24';
        logger.info(`Extension ${name} is ${extConfig.valid ? 'valid' : 'invalid'}`);
      } catch (error) {
        extConfig.valid = false;
        logger.error(`Extension ${name} check failed: ${error.message}`);
      }
    }
  }

  /**
   * Sleep helper.
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * For a given key+proxy, store the user data in a unique profile folder.
   */
  getProfilePath(the_key, proxy) {
    const sanitized = `${the_key}_${proxy}`.replace(/[^a-zA-Z0-9]/g, '_');
    return path.resolve(`./profiles/${sanitized}`);
  }

  /**
   * Load each key with its proxy from DB:
   *  keys.id, keys.the_key, keys_proxies.proxy
   *
   * Returns an array of objects like:
   *  [
   *    { id: 1, the_key: 'someKeyValue', proxy: 'host:port' },
   *    { id: 2, the_key: 'anotherKey', proxy: 'host2:port2' },
   *    ...
   *  ]
   */
  async loadKeyProxyData() {
    try {
      const db = await this.getDB();
      // Each key has exactly 1 proxy
      const rows = await db.all(`
        SELECT k.id, k.the_key, kp.proxy
          FROM keys k
          JOIN keys_proxies kp ON k.id = kp.key_id
      `);

      return rows.map(r => ({
        id: r.id,
        the_key: r.the_key,
        proxy: r.proxy
      }));
    } catch (error) {
      logger.error(`Failed to load keys+proxies from DB: ${error.message}`);
      return [];
    }
  }
}

module.exports = AutomationManager;
