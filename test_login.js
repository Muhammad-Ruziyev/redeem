const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth');
chromium.use(stealth());

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('https://www.midasbuy.com/midasbuy/mu/login', { waitUntil: 'networkidle' });
  await page.screenshot({ path: 'login_direct.png', fullPage: true });
  await browser.close();
})();
