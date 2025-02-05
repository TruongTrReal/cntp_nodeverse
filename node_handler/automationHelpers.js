// automationHelpers.js
const { By, until } = require('selenium-webdriver');
const config = require('./config');

async function waitForElement(driver, selector, timeout = config.timeouts.element) {
  try {
    return await driver.wait(until.elementLocated(By.xpath(selector)), timeout);
  } catch (error) {
    throw new Error(`Element not found: ${selector} - ${error.message}`);
  }
}

async function checkElementExsist(driver, selector, timeout = config.timeouts.element) {
  try {
    await driver.wait(until.elementLocated(By.xpath(selector)), timeout);
    return true;
  } catch (error) {
    return false;
  }
}

async function clickElement(driver, selector) {
  const element = await waitForElement(driver, selector);
  await element.click();
}

async function safeClick(driver, selector, timeout = 2000) {
  try {
    const element = await driver.wait(until.elementLocated(By.xpath(selector)), timeout);
    await element.click();
    return true;
  } catch (error) {
    return false;
  }
}

async function enterText(driver, selector, text) {
  const element = await waitForElement(driver, selector, 10000);
  // await element.clear();
  await element.sendKeys(text);
}

async function tabReset(driver) {
    // Tab cleanup logic.
    try {
      const handles = await driver.getAllWindowHandles();
      if (handles.length > 1) {
        for (let i = handles.length - 1; i > 0; i--) {
          await driver.switchTo().window(handles[i]);
          await driver.close();
        }
        await driver.switchTo().window(handles[0]);
      }
      await driver.get('about:blank');
    } catch (error) {
      logger.error(`[TAB CLEANUP ERROR] ${error.message}`);
    }
  }

module.exports = {
  waitForElement,
  checkElementExsist,
  clickElement,
  safeClick,
  enterText,
  tabReset
};
