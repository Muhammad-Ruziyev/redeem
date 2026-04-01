// Custom error for Session expiration
export class SessionExpiredError extends Error {
  constructor(message: string = 'Midasbuy session expired') {
    super(message);
    this.name = 'SessionExpiredError';
  }
}

// Custom error for Risk Control / Ban
export class RiskControlError extends Error {
  constructor(message: string = 'Account is blocked by Risk Control') {
    super(message);
    this.name = 'RiskControlError';
  }
}
