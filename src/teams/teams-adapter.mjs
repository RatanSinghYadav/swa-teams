/**
 * Teams to Slack Payload Adapter
 * Converts Teams Bot Framework activities to Slack-compatible format
 */

import logger from '../logger.mjs';

export class TeamsAdapter {
  /**
   * Convert Teams activity to Slack-compatible request format
   * @param {Object} activity - Teams Bot Framework activity
   * @returns {Object} Slack-compatible request object
   */
  static teamsToSlack(activity) {
    try {
      const request = {
        // Core identification
        appId: process.env.MICROSOFT_APP_ID,
        teamId: activity.conversation?.tenantId || activity.channelData?.tenant?.id || 'default-team',
        userId: activity.from?.id,
        channelId: activity.conversation?.id,
        
        // Message content
        query: this.extractMessage(activity),
        
        // Threading support
        ts: activity.timestamp || Date.now().toString(),
        threadTs: activity.replyToId || activity.timestamp || Date.now().toString(),
        eventTs: activity.timestamp || Date.now().toString(),
        
        // Message type detection
        isDirect: activity.conversation?.conversationType === 'personal',
        
        // Teams-specific data
        teamsData: {
          activityType: activity.type,
          serviceUrl: activity.serviceUrl,
          conversationType: activity.conversation?.conversationType,
          channelData: activity.channelData,
          originalActivity: activity
        }
      };
      
      logger.info('Teams to Slack conversion completed', {
        userId: request.userId,
        channelId: request.channelId,
        isDirect: request.isDirect,
        messageLength: request.query?.length
      });
      
      return request;
    } catch (error) {
      logger.error('Error converting Teams to Slack format:', error);
      throw error;
    }
  }
  
  /**
   * Extract clean message text from Teams activity
   * @param {Object} activity - Teams activity
   * @returns {string} Clean message text
   */
  static extractMessage(activity) {
    if (!activity.text) return '';
    
    let message = activity.text;
    
    // Remove bot mentions (e.g., "<at>SWA Bot</at>")
    message = message.replace(/<at[^>]*>.*?<\/at>/gi, '').trim();
    
    // Remove HTML tags
    message = message.replace(/<[^>]*>/g, '').trim();
    
    // Clean up extra whitespace
    message = message.replace(/\s+/g, ' ').trim();
    
    return message;
  }
  
  /**
   * Convert Slack response to Teams-compatible format
   * @param {string} message - Response message
   * @param {Object} originalActivity - Original Teams activity
   * @returns {Object} Teams-compatible response
   */
  static slackToTeams(message, originalActivity) {
    try {
      // Format message for Teams (supports basic markdown)
      const formattedMessage = this.formatForTeams(message);
      
      const response = {
        type: 'message',
        text: formattedMessage,
        conversation: originalActivity.conversation,
        replyToId: originalActivity.id
      };
      
      logger.info('Slack to Teams conversion completed', {
        messageLength: formattedMessage.length,
        conversationId: originalActivity.conversation?.id
      });
      
      return response;
    } catch (error) {
      logger.error('Error converting Slack to Teams format:', error);
      throw error;
    }
  }
  
  /**
   * Format message for Teams display
   * @param {string} message - Raw message
   * @returns {string} Teams-formatted message
   */
  static formatForTeams(message) {
    if (!message) return '';
    
    // Convert Slack-style formatting to Teams markdown
    let formatted = message
      // Convert code blocks
      .replace(/```([\s\S]*?)```/g, '```\n$1\n```')
      // Convert inline code
      .replace(/`([^`]+)`/g, '`$1`')
      // Convert bold
      .replace(/\*([^*]+)\*/g, '**$1**')
      // Convert links
      .replace(/<([^|>]+)\|([^>]+)>/g, '[$2]($1)')
      .replace(/<([^>]+)>/g, '$1');
    
    return formatted;
  }
  
  /**
   * Validate Teams activity
   * @param {Object} activity - Teams activity
   * @returns {boolean} Is valid activity
   */
  static isValidActivity(activity) {
    return activity && 
           activity.type === 'message' && 
           activity.text && 
           activity.from && 
           activity.conversation;
  }
}

export default TeamsAdapter;