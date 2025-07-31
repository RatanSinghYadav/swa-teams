/**
 * Teams Authentication Handler
 * Handles JWT validation and Teams-specific security
 */

import { ConnectorClient, MicrosoftAppCredentials } from 'botframework-connector';
import logger from '../logger.mjs';

export class TeamsAuth {
  constructor() {
    this.appId = process.env.MICROSOFT_APP_ID;
    this.appPassword = process.env.MICROSOFT_APP_PASSWORD;
    this.tenantId = process.env.MICROSOFT_APP_TENANT_ID;
    
    if (!this.appId || !this.appPassword) {
      throw new Error('Microsoft App credentials not configured');
    }
    
    this.credentials = new MicrosoftAppCredentials(this.appId, this.appPassword);
  }
  
  /**
   * Validate incoming Teams request
   * @param {Object} req - Express request object
   * @returns {boolean} Is request valid
   */
  async validateRequest(req) {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader) {
        logger.warn('No authorization header found');
        return false;
      }
      
      // Extract JWT token
      const token = authHeader.replace('Bearer ', '');
      if (!token) {
        logger.warn('No JWT token found in authorization header');
        return false;
      }
      
      // Validate JWT token (simplified validation)
      // In production, use proper JWT validation with Microsoft's public keys
      const isValid = await this.validateJWT(token, req.body);
      
      if (isValid) {
        logger.info('Teams request validated successfully');
        return true;
      } else {
        logger.warn('Teams request validation failed');
        return false;
      }
    } catch (error) {
      logger.error('Error validating Teams request:', error);
      return false;
    }
  }
  
  /**
   * Simplified JWT validation
   * @param {string} token - JWT token
   * @param {Object} activity - Teams activity
   * @returns {boolean} Is token valid
   */
  async validateJWT(token, activity) {
    try {
      // For local development, skip validation
      if (process.env.NODE_ENV === 'development' || process.env.LOCAL) {
        logger.info('Skipping JWT validation in development mode');
        return true;
      }
      
      // Basic validation - check if token exists and activity has required fields
      if (!token || !activity || !activity.from || !activity.conversation) {
        return false;
      }
      
      // TODO: Implement proper JWT validation with Microsoft's public keys
      // For now, basic validation
      return token.length > 50; // Basic length check
    } catch (error) {
      logger.error('JWT validation error:', error);
      return false;
    }
  }
  
  /**
   * Create connector client for Teams API calls
   * @param {string} serviceUrl - Teams service URL
   * @returns {ConnectorClient} Connector client
   */
  createConnectorClient(serviceUrl) {
    try {
      return new ConnectorClient(this.credentials, { baseUri: serviceUrl });
    } catch (error) {
      logger.error('Error creating connector client:', error);
      throw error;
    }
  }
  
  /**
   * Get app credentials
   * @returns {MicrosoftAppCredentials} App credentials
   */
  getCredentials() {
    return this.credentials;
  }
}

export default TeamsAuth;