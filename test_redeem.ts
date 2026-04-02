import { chromium } from 'playwright-extra';
import stealth from 'puppeteer-extra-plugin-stealth';
import { db } from './src/infrastructure/database/client.js';
import { EncryptionService } from './src/domain/encryption.js';
import { config } from './src/config/env.js';

chromium.use(stealth());

async function test() {
  const encryptionService = new EncryptionService(config.ENCRYPTION_KEY);
  const account = await db.selectFrom('accounts').selectAll().where('status', '=', 'active').executeTakeFirst();
  
  if (!account) {
    console.log('No active account found');
    process.exit(1);
  }

  const cookiesStr = encryptionService.decrypt(account.session_cookies);
  console.log('Got cookies');

  const browser = await chromium.launch({ headless: false }); // watch it
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
  });

  const cookieObjects = cookiesStr.split('; ').map(c => {
    const [name, ...rest] = c.split('=');
    return {
      name: name.trim(),
      value: rest.join('=').trim(),
      domain: '.midasbuy.com',
      path: '/'
    };
  }).filter(c => c.name);

  await context.addCookies(cookieObjects);

  const page = await context.newPage();
  console.log('Navigating to redeem page...');
  await page.goto('https://www.midasbuy.com/midasbuy/mu/redeem/pubgm', { waitUntil: 'domcontentloaded' });
  
  console.log('Waiting 5s for CF check...');
  await page.waitForTimeout(5000);

  console.log('Executing fetch in page...');
  const res = await page.evaluate(async () => {
    const response = await fetch('https://www.midasbuy.com/midasbuy/mu/redeem/pubgm/QueryRedeemCodeInfo', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/plain, */*'
      },
      body: JSON.stringify({
        appid: '51895189719',
        code: 'FRESH_CODE_TEST',
        channel: 'mu',
        from: '',
        country: 'mu',
        currency: 'USD',
        payChannel: ''
      })
    });
    return response.json();
  });

  console.log('Response:', res);
  await browser.close();
  process.exit(0);
}

test().catch(console.error);