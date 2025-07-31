/**
 * Local Teams Bot Testing Script
 * Test the Teams bot functionality locally
 */

import TeamsHandler from './src/teams/teams-handler.mjs';
import logger from './src/logger.mjs';

// Load environment variables
process.env.MICROSOFT_APP_ID = '6bc05713-323c-4607-8cad-7f844f5ddb36';
process.env.MICROSOFT_APP_PASSWORD = 'test-app-password';
process.env.MICROSOFT_APP_TENANT_ID = '4244a633-91ef-4fdc-8442-61da68c36dc8';
process.env.LOCAL = 'true';
process.env.NODE_ENV = 'development';

// Mock Teams activity
const mockActivity = {
  type: 'message',
  text: 'Hello @swa, what can you do?',
  from: {
    id: 'test-user-123',
    name: 'Test User',
    aadObjectId: 'test-aad-123'
  },
  conversation: {
    id: 'test-conversation-456',
    conversationType: 'personal',
    tenantId: 'test-tenant-789'
  },
  recipient: {
    id: 'test-bot-id',
    name: 'SWA Bot'
  },
  serviceUrl: 'https://smba.trafficmanager.net/teams/',
  timestamp: new Date().toISOString(),
  id: 'test-activity-id'
};

async function testTeamsBot() {
  try {
    console.log('🧪 Testing Teams Bot locally...');
    
    const handler = new TeamsHandler();
    const result = await handler.handleActivity(mockActivity);
    
    console.log('✅ Test completed:', result);
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run test
testTeamsBot();