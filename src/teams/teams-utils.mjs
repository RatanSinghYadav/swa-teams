/**
 * Teams Utility Functions
 * Helper functions for Teams-specific operations
 */

import logger from '../logger.mjs';

export class TeamsUtils {
  /**
   * Send message to Teams conversation
   * @param {Object} connectorClient - Teams connector client
   * @param {Object} activity - Original activity
   * @param {string} message - Message to send
   */
  static async sendMessage(connectorClient, activity, message) {
    try {
      const response = {
        type: 'message',
        text: message,
        conversation: activity.conversation,
        replyToId: activity.id
      };
      
      const result = await connectorClient.conversations.replyToActivity(
        activity.conversation.id,
        activity.id,
        response
      );
      
      logger.info('Message sent to Teams successfully', {
        conversationId: activity.conversation.id,
        activityId: result.id
      });
      
      return result;
    } catch (error) {
      logger.error('Error sending message to Teams:', error);
      throw error;
    }
  }
  
  /**
   * Extract user information from Teams activity
   * @param {Object} activity - Teams activity
   * @returns {Object} User information
   */
  static extractUserInfo(activity) {
    return {
      id: activity.from?.id,
      name: activity.from?.name,
      email: activity.from?.aadObjectId ? `${activity.from.aadObjectId}@teams.local` : null,
      tenantId: activity.conversation?.tenantId || activity.channelData?.tenant?.id
    };
  }
  
  /**
   * Check if message is a direct message
   * @param {Object} activity - Teams activity
   * @returns {boolean} Is direct message
   */
  static isDirectMessage(activity) {
    return activity.conversation?.conversationType === 'personal';
  }
  
  /**
   * Check if bot is mentioned in the message
   * @param {Object} activity - Teams activity
   * @returns {boolean} Is bot mentioned
   */
  static isBotMentioned(activity) {
    if (!activity.entities) return false;
    
    return activity.entities.some(entity => 
      entity.type === 'mention' && 
      entity.mentioned?.id === activity.recipient?.id
    );
  }
  
  /**
   * Format error message for Teams
   * @param {Error} error - Error object
   * @returns {string} Formatted error message
   */
  static formatErrorMessage(error) {
    const errorMessage = `🚨 **Error**: ${error.message || 'An unexpected error occurred'}\n\n` +
                        `Please try again or contact support if the issue persists.`;
    
    return errorMessage;
  }
  
  /**
   * Create typing indicator
   * @param {Object} connectorClient - Teams connector client
   * @param {Object} activity - Original activity
   */
  static async sendTypingIndicator(connectorClient, activity) {
    try {
      const typingActivity = {
        type: 'typing',
        conversation: activity.conversation
      };
      
      await connectorClient.conversations.replyToActivity(
        activity.conversation.id,
        activity.id,
        typingActivity
      );
      
      logger.debug('Typing indicator sent');
    } catch (error) {
      logger.warn('Failed to send typing indicator:', error.message);
    }
  }
}

export default TeamsUtils;