export interface TokenAuthOptions {
  getAccessToken?: () => string | null | undefined | Promise<string | null | undefined>;
  refreshAccessToken?: () => string | null | undefined | Promise<string | null | undefined>;
}

export interface TokenManager {
  enabled: boolean;
  headers(): Promise<Record<string, string>>;
  refresh(): Promise<boolean>;
}

export function createTokenManager(options: TokenAuthOptions): TokenManager {
  let refreshedToken: string | null | undefined;

  return {
    enabled: options.getAccessToken !== undefined,
    async headers() {
      const token =
        refreshedToken !== undefined ? refreshedToken : await options.getAccessToken?.();
      if (token === null || token === undefined || token === '') return {};
      return { Authorization: `Bearer ${token}` };
    },
    async refresh() {
      if (options.refreshAccessToken === undefined) return false;
      try {
        const next = await options.refreshAccessToken();
        if (next === null) return false;
        refreshedToken = next;
        return true;
      } catch {
        return false;
      }
    },
  };
}
