import { chromium } from 'playwright-extra';
import stealth from 'puppeteer-extra-plugin-stealth';
import { logger } from '../../../infrastructure/logger';

// Apply stealth plugin to avoid basic bot detection
chromium.use(stealth());

export class PlaywrightSessionManager {
  /**
   * Opens a hidden browser via proxy, logs into Midasbuy, and extracts session cookies.
   */
  async loginAndGetCookies(email: string, passwordPlain: string, proxyUrl?: string | null): Promise<string> {
    const logCtx = { email };
    logger.info(logCtx, 'Starting headless browser for session refresh...');

    // Parse proxy string (e.g. http://user:pass@ip:port)
    let proxyOptions: any = undefined;
    if (proxyUrl) {
      proxyOptions = { server: proxyUrl };
      try {
        const url = new URL(proxyUrl);
        if (url.username || url.password) {
          proxyOptions = {
            server: `${url.protocol}//${url.host}`,
            // @ts-ignore
            username: url.username,
            // @ts-ignore
            password: url.password,
          };
        }
      } catch (e) {
        logger.warn(logCtx, 'Could not parse proxy credentials, using raw server URL');
      }
    }

    const browser = await chromium.launch({
      headless: true, // Run in background
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const contextOptions: any = {
      viewport: { width: 1280, height: 800 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    };

    if (proxyOptions) {
      contextOptions.proxy = proxyOptions;
    }

    const context = await browser.newContext(contextOptions);

    const page = await context.newPage();

    try {
      // 1. Go directly to the login page to skip the redeem page popups
      await page.goto('https://www.midasbuy.com/midasbuy/mu/login', {
        waitUntil: 'domcontentloaded',
        timeout: 60000,
      });

      await page.waitForTimeout(3000);

      // Clear cookie banners/overlays if they appear
      try {
        const acceptAll = page.getByText('Accept All Optional Cookies', { exact: true }).or(page.getByText('Accept All', { exact: true })).first();
        if (await acceptAll.isVisible()) {
          await acceptAll.click({ force: true });
          await page.waitForTimeout(1000);
        }
      } catch (e) {}

      // 5. Email
      await page.locator('input[type="email"], input[placeholder*="email"]').first().fill(email);
      
      // 6. Password
      await page.locator('input[type="password"], input[placeholder*="password"]').first().fill(passwordPlain);
      
      // Check "Keep me signed in" if exists
      const keepIn = page.locator('input[type="checkbox"], .keep, .check').first();
      if (await keepIn.isVisible()) {
          await keepIn.click({ force: true }).catch(() => {});
      }

      // Submit
      await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button, div'));
        const signInBtn = btns.find(b => b.textContent?.trim() === 'SIGN IN' || b.textContent?.trim() === 'Sign In');
        if (signInBtn) {
          (signInBtn as HTMLElement).click();
        } else {
          document.querySelector<HTMLElement>('.btn-submit')?.click();
        }
      });
      
      // Wait a moment for any potential iframe challenge to appear
      await page.waitForTimeout(2000);
      
      // If there's an iframe challenge (like "slide to complete"), we need to handle it or wait for manual intervention.
      // But since we are headless, let's hope stealth plugin bypassed it.

      // 7. Wait for login to complete (wait for redirect or cookies)
      logger.info(logCtx, 'Waiting for login completion...');
      await page.waitForFunction(() => {
        const url = window.location.href;
        return !url.includes('/login') || document.cookie.includes('midasbuy');
      }, { timeout: 30000 });

      await page.waitForTimeout(3000); // Give it a moment to set all cookies

      // 8. Extract Cookies
      const cookies = await context.cookies();
      
      // Serialize cookies into "key=value; key2=value2" format for HTTP client
      const cookieString = cookies.map((c: any) => `${c.name}=${c.value}`).join('; ');

      if (!cookieString.includes('midasbuy')) {
        throw new Error('Login succeeded but cookies do not contain expected Midasbuy tokens');
      }

      logger.info(logCtx, 'Successfully extracted fresh session cookies');
      return cookieString;

    } catch (error: any) {
      try {
        await page.screenshot({ path: '/app/error.png', fullPage: true });
        logger.error({ ...logCtx, err: error.message }, 'Playwright login failed. Screenshot saved to /app/error.png');
      } catch (e) {
        logger.error({ ...logCtx, err: error.message }, 'Playwright login failed. Could not save screenshot.');
      }
      throw new Error(`Failed to login via Playwright: ${error.message}`);
    } finally {
      await browser.close();
    }
  }
}
