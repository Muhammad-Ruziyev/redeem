import CircuitBreaker from 'opossum';
import { logger } from '../logger';
import { config } from '../../config/env';
import { SessionExpiredError, RiskControlError } from '../../domain/errors/midas.errors';
import { chromium } from 'playwright-extra';
import stealth from 'puppeteer-extra-plugin-stealth';

// @ts-ignore
chromium.use(stealth());

export interface RedeemResponse {
  success: boolean;
  status: 'success' | 'error';
  reason?: string;
  raw_response?: any;
}

export class MidasHttpClient {
  private readonly breaker: CircuitBreaker;

  constructor() {
    // R-05: Circuit Breaker implementation
    const options = {
      timeout: 30000, // R-02: Timeout for external calls
      errorThresholdPercentage: 50, // Open circuit if 50% of requests fail
      resetTimeout: 30000, // Try to close circuit after 30 seconds
    };

    this.breaker = new CircuitBreaker(this.executeRedeemRequest.bind(this), options);

    this.breaker.fallback(() => {
      // Fallback triggered when the circuit is open or requests fail
      throw new Error('Circuit Breaker is open: Midasbuy API is currently unavailable');
    });

    this.breaker.on('open', () => logger.warn('Circuit Breaker OPEN: Midasbuy API is failing.'));
    this.breaker.on('halfOpen', () => logger.info('Circuit Breaker HALF-OPEN: Testing Midasbuy API...'));
    this.breaker.on('close', () => logger.info('Circuit Breaker CLOSED: Midasbuy API recovered.'));
  }

  /**
   * The actual logic to send the HTTP request to Midasbuy.
   * This is wrapped by the Circuit Breaker.
   */
  private async executeRedeemRequest(
    playerId: string,
    ucCode: string,
    cookies: string,
    proxyUrl?: string | null
  ): Promise<RedeemResponse> {
    try {
      let proxyOptions: any = undefined;
      if (proxyUrl) {
        proxyOptions = { server: proxyUrl };
        try {
          const url = new URL(proxyUrl);
          if (url.username || url.password) {
            proxyOptions = {
              server: `${url.protocol}//${url.host}`,
              username: url.username,
              password: url.password,
            };
          }
        } catch (e) {
          logger.warn('Failed to parse proxy URL for playwright', { proxyUrl });
        }
      }

      const browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });

      try {
        const contextOptions: any = {
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        };
        if (proxyOptions) contextOptions.proxy = proxyOptions;

        const context = await browser.newContext(contextOptions);

        // Parse and add cookies
        const cookieObjects = cookies.split('; ').map(c => {
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
        
        // Go to the redeem page first to pass Cloudflare and get clearance
        await page.goto('https://www.midasbuy.com/midasbuy/mu/redeem/pubgm', { waitUntil: 'domcontentloaded', timeout: 30000 });
        
        // Give it a moment to solve any JS challenge
        await page.waitForTimeout(3000);

        // Execute the redeem API call from within the browser context
        const data = await page.evaluate(async ({ playerId, ucCode }) => {
          const response = await fetch('https://www.midasbuy.com/midasbuy/mu/redeem/pubgm/QueryRedeemCodeInfo', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json, text/plain, */*'
            },
            body: JSON.stringify({
              appid: playerId,
              code: ucCode,
              channel: 'mu',
              from: '',
              country: 'mu',
              currency: 'USD',
              payChannel: ''
            })
          });
          return response.json();
        }, { playerId, ucCode });

        await browser.close();

        if (data.ret === 0 || data.msg === 'success' || data.msg?.toLowerCase().includes('success')) {
          return {
            success: true,
            status: 'success',
            reason: data.msg || 'Success',
            raw_response: data,
          };
        }

        // Check for specific Midasbuy error codes
        if (data.msg === 'login error' || data.ret === 10001 || data.msg?.includes('session')) {
          throw new SessionExpiredError('Session expired or invalid cookies');
        }

        if (data.msg?.toLowerCase().includes('risk') || data.ret === 10002) {
          throw new RiskControlError(`Midasbuy risk control triggered: ${data.msg}`);
        }

        if (data.ret === 10005) {
           return {
            success: false,
            status: 'error',
            reason: 'Invalid or already used UC code',
            raw_response: data,
          };
        }

        return {
          success: false,
          status: 'error',
          reason: data.msg || 'Failed to redeem code',
          raw_response: data,
        };

      } catch (innerError) {
        await browser.close().catch(() => {});
        throw innerError;
      }

    } catch (error: any) {
      logger.error({ err: error.message }, 'HTTP Request to Midasbuy failed');
      throw error;
    }
  }

  /**
   * Public method to call the redeem endpoint safely through the Circuit Breaker
   */
  public async redeem(
    playerId: string,
    ucCode: string,
    cookies: string,
    proxyUrl?: string | null
  ): Promise<RedeemResponse> {
    try {
      return await this.breaker.fire(playerId, ucCode, cookies, proxyUrl) as Promise<RedeemResponse>;
    } catch (e: any) {
      if (e.message?.includes('Circuit Breaker is open')) {
        throw new Error('Circuit Breaker is open: Midasbuy API is currently unavailable');
      }
      throw e;
    }
  }
}
