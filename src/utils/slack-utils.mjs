const Slack = {};
import { WebClient } from "@slack/web-api";
import logger from "../logger.mjs";
let client = null;
Slack.Token = "";

Slack.configureClient = (token) => {
  client = new WebClient(token);
  Slack.Token = token;
};

Slack.postMessage = async (message, channel, token) => {
  if (!client) {
    client = new WebClient(token || Slack.Token);
  }
  let option = {
    channel: channel,
    text: message,
    token: token || Slack.Token,
    unfurl_links: false,
    unfurl_media: false
  }
  const result = await client.chat.postMessage(option);
  logger.info("Post Message To Slack: ", option, result);
};

// Track pending Slack requests to avoid duplicate messages
const pendingRequests = new Map();

Slack.postMessageInThread = async (message, channel, thread_ts, token) => {
  if (!client) {
    client = new WebClient(token || Slack.Token);
  }

  // Create a unique key for this message
  const requestKey = `${channel}-${thread_ts}-${Date.now()}`;

  // Check if we're already sending a similar message to avoid duplication
  if (pendingRequests.has(`${channel}-${thread_ts}`)) {
    logger.debug(`Skipping duplicate message to channel ${channel}, thread ${thread_ts}`);
    return;
  }

  // Mark this request as pending
  pendingRequests.set(`${channel}-${thread_ts}`, requestKey);

  const option = {
    channel: channel,
    text: message,
    thread_ts: thread_ts,
    token: token || Slack.Token,
    unfurl_links: false,
    unfurl_media: false
  };

  try {
    const result = await client.chat.postMessage(option);

    // Minimal logging in production
    if (process.env.NODE_ENV === 'production') {
      logger.debug(`Message posted to channel ${channel}`);
    } else {
      logger.info(`Message posted to channel ${channel}, ts: ${result.ts}`);
    }
  } catch (e) {
    logger.error(`Error posting to Slack: ${e.message}`);
    throw e;
  } finally {
    // Remove from pending after a short delay
    setTimeout(() => {
      pendingRequests.delete(`${channel}-${thread_ts}`);
    }, 5000);
  }
};

Slack.getUserInfo = async (user, token) => {
  if (!client) {
    client = new WebClient(token || Slack.Token);
  }
  let option = {
    user: user,
    token: token || Slack.Token
  }
  const result = await client.users.info(option)
  return result?.user?.profile || {};
}

Slack.publishView = async (view, user_id, token) => {
  if (!client) {
    client = new WebClient(token || Slack.Token);
  }
  let option = {
    view: view,
    user_id: user_id,
  }
  const result = await client.views.publish(option);
  logger.info("Publish View to Slack: ", option, result);
  return result;
}

export default Slack;
