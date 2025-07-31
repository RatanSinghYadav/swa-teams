/**
 * Teams Message Handler
 * Main handler for processing Teams messages and routing to SWA orchestrator
 */

import TeamsAdapter from './teams-adapter.mjs';
import TeamsAuth from './teams-auth.mjs';
import TeamsUtils from './teams-utils.mjs';
import Orchestrator from '../multi-agent-orchestrator.mjs';
import logger from '../logger.mjs';

export class TeamsHandler {
  constructor() {
    this.auth = new TeamsAuth();
  }
  
  /**
   * Process incoming Teams activity
   * @param {Object} activity - Teams Bot Framework activity
   * @param {Object} context - Bot context (optional)
   * @returns {Object} Response object
   */
  async handleActivity(activity, context = null) {
    try {
      logger.info('Processing Teams activity', {
        type: activity.type,
        conversationId: activity.conversation?.id,
        userId: activity.from?.id,
        isDirect: TeamsUtils.isDirectMessage(activity)
      });
      
      // Validate activity
      if (!TeamsAdapter.isValidActivity(activity)) {
        logger.warn('Invalid Teams activity received', { activityType: activity.type });
        return this.createErrorResponse('Invalid message format');
      }
      
      // Check if bot is mentioned or it's a direct message
      const isDirect = TeamsUtils.isDirectMessage(activity);
      const isMentioned = TeamsUtils.isBotMentioned(activity);
      
      if (!isDirect && !isMentioned) {
        logger.info('Bot not mentioned in group chat, ignoring message');
        return { statusCode: 200, body: 'Message ignored - bot not mentioned' };
      }
      
      // Convert Teams activity to Slack-compatible format
      const slackRequest = TeamsAdapter.teamsToSlack(activity);
      
      // Add Teams-specific metadata
      slackRequest.platform = 'teams';
      slackRequest.originalActivity = activity;
      
      logger.info('Converted to Slack format', {
        userId: slackRequest.userId,
        teamId: slackRequest.teamId,
        query: slackRequest.query?.substring(0, 100) + '...'
      });
      
      // Create connector client for response
      const connectorClient = this.auth.createConnectorClient(activity.serviceUrl);
      
      // Send typing indicator
      await TeamsUtils.sendTypingIndicator(connectorClient, activity);
      
      // Process through SWA orchestrator
      const orchestratorResponse = await this.processWithOrchestrator(slackRequest);
      
      // Send response back to Teams
      if (orchestratorResponse.statusCode === 200) {
        await this.sendSuccessResponse(connectorClient, activity, orchestratorResponse.message);
      } else {
        await this.sendErrorResponse(connectorClient, activity, orchestratorResponse.error);
      }
      
      return {
        statusCode: 200,
        body: 'Message processed successfully'
      };
      
    } catch (error) {
      logger.error('Error handling Teams activity:', error);
      
      // Try to send error message to user
      try {
        const connectorClient = this.auth.createConnectorClient(activity.serviceUrl);
        await this.sendErrorResponse(connectorClient, activity, error.message);
      } catch (sendError) {
        logger.error('Failed to send error message to Teams:', sendError);
      }
      
      return {
        statusCode: 500,
        body: 'Internal server error'
      };
    }
  }
  
  /**
   * Process request through SWA orchestrator
   * @param {Object} slackRequest - Slack-compatible request
   * @returns {Object} Orchestrator response
   */
  async processWithOrchestrator(slackRequest) {
    try {
      // Set environment for Teams processing
      process.env.PLATFORM = 'teams';
      
      // Call the existing SWA orchestrator
      const result = await Orchestrator(slackRequest, {
        awsRequestId: `teams-${Date.now()}`,
        platform: 'teams'
      });
      
      if (result.statusCode === 200) {
        return {
          statusCode: 200,
          message: result.body || 'Request processed successfully'
        };
      } else {
        return {
          statusCode: result.statusCode,
          error: result.body || 'Processing failed'
        };
      }
    } catch (error) {
      logger.error('Orchestrator processing error:', error);
      return {
        statusCode: 500,
        error: 'Failed to process your request. Please try again.'
      };
    }
  }
  
  /**
   * Send success response to Teams
   * @param {Object} connectorClient - Teams connector client
   * @param {Object} activity - Original activity
   * @param {string} message - Response message
   */
  async sendSuccessResponse(connectorClient, activity, message) {
    try {
      // Convert response to Teams format
      const teamsResponse = TeamsAdapter.slackToTeams(message, activity);
      
      // Send message
      await TeamsUtils.sendMessage(connectorClient, activity, teamsResponse.text);
      
      logger.info('Success response sent to Teams');
    } catch (error) {
      logger.error('Error sending success response:', error);
      throw error;
    }
  }
  
  /**
   * Send error response to Teams
   * @param {Object} connectorClient - Teams connector client
   * @param {Object} activity - Original activity
   * @param {string} errorMessage - Error message
   */
  async sendErrorResponse(connectorClient, activity, errorMessage) {
    try {
      const formattedError = TeamsUtils.formatErrorMessage(new Error(errorMessage));
      await TeamsUtils.sendMessage(connectorClient, activity, formattedError);
      
      logger.info('Error response sent to Teams');
    } catch (error) {
      logger.error('Error sending error response:', error);
      throw error;
    }
  }
  
  /**
   * Create error response object
   * @param {string} message - Error message
   * @returns {Object} Error response
   */
  createErrorResponse(message) {
    return {
      statusCode: 400,
      body: message
    };
  }
}

export default TeamsHandler;