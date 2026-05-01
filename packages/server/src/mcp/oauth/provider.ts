/**
 * @fileoverview OAuthClientProvider implementation for MCP remote servers.
 *
 * Each remote MCP server gets its own provider instance bound to persistent storage.
 * When SDK requires a browser redirect, the authorization URL is saved to a field
 * instead of opening the browser directly — the pool layer handles browser launching.
 */

import type {
  OAuthClientInformationMixed,
  OAuthClientMetadata,
  OAuthTokens,
} from '@modelcontextprotocol/sdk/shared/auth.js';
import type { OAuthClientProvider } from '@modelcontextprotocol/sdk/client/auth.js';
import * as storage from './storage.js';
import { Logger } from '../../util/logger.js';
import { APP_NAME } from '../../util/app.js';

export class McpOAuthProvider implements OAuthClientProvider {
  private serverName: string;
  private filePath: string;

  /**
   * Set by setRedirectUrl() after the callback server starts.
   * The port is unknown until the server binds to a random port.
   */
  private _redirectUrl: string | undefined;

  /**
   * Saved by redirectToAuthorization().
   * The pool layer reads this via getAuthorizationUrl() to open the browser.
   */
  private _authorizationUrl: string | undefined;

  constructor(serverName: string, filePath: string) {
    this.serverName = serverName;
    this.filePath = filePath;
    this._redirectUrl = 'http://localhost:0/callback';
  }

  get redirectUrl(): string | undefined {
    return this._redirectUrl;
  }

  get clientMetadata(): OAuthClientMetadata {
    return {
      redirect_uris: this._redirectUrl ? [this._redirectUrl] : [],
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code', 'refresh_token'],
      client_name: `${APP_NAME}-mcp-${this.serverName}`,
    };
  }

  clientInformation(): OAuthClientInformationMixed | undefined {
    return storage.loadClientInfo(this.filePath, this.serverName);
  }

  saveClientInformation(clientInformation: OAuthClientInformationMixed): void {
    storage.saveClientInfo(this.filePath, this.serverName, clientInformation);
  }

  tokens(): OAuthTokens | undefined {
    return storage.loadTokens(this.filePath, this.serverName);
  }

  saveTokens(tokens: OAuthTokens): void {
    storage.saveTokens(this.filePath, this.serverName, tokens);
  }

  codeVerifier(): string {
    return storage.loadCodeVerifier(this.filePath, this.serverName) ?? '';
  }

  saveCodeVerifier(codeVerifier: string): void {
    storage.saveCodeVerifier(this.filePath, this.serverName, codeVerifier);
  }

  /**
   * Called by SDK when user needs to visit the authorization page.
   * Instead of opening the browser here, we save the URL for the pool
   * layer to pick up and handle browser launching.
   */
  redirectToAuthorization(authorizationUrl: URL): void {
    this._authorizationUrl = authorizationUrl.toString();
    Logger.log(
      'MCP-OAuth',
      `Redirecting to authorization: ${this._authorizationUrl}`
    );
  }

  invalidateCredentials(
    scope: 'all' | 'client' | 'tokens' | 'verifier' | 'discovery'
  ): void {
    if (scope === 'all') {
      storage.clearOAuthData(this.filePath, this.serverName);
      return;
    }
    // Partial scope clearing will be implemented in Stage 6.
    // For now, fall through to full clear.
    storage.clearOAuthData(this.filePath, this.serverName);
  }

  getAuthorizationUrl(): string | undefined {
    return this._authorizationUrl;
  }

  setRedirectUrl(url: string): void {
    this._redirectUrl = url;
  }
}
