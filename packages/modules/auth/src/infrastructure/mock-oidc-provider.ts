import type { OidcProviderPort, OidcUserInfo } from "../ports/oidc-provider.js";

export class MockOidcProvider implements OidcProviderPort {
  readonly #stagedUsers = new Map<string, OidcUserInfo>();
  #defaultUser: OidcUserInfo = {
    sub: "mock-sub-default",
    email: "mock.user@example.com",
    email_verified: true,
    name: "Mock User",
  };

  stageUser(user: OidcUserInfo): void {
    this.#defaultUser = user;
    if (user.email) {
      this.#stagedUsers.set(user.email, user);
    }
    this.#stagedUsers.set(user.sub, user);
  }

  async getAuthorizationUrl(params: {
    readonly state: string;
    readonly codeChallenge: string;
    readonly redirectUri: string;
  }): Promise<string> {
    const query = new URLSearchParams({
      response_type: "code",
      client_id: "plinth-mock-client-id",
      redirect_uri: params.redirectUri,
      state: params.state,
      code_challenge: params.codeChallenge,
      code_challenge_method: "S256",
    });
    return `https://mock-oidc.plinth.local/auth?${query.toString()}`;
  }

  async exchangeCode(_params: {
    readonly code: string;
    readonly codeVerifier: string;
    readonly redirectUri: string;
  }): Promise<OidcUserInfo> {
    return this.#defaultUser;
  }
}
