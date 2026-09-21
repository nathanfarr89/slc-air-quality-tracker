export class ApiError extends Error {
  readonly status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export class ProviderDisabledError extends Error {
  constructor(message = 'PurpleAir adapter is disabled: set VITE_PURPLEAIR_API_KEY.') {
    super(message);
    this.name = 'ProviderDisabledError';
  }
}
