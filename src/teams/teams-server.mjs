/**
 * Teams Local Development Server
 * Express server for local Teams bot development and testing
 */

import express from 'express';
import TeamsHandler from './teams-handler.mjs';
import TeamsAuth from './teams-auth.mjs';
import logger from '../logger.mjs';

const app = express();
const port = process.env.PORT || 3978;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Initialize Teams handler and auth
const teamsHandler = new TeamsHandler();
const teamsAuth = new TeamsAuth();

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    service: 'swa-teams-bot',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.status(200).json({
    message: 'SWA Teams Bot is running',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      webhook: '/api/messages'
    }
  });
});

// Teams webhook endpoint
app.post('/api/messages', async (req, res) => {
  try {
    logger.info('Received Teams webhook request', {
      headers: {
        authorization: req.headers.authorization ? 'Bearer [REDACTED]' : 'None',
        contentType: req.headers['content-type']
      },
      bodyType: typeof req.body,
      activityType: req.body?.type
    });
    
    // Validate request authentication
    const isValidRequest = await teamsAuth.validateRequest(req);
    if (!isValidRequest) {
      logger.warn('Invalid Teams request - authentication failed');
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    // Extract activity from request body
    const activity = req.body;
    
    // Handle different activity types
    if (activity.type === 'message') {
      // Process message through Teams handler
      const result = await teamsHandler.handleActivity(activity);
      
      logger.info('Message processed', {
        statusCode: result.statusCode,
        conversationId: activity.conversation?.id
      });
      
      res.status(result.statusCode).json({ status: result.body });
    } else if (activity.type === 'conversationUpdate') {
      // Handle bot added/removed events
      await handleConversationUpdate(activity);
      res.status(200).json({ status: 'Conversation update handled' });
    } else {
      // Handle other activity types
      logger.info(`Received ${activity.type} activity - no action needed`);
      res.status(200).json({ status: 'Activity acknowledged' });
    }
    
  } catch (error) {
    logger.error('Error processing Teams webhook:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
    });
  }
});

/**
 * Handle conversation update events (bot added/removed)
 * @param {Object} activity - Teams activity
 */
async function handleConversationUpdate(activity) {
  try {
    if (activity.membersAdded) {
      for (const member of activity.membersAdded) {
        if (member.id === activity.recipient?.id) {
          // Bot was added to conversation
          logger.info('Bot added to conversation', {
            conversationId: activity.conversation?.id,
            conversationType: activity.conversation?.conversationType
          });
          
          // Send welcome message
          await sendWelcomeMessage(activity);
        }
      }
    }
  } catch (error) {
    logger.error('Error handling conversation update:', error);
  }
}

/**
 * Send welcome message when bot is added
 * @param {Object} activity - Teams activity
 */
async function sendWelcomeMessage(activity) {
  try {
    const welcomeMessage = {
      type: 'message',
      text: `👋 **Welcome to SWA Bot!**\n\n` +
            `I'm here to help you with various tasks using AI agents. ` +
            `You can mention me (@swa) in any message or chat with me directly.\n\n` +
            `**Try saying:** "Hello" or "What can you do?"`
    };
    
    const connectorClient = teamsAuth.createConnectorClient(activity.serviceUrl);
    await connectorClient.conversations.sendToConversation(
      activity.conversation.id,
      welcomeMessage
    );
    
    logger.info('Welcome message sent');
  } catch (error) {
    logger.error('Error sending welcome message:', error);
  }
}

// Error handling middleware
app.use((error, req, res, next) => {
  logger.error('Express error:', error);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
  });
});

// Start server
app.listen(port, () => {
  logger.info(`🚀 SWA Teams Bot server running on port ${port}`);
  logger.info(`📱 Webhook URL: http://localhost:${port}/api/messages`);
  logger.info(`🏥 Health check: http://localhost:${port}/health`);
  
  // Log environment info
  logger.info('Environment configuration:', {
    nodeEnv: process.env.NODE_ENV || 'development',
    appId: process.env.MICROSOFT_APP_ID ? '[CONFIGURED]' : '[MISSING]',
    appPassword: process.env.MICROSOFT_APP_PASSWORD ? '[CONFIGURED]' : '[MISSING]',
    tenantId: process.env.MICROSOFT_APP_TENANT_ID ? '[CONFIGURED]' : '[MISSING]'
  });
});

export default app;