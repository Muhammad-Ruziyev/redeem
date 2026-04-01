import CircuitBreaker from 'opossum';
import { HttpsProxyAgent } from 'hpagent';
import { logger } from '../logger';
import { config } from '../../config/env';
import { SessionExpiredError, RiskControlError } from '../../domain/errors/midas.errors';
import { gotScraping } from 'got-scraping';

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
      // Create an HTTPS agent with a custom socket factory to mimic browser TLS
      // got-scraping handles the TLS fingerprinting automatically
      const agent = proxyUrl ? {
        https: new HttpsProxyAgent({
          keepAlive: true,
          proxy: proxyUrl,
        }),
      } : undefined;

      // Common headers that a real browser sends
      const headers = {
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Content-Type': 'application/json',
        'Origin': 'https://www.midasbuy.com',
        'Referer': 'https://www.midasbuy.com/midasbuy/mu/redeem/pubgm',
        'Cookie': cookies,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
      };

      // Midasbuy requires specific headers along with the session cookies
      const response = await gotScraping({
        url: 'https://www.midasbuy.com/midasbuy/mu/redeem/pubgm/QueryRedeemCodeInfo',
        method: 'POST',
        headers,
        // The `agent` option in got-scraping requires a specific structure or can cause type errors if undefined.
        // We only pass it if proxyUrl is set.
        ...(agent ? { agent } : {}),
        json: {
          appid: playerId,
          code: ucCode,
          channel: 'mu',
          from: '',
          country: 'mu',
          currency: 'USD',
          payChannel: '',
        },
        responseType: 'json',
        retry: { limit: 0 }, // We handle retries via BullMQ and Circuit Breaker
        timeout: { request: 30000 },
      });

      // Midasbuy often returns 200 OK with a JSON body even for errors
      let data: any;
      try {
        if (typeof response.body === 'string') {
          // Sometimes it returns HTML when blocked
          if (response.body.includes('<html')) {
             throw new Error('Blocked by Cloudflare/Captcha');
          }
          data = JSON.parse(response.body);
        } else if (Buffer.isBuffer(response.body)) {
          const strBody = response.body.toString('utf8');
          if (strBody.includes('<html')) {
             throw new Error('Blocked by Cloudflare/Captcha');
          }
          data = JSON.parse(strBody);
        } else {
          data = response.body;
        }
      } catch (e: any) {
        logger.error({ bodyType: typeof response.body, msg: e.message }, 'Failed to parse Midasbuy response');
        if (e.message === 'Blocked by Cloudflare/Captcha') {
           throw new RiskControlError('Blocked by Cloudflare/Captcha');
        }
        throw new Error('Failed to parse Midasbuy response as JSON');
      }

      if (data.ret === 0 || data.msg === 'success' || data.msg?.toLowerCase().includes('success')) {
        return {
          success: true,
          status: 'success',
          reason: data.msg || 'Success',
          raw_response: data,
        };
      }

      // Check for specific Midasbuy error codes
      // Usually ret != 0 means error.
      if (data.msg === 'login error' || data.ret === 10001 || data.msg?.includes('session')) {
        throw new SessionExpiredError('Session expired or invalid cookies');
      }

      // Rate limit or risk control
      if (data.msg?.toLowerCase().includes('risk') || data.ret === 10002) {
        throw new RiskControlError(`Midasbuy risk control triggered: ${data.msg}`);
      }

      // 10005 often means invalid code or used code
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
