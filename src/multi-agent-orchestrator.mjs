import {
  MultiAgentOrchestrator,
  InMemoryChatStorage,
  OpenAIClassifier,
} from "@swatechnology/swa-multi-agent-orchestrator";

const openaiClassifier = new OpenAIClassifier({
  apiKey: process.env["OPENAI_KEYS"]?.split(";")[Math.floor(Math.random() * process.env.TOKEN_COUNT)] || process.env["OPENAI_KEY"],
  logRequest: true
})
import Slack from "./utils/slack-utils.mjs";
import secMgr from "./utils/sec-mgr.mjs";
import dynamoStorage from "./utils/dynamo-storage.mjs";
import personality from "./utils/swa-personality.mjs";
import Agents from "./agents/index.mjs";
import logger from "./logger.mjs";
import { v4 as uuidv4 } from "uuid";
import service from "./services.mjs";
import db from "./utils/db.mjs"
import token from "./utils/token-utils.mjs"

const INSUFFICIENT_TOKEN = `You have insufficient tokens in your account. Please recharge using this link: <https://swa-ai.com/pricing/|Recharge>`;
const DISCLAIMER = `This response is AI-generated and may contain inaccuracies. Please verify critical information.`;
const ACCESS_REMINDER = `Reminder: @swa only has access to messages that you have @ mentioned it within a channel.`;

async function configureAgents(orchestrator, request, instanceConfig) {
  logger.info("Configuring agents");

  let agentNameList = [];

  let defaultAgent = await Agents.getDefaultAgent(request, instanceConfig);
  logger.info("Loaded default agent", defaultAgent);
  orchestrator.addAgent(defaultAgent);
  orchestrator.setDefaultAgent(defaultAgent);
  agentNameList.push("swa");

  // Add AgentManager which is an agent used for managing agents
  orchestrator.addAgent(Agents.AgentManager);
  agentNameList.push("agent manager");

  // Add SWA Agents. The class is in this code itself. jira-agent is an example of SWA agent (botId = SWA).
  const swaAgents = await Agents.loadSWAAgents(instanceConfig);
  logger.info(`Loaded ${swaAgents.length} no of swa agents`);
  for (let agent of swaAgents) {
    orchestrator.addAgent(Agents.createSwaAgent(agent, instanceConfig));
    agentNameList.push(agent.agentName.toLowerCase());
  }

  let agents = await Agents.loadAgents(request);
  logger.info(`Loaded ${agents.length} number of admin, channel, and user agents`);
  for (let agent of agents) {
    if (agentNameList.includes(agent.agentName.toLowerCase())) {
      logger.info(`Skipping agent by name ${agent.agentName} as an agent by name already exists. It is of type ${agent.botId}`);
      continue;
    }
    orchestrator.addAgent(Agents.createAgent(agent, instanceConfig));
  }

}

const MemoryStorage = new InMemoryChatStorage();

function createOrchestrator(instanceConfig) {
  let storage = process.env["LOCAL"] ? MemoryStorage : dynamoStorage.createStorage(instanceConfig["CHAT_HISTORY_TABLE"]);
  return new MultiAgentOrchestrator({
    classifier: openaiClassifier,
    storage: storage,
    logger: logger,
    config: {
      LOG_AGENT_CHAT: true,
      LOG_CLASSIFIER_CHAT: true,
      LOG_CLASSIFIER_RAW_OUTPUT: true,
      LOG_CLASSIFIER_OUTPUT: true,
      LOG_EXECUTION_TIMES: true,
      MAX_RETRIES: 3,
      MAX_MESSAGE_PAIRS_PER_AGENT: 50,
      USE_DEFAULT_AGENT_IF_NONE_IDENTIFIED: true,
      CLASSIFICATION_ERROR_MESSAGE:
        "Oops! We couldn't process your request. Please try again.",
      NO_SELECTED_AGENT_MESSAGE:
        "I'm sorry, I couldn't determine how to handle your request. Could you please rephrase it?",
      GENERAL_ROUTING_ERROR_MSG_MESSAGE:
        "My Apologies. I am still learning and there might be few errors. Can you please try again or reach out to @swahelp for assistance.",
    },
  });
}

export default async function Orchestrator(request, meta) {
  let ret = {
    statusCode: 200,
    body: "Success",
  };

  // Start config fetch
  const configPromise = db.fetchInstanceConfig(`${request.appId}_${request.teamId}`);
  // Secret prefetching to avoid blocking later
  const secretPromise = process.env["LOCAL"]
    ? Promise.resolve({ [request.appId + "_" + request.teamId]: process.env["SLACK_TOKEN"] })
    : secMgr.getSecrets("swa-slack-creds");

  const secrets = await secretPromise;
  Slack.configureClient(secrets[request.appId + "_" + request.teamId]);

  for (const key of Object.keys(secrets).filter(k => k.includes("_KEYS"))) {
    process.env[key] = secrets[key];
  }

  const userProfile = await Slack.getUserInfo(request.userId);
  request.email = userProfile?.email;
  request.userName = userProfile.email?.split("@")[0];
  logger.defaultMeta["email"] = userProfile?.email || "na";

  // Await config and do token validation
  const config = await configPromise;
  if (config.UserAccessRestricted?.includes(request.email)) {
    logger.error(`Access Restricted: ${request.email} does not have access to SWA bot`);
    await Slack.postMessageInThread(
      `Access Denied: You do not have access to SWA bot. Please contact your administrator.`,
      request.channelId,
      request.ts,
      secrets[request.appId + "_" + request.teamId]
    );
    return ret;
  }
  let tokenCount = config["tokenCount"] || 0;
  if (!tokenCount || tokenCount < 100) {
    logger.error(`Insufficient Tokens: ${tokenCount}: `, request);
    await Slack.postMessageInThread(
      INSUFFICIENT_TOKEN + "\n\nAgent Used: `NA`",
      request.channelId,
      request.ts,
      secrets[request.appId + "_" + request.teamId]
    );
    return ret;
  }

  logger.info(`Tokens Left: ${tokenCount}`);
  let instanceConfig = service.convertToJson(config["config"]);
  request.instanceConfig = instanceConfig;

  //create orchestrator
  const orchestrator = createOrchestrator(instanceConfig);

  // Configure agents and continue with other operations in parallel
  const agentsPromise = configureAgents(orchestrator, request, instanceConfig);

  let userKey = request.channelId;
  let sessionKey = request.threadTs || request.eventTs;
  if (request.isDirect) {
    logger.info("DM Message. Resetting session keys to user specific");
    userKey = request.userId;
  }

  // Wait for agent configuration to complete before routing
  await agentsPromise;
  logger.info("Available Agents: ", orchestrator.getAllAgents());

  let response = {};
  try {
    response = await orchestrator.routeRequest(
      request.query,
      userKey,
      sessionKey,
      request,
    );
    if (!response?.modelStats) {
      throw new Error(response);
    }
  } catch (e) {
    logger.error("Exception from Orchestrator", e);
    ret.statusCode = 500;
    ret.body = "Exception";

    // Send error to Slack
    await Slack.postMessageInThread(
      "My Apologies. I am still learning and there might be few errors. Can you please try again or reach out to @swahelp for assistance." +
      "\n\nAgent Used: `NA`",
      request.channelId,
      request.ts,
      secrets[request.appId + "_" + request.teamId]
    );
    return ret;
  }


  logger.info("Swa Bot response: ", response);


  let modelStats = response.modelStats;
  const uid = uuidv4();

  let statsObj = service.formatStat(uid, meta, request, modelStats);
  logger.debug(`Stats formatted: for  ${uid} `, statsObj);

  // Process stats and token data in parallel with message processing
  // Use a setTimeout to make these non-blocking
  setTimeout(() => {
    Promise.all([
      db.insertStat(statsObj, instanceConfig),
      token.pushToSQS(statsObj, instanceConfig)
    ]).catch(err => logger.error("Error processing stats:", err));
  }, 0);

  // Process the response message
  let outputText = response.output;
  outputText = service.cleanOutpuText(outputText);

  // Add citations if available
  if (response.info) {
    try {
      const info = service.convertToJson(response.info);
      const citations = info["citations"];
      if (citations && citations.length > 0) {
        outputText = outputText + `\n These are reference citations: \n ${citations.join("\n")}`;
      }
    } catch (err) {
      logger.error(`Error processing citations: ${err.message}`);
    }
  }

  // Apply personality and post
  const personalMessage = await personality.applyPersonality(outputText, instanceConfig, "slack");
  await postToSlack(request, response.metadata?.agentName || "NA", personalMessage, Slack.Token);

  return ret;
}

async function postToSlack(request, agentName, message, token) {

  try {
    const randomNumber = Math.floor(Math.random() * 7) + 1; // Generates a random number between 1 and 8
    if (randomNumber === 2) {
      await Slack.postMessageInThread(
        message + "\n\nAgent Used: `" + agentName + "` \n`" + DISCLAIMER + "`",
        request.channelId,
        request.ts,
        token
      );
    } else if (randomNumber === 3 && request.ts !== request.threadTs && !request.isDirect) {
      await Slack.postMessageInThread(
        message + "\n\nAgent Used: `" + agentName + "` \n`" + ACCESS_REMINDER + "`",
        request.channelId,
        request.ts,
        token
      );
    } else {
      await Slack.postMessageInThread(
        message + "\n\nAgent Used: `" + agentName + "`",
        request.channelId,
        request.ts,
        token
      );
    }
    logger.info("Message posted to slack");
  } catch (e) {
    logger.error("Slack.postMessageInThread error", e);
    throw e;
  }
}
