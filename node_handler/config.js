const fs = require('fs');
const path = require('path');
const os = require('os');
const chrome = require('selenium-webdriver/chrome');
const log4js = require('log4js');

// Ensure the output/log directory exists
const logDir = path.resolve(__dirname, './output', 'log');

if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// ─── SERVICES CONFIGURATION ──────────────────────────────────────────────
const services = {
  openloop: {
    login_url: "chrome-extension://effapmdildnpkiaeghlkicpfflpiambm/dist/popup/index.html",
    extension_url: "chrome-extension://effapmdildnpkiaeghlkicpfflpiambm/dist/popup/index.html",
    selectors: {
      continueButton: '//*[@id="app"]/div/div/div[1]/div/div/a/button',
      username: '.el-input-wrapper[type="email"] > .relative > input.el-input',
      password: '.el-input-wrapper[type="password"] > .relative > input.el-input',
      loginButton: '.btn.btn-white.mt-3',
      loginConfirmElement: '//*[@id="app"]/div/div/div[1]/div/div/div[3]/div/div/div/div[1]/a/img',
      status: '//*[@id="app"]/div/div/div[1]/div/div/div[1]/span',
      quality: '//*[@id="app"]/div/div/div[1]/div/div/div[2]/div[1]/span',
      earnings: '//*[@id="app"]/div/div/div[1]/div/div/div[2]/div[2]/div[2]/span'
    }
  },
  gradient: {
    login_url: "https://app.gradient.network/",
    extension_url: "chrome-extension://caacbgbklghmpodbdafajbgdnegacfmo/popup.html",
    selectors: {
      // Login selectors
      username: '/html/body/div[1]/div[2]/div/div/div/div[2]/div[1]/input',
      password: '/html/body/div[1]/div[2]/div/div/div/div[2]/div[2]/span/input',
      loginButton: '/html/body/div[1]/div[2]/div/div/div/div[4]/button[1]',
      loginConfirmElement: '//*[@id="root-gradient-extension-popup-20240807"]/div/div[3]/div/div[2]',
      dashboardElement: '/html/body/div[1]/div[1]/div[2]/main/div/div/div[1]',
      // Skip button selectors
      gotItButton: '/html/body/div[3]/div/div[2]/div/div[1]/div/div/div/button',
      yesButton: '/html/body/div[2]/div/div[2]/div/div[1]/div/div/div/button',
      rewardSwitchButton: '//*[@id="root-gradient-extension-popup-20240807"]/div/div[3]/div/div[3]',
      // Value selectors
      status: '//*[@id="root-gradient-extension-popup-20240807"]/div/div[1]/div[2]/div[3]/div[2]/div/div[2]/div',
      tapToday: '//*[@id="root-gradient-extension-popup-20240807"]/div/div[4]/div[1]/div[1]',
      uptime: '//*[@id="root-gradient-extension-popup-20240807"]/div/div[4]/div[2]/div[1]',
      todayReward: '//*[@id="root-gradient-extension-popup-20240807"]/div/div[4]/div[1]/div[1]',
      sessionReward: '//*[@id="root-gradient-extension-popup-20240807"]/div/div[4]/div[2]/div[1]'
    }
  },
  toggle: {
    login_url: "https://toggle.pro/sign-in",
    extension_url: "chrome-extension://bnkekngmddejlfdeefjilpfdhomeomgb/index.html",
    selectors: {
      username: '/html/body/div/div[1]/div/div/div/div[5]/form/div[1]/div/input',
      password: '/html/body/div/div[1]/div/div/div/div[5]/form/div[2]/div/input',
      loginButton: '/html/body/div/div[1]/div/div/div/div[5]/form/button/div',
      loginConfirmElement: '//*[@id="root"]/div/div/div[4]/p',
      dashboardElement: '/html/body/div/div[1]/div[2]/div[1]/div[1]/h1',
      quality: '//*[@id="root"]/div/div/div[2]/div/div/div/p',
      epoch: '//*[@id="root"]/div/div/div[4]/div[1]/p',
      uptime: '//*[@id="root"]/div/div/div[4]/div[2]/p'
    }
  },
  bless: {
    login_url: "https://bless.network/dashboard?ref=Y06FN1",
    extension_url: "https://bless.network/dashboard",
    selectors: {
      emailInput: '//*[@id="email"]',
      loginButton: '/html/body/div/main/div/div/div[2]/div[3]/button',
      loginConfirmElement: '/html/body/div/main/div/div[1]/h1',
      dashboardElement: '/html/body/div/main/div/div[1]/h1'
    }
  },
  cntp: {
    login_url: "chrome-extension://ffccpciacnkgkkddhanggjlcajbbmmmn/popup.html",
    extension_url: "chrome-extension://ffccpciacnkgkkddhanggjlcajbbmmmn/popup.html",
    selectors: {
      keyInput: '//*[@id="__plasmo"]/div/div/div[3]/input',
      loginButton: '//*[@id="__plasmo"]/div/div/div[3]/button',
      loginConfirmElement: '//*[@id="__plasmo"]/div/div/div[2]/div[3]/div/p[1]',
      cntpValue: '//*[@id="__plasmo"]/div/div/div[2]/div[3]/div/p[2]'
    }
  },
  veer: {
    login_url: "https://mail.veer.vn",
    selectors: {
      emailInput: '//*[@id="app"]/div/div[1]/div[2]/div/div[2]/div/div[2]/form/div[1]/input',
      passwordInput: '//*[@id="app"]/div/div[1]/div[2]/div/div[2]/div/div[2]/form/div[2]/input',
      loginButton: '//*[@id="app"]/div/div[1]/div[2]/div/div[2]/div/div[2]/form/div[3]/button',
      loginConfirmElement: '//*[@id="mail-box-toggle"]/div[3]',
      inboxElement: '//*[@id="mail-box-toggle"]/div[3]',
      firstMail: '//*[@id="mail-item-0"]/div',
      refreshButton: '//*[@id="mail-box-toggle"]/div[3]/div/div/div[1]/div[1]/div[3]/a',
    }
  },
  bizflycloud: {
    login_url: 'https://id.bizflycloud.vn/login?service=https%3A%2F%2Fmail.bizflycloud.vn%2F&_t=webmail',
    selectors: {
      emailInput: '//*[@id="app"]/div/div/main/div/div/div/div[1]/div/div/div/div/div[1]/form/div[1]/div/div/input',
      passwordInput: '//*[@id="app"]/div/div/main/div/div/div/div/div/div/div/div/div[2]/form/div/div/div/input',
      nextButton: '//*[@id="app"]/div/div/main/div/div/div/div[1]/div/div/div/div/div[1]/form/div[1]/div/button',
      loginButton: '//*[@id="app"]/div/div/main/div/div/div/div/div/div/div/div/div[2]/form/div/div/div/div/button',
      loginConfirmElement: '//*[@id="app"]/div/div/div[3]/div[1]/div[2]/div',
      inboxElement: '//*[@id="app"]/div/div/div[3]/div[1]/div[2]/div',
      firstMail: '//*[@id="threads_list"]/div[1]/div[3]/div[1]',
      refreshButton: '//*[@id="refresh-threads-btn"]',
    }
  }
};

// ─── TIMEOUTS CONFIGURATION ───────────────────────────────────────────────
const timeouts = {
  element: 60000,
  page: 60000,
  action: 10000,
  loginCheck: 10000,
};

// ─── AUTOMATION CONSTANTS ─────────────────────────────────────────────────
const MAX_LOGIN_RETRIES = 2;
const PROFILE_CLEANUP_ON_FAILURE = true;
const CHECK_INTERVAL = 360000; // 6 minutes
const STAGGER_DELAY = 45000; // 30 seconds between account starts
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Safari/537.36";
const FAILED_TASKS_PATH = path.resolve('./output/fail_tasks.json');

// ─── EXTENSIONS CONFIGURATION ─────────────────────────────────────────────
const EXTENSIONS = {
  cntp: { path: path.resolve('./crxs/cntp.crx') },
};

// ─── CHROME OPTIONS SETUP ───────────────────────────────────────────────
const configureChromeOptions = () => {
  const options = new chrome.Options();
  const args = [
    `--user-agent=${USER_AGENT}`,
    // '--disable-web-security',
    // '--ignore-certificate-errors',
    // '--dns-prefetch-disable',
    // '--enable-unsafe-swiftshader',
    // '--no-first-run',
    // '--enable-automation',
    // '--allow-remote-origin',
    '--allow-pre-commit-input',
    'start-maximized',
    'disable-infobars',
    '--disable-application-cache',
    // WebRTC-related flags
    // '--disable-webrtc',
    // '--disable-features=WebRtcHideLocalIpsWithMdns',
    // '--force-webrtc-ip-handling-policy=public_interface_only',
    // Reduce logging verbosity
    '--log-level=3',
    // '--vmodule=*/webrtc/*=0,*/libjingle/*=0',
    // Run headless
    '--headless'
  ];

  if (os.platform() === 'linux') {
    args.push('--headless', '--no-sandbox', '--disable-gpu');
    options.setChromeBinaryPath('/usr/bin/chromium-browser');
  }

  options.addArguments(args);
  return options;
};

// ─── LOG4JS CONFIGURATION ─────────────────────────────────────────────────
log4js.configure({
    appenders: {
      file: { type: 'file', filename: 'automation.log' },
      console: { type: 'console' }
    },
    categories: {
      default: { appenders: ['console', 'file'], level: 'info' }
    }
  });
  

const logger = log4js.getLogger();

module.exports = {
  services,
  timeouts,
  MAX_LOGIN_RETRIES,
  PROFILE_CLEANUP_ON_FAILURE,
  CHECK_INTERVAL,
  STAGGER_DELAY,
  USER_AGENT,
  FAILED_TASKS_PATH,
  EXTENSIONS,
  configureChromeOptions,
  logger
};
