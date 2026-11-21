export interface OidcUserInfo {
  readonly sub: string;
  readonly email?: string | undefined;
  readonly email_verified?: boolean | undefined;
  readonly name?: string | undefined;
}

export interface OidcProviderPort {
  getAuthorizationUrl(params: {
    readonly state: string;
    readonly codeChallenge: string;
    readonly redirectUri: string;
  }): Promise<string>;

  exchangeCode(params: {
    readonly code: string;
    readonly codeVerifier: string;
    readonly redirectUri: string;
  }): Promise<OidcUserInfo>;
}
