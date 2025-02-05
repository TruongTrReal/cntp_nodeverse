// CNTP.js
const { By, until } = require('selenium-webdriver');
const config = require('./config');
const { waitForElement, clickElement, safeClick, enterText } = require('./automationHelpers');
const log4js = require('log4js');

class CNTPService {
  constructor() {
    this.logger = log4js.getLogger('CNTPService');
  }

  async login(driver, key, proxyUrl) {
    try {
      this.logger.info(`Starting CNTP login for ${key}`);

      const { login_url, extension_url, selectors } = config.services.cntp;
      await driver.get(login_url);

      // Check if already logged in by verifying the dashboard element.
      try {
        await waitForElement(driver, selectors.loginConfirmElement, 20000);
        this.logger.info(`Already loged in CNTP for ${key}`);
        return true;
      } catch (e) {
        // Not logged in; proceed with the login flow.
      }

      await enterText(driver, selectors.keyInput, key);
      await clickElement(driver, selectors.loginButton);
      await driver.sleep(3000);
      await driver.get(extension_url);
      await waitForElement(driver, selectors.loginConfirmElement, 20000);

      this.logger.info(`Login success for CNTP ${key}`);
      return true;
    } catch (error) {
      this.logger.error(`CNTP login failed for ${key}: ${error.message}`);
      return false;
    }
  }

  async check(driver, key, proxyUrl) {
    try {
      await driver.get(config.services.cntp.extension_url);
      await driver.sleep(5000);
      const { selectors } = config.services.cntp;

      const getValueSafe = async (selector) => {
        try {
          const element = await waitForElement(driver, selector);
          return await element.getText();
        } catch (error) {
          this.logger.warn(`Element not found: ${selector}`);
          return 'N/A';
        }
      };

      const [cntpValue] = await Promise.all([
        getValueSafe(selectors.cntpValue)
      ]);

      this.logger.info(`
      CNTP status for ${key}:
      Value: ${cntpValue}
    `);

    let point = parseInt(cntpValue);
    if (isNaN(point)) {
      point = 0;
    }
    return point;

    } catch (error) {
      this.logger.error(`CNTP check failed for ${key}: ${error.message}`);
      return false;
    }
  }
}

module.exports = new CNTPService();
