// proxy_handler/worker.js
const { parentPort } = require("worker_threads");
const request = require("request");
const log4js = require("log4js");

// Configure log4js
log4js.configure({
  appenders: {
    file: { type: "file", filename: "worker.log" },
    console: { type: "console" }
  },
  categories: {
    default: { appenders: ["console", "file"], level: "info" }
  }
});

const logger = log4js.getLogger();

/**
 * The new single service we test is "cntp".
 * Replace the URL below with the actual endpoint you want to test.
 */
const CNTP_URL = "https://www.google.com";

const headers = {
  'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'accept-encoding': 'gzip, deflate, br, zstd',
  'accept-language': 'en-US,en;q=0.6',
  'cache-control': 'max-age=0',
  'priority': 'u=0, i',
  'sec-ch-ua': '"Not A(Brand";v="8", "Chromium";v="132", "Brave";v="132"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"Windows"',
  'sec-fetch-dest': 'document',
  'sec-fetch-mode': 'navigate',
  'sec-fetch-site': 'same-origin',
  'sec-fetch-user': '?1',
  'sec-gpc': '1',
  'upgrade-insecure-requests': '1',
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36'
};

/**
 * Test a single proxy for the "cntp" service.
 * If the request to CNTP_URL is successful (HTTP 200), we push "cntp" to `success`.
 * Otherwise, "cntp" goes into `fail`.
 */
async function testProxy(proxyUrl) {
  const result = {
    proxy: proxyUrl,
    success: [],
    fail: []
  };

  const options = {
    url: CNTP_URL,
    proxy: `http://${proxyUrl}`,
    timeout: 10000, // 10 seconds
    headers
  };

  try {
    await new Promise((resolve, reject) => {
      request(options, (error, response) => {
        if (error || response.statusCode !== 200) {
          return reject(new Error(`Failed to access ${CNTP_URL}`));
        }
        resolve(response);
      });
    });
    // If successful
    result.success.push("cntp");
    logger.info(`Proxy ${proxyUrl} successfully pinged CNTP service`);
  } catch (err) {
    result.fail.push("cntp");
    logger.error(`Proxy ${proxyUrl} failed to ping CNTP service: ${err.message}`);
  }

  return result;
}

// Listen for messages from the parent thread
parentPort.on("message", async (data) => {
  logger.info("Worker started processing proxies...");
  const results = await Promise.all(
    data.proxies.map(proxy => testProxy(proxy))
  );
  logger.info("Worker completed proxy processing.");
  parentPort.postMessage(results);
});
