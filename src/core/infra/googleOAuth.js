/**
 * Google OAuth (Gmail / userinfo). Full implementation.
 * Replaces legacy project-root services/googleOAuth.js.
 */

const logger = require('../logger');
const { google } = require('googleapis');
const fs = require('fs').promises;
const path = require('path');

class GoogleOAuthService {
  constructor() {
    this.oAuth2Client = null;
    this.initializeOAuthClient();
  }

  async initializeOAuthClient() {
    const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
    const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
    const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/auth/google/callback';

    this.oAuth2Client = new google.auth.OAuth2(
      CLIENT_ID,
      CLIENT_SECRET,
      REDIRECT_URI
    );

    await this.loadSavedTokens();
  }

  async loadSavedTokens() {
    try {
      const tokenPath = path.join(__dirname, '..', '..', '..', 'tokens.json');
      const tokens = JSON.parse(await fs.readFile(tokenPath, 'utf8'));

      if (tokens.access_token) {
        this.oAuth2Client.setCredentials(tokens);
        logger.info('Google OAuth tokens loaded successfully');
      }
    } catch (error) {
      logger.info('No saved tokens found. Need to authenticate.');
    }
  }

  async saveTokens(tokens) {
    try {
      const tokenPath = path.join(__dirname, '..', '..', '..', 'tokens.json');
      await fs.writeFile(tokenPath, JSON.stringify(tokens));
      logger.info('Tokens saved successfully');
    } catch (error) {
      logger.error('Error saving tokens:', error);
    }
  }

  getAuthUrl() {
    const SCOPES = [
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/userinfo.email'
    ];

    return this.oAuth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
      prompt: 'consent'
    });
  }

  async getTokens(code) {
    try {
      const { tokens } = await this.oAuth2Client.getToken(code);
      this.oAuth2Client.setCredentials(tokens);
      await this.saveTokens(tokens);
      return tokens;
    } catch (error) {
      logger.error('Error getting tokens:', error);
      throw error;
    }
  }

  async refreshAccessToken() {
    try {
      const { credentials } = await this.oAuth2Client.refreshAccessToken();
      this.oAuth2Client.setCredentials(credentials);
      await this.saveTokens(credentials);
      return credentials;
    } catch (error) {
      logger.error('Error refreshing token:', error);
      throw error;
    }
  }

  async isTokenValid() {
    if (!this.oAuth2Client || !this.oAuth2Client.credentials) {
      return false;
    }

    if (!this.oAuth2Client.credentials.refresh_token) {
      return false;
    }

    const expiryDate = this.oAuth2Client.credentials.expiry_date;
    if (!expiryDate) {
      return false;
    }

    const currentTime = Date.now();
    const bufferTime = 5 * 60 * 1000;

    return currentTime < (expiryDate - bufferTime);
  }

  hasRefreshToken() {
    return (
      this.oAuth2Client &&
      this.oAuth2Client.credentials &&
      !!this.oAuth2Client.credentials.refresh_token
    );
  }

  async getValidToken() {
    if (!this.oAuth2Client || !this.oAuth2Client.credentials) {
      throw new Error('OAuth client not initialized or no credentials available');
    }

    if (!this.hasRefreshToken()) {
      if (this.oAuth2Client.credentials.access_token) {
        return this.oAuth2Client.credentials.access_token;
      }
      throw new Error('No refresh token available. Please authenticate first.');
    }

    if (!(await this.isTokenValid())) {
      logger.info('Token expired or invalid, refreshing...');
      await this.refreshAccessToken();
    }
    return this.oAuth2Client.credentials.access_token;
  }
}

module.exports = new GoogleOAuthService();
