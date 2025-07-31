import { AnthropicAgent, OpenAIAgent, PerplexityAgent, GrokAgent } from "@swatechnology/swa-multi-agent-orchestrator";
const Agents = {};
import db from "../utils/db.mjs";
import { AgentManager } from "./agent-agent.mjs";
import { JiraAgent } from "./jira-agent/jira-agent.mjs";
import { QuickBooksAgent } from "./qb-agent/qb-agent.mjs";
import { MicrosoftAgent } from "./microsoft-agent/microsoft-agent.mjs"
import { LiveAgent } from "./live-agent/live-agent.mjs"
import logger from "../logger.mjs";


Agents.AgentManager = AgentManager;

Agents.loadAgents = async (request) => {
  let instanceConfig = request.instanceConfig;

  if (!instanceConfig || Object.keys(instanceConfig).length === 0) {
    return [];
  }

  // Load all agent types in parallel
  const [adminAgents, channelAgents, userAgents] = await Promise.all([
    db.getAllAgents("ADMIN", instanceConfig),
    db.getAllAgents(request.channelId, instanceConfig),
    db.getAllAgents(request.userId, instanceConfig)
  ]);

  logger.info(`Loaded ${adminAgents.length} admin agents, ${channelAgents.length} channel agents, ${userAgents.length} user agents`);

  let agents = [...adminAgents, ...channelAgents, ...userAgents];

  logger.info(`No of agents loaded: ${agents.length}`);
  return agents;
}

Agents.loadSWAAgents = async (instanceConfig) => {
  return await db.getAllAgents("SWA", instanceConfig);
}

Agents.getDefaultAgent = async (request, instanceConfig) => {
  let ob = {};
  ob.name = "swa";
  let agentConfig = await db.getAgent(ob, "DEFAULT", instanceConfig);
  if (!agentConfig.agentName) {
    logger.error("Default agent missing");
  }
  return Agents.createAgent(agentConfig, instanceConfig);
}

Agents.createSwaAgent = (agentConfig, instanceConfig) => {
  logger.info("Creating swa agent ", agentConfig);
  const options = {};
  options.name = agentConfig.agentName;
  options.logRequest = true;
  addAgentKeys(options, agentConfig.type);
  options.description = agentConfig.summary;
  options.s3details = `${instanceConfig.S3Bucket}##${agentConfig.fileId}`
  if (agentConfig.type === "bedrock") {
    options.region = "us-east-1";
  }
  if (agentConfig.agentName === "jira-agent") {
    return new JiraAgent(options);
  } else if (agentConfig.agentName === "quickbooks-agent") {
    return new QuickBooksAgent(options);
  } else if (agentConfig.agentName === "microsoft-agent") {
    return new MicrosoftAgent(options);
  } else if (agentConfig.agentName == "live-search-agent") {
    return new LiveAgent(options);
  }
}

let addAgentKeys = (options, type) => {
  let modelKey = type.toUpperCase() + "_MODEL";
  let apiKey = type.toUpperCase() + "_KEY"
  let apiKeys = apiKey + "S";
  options.modelId = process.env[modelKey];
  options.apiKey = process.env[apiKeys]?.split(";")[Math.floor(Math.random() * process.env.TOKEN_COUNT)] || process.env[apiKey];
}

Agents.createAgent = (agentConfig, instanceConfig) => {
  logger.info("Creating agent", agentConfig);
  let agent = {};
  if (agentConfig.type?.toLowerCase() === "openai") {
    agent = new OpenAIAgent({
      name: agentConfig.agentName,
      description: agentConfig.summary,
      apiKey: process.env["OPENAI_KEYS"]?.split(";")[Math.floor(Math.random() * process.env.TOKEN_COUNT)] || process.env["OPENAI_KEY"],
      s3details: `${instanceConfig.S3Bucket}##${agentConfig.fileId}`
    });
  } else if (agentConfig.type?.toLowerCase() === "perplexity") {
    agent = new PerplexityAgent({
      name: agentConfig.agentName,
      description: agentConfig.summary,
      apiKey: process.env["PERPLEXITY_KEYS"]?.split(";")[Math.floor(Math.random() * process.env.TOKEN_COUNT)] || process.env["PERPLEXITY_KEY"],
    })
  } else if (agentConfig.type?.toLowerCase() === "anthropic") {
    agent = new AnthropicAgent({
      name: agentConfig.agentName,
      description: agentConfig.summary,
      apiKey: process.env["ANTHROPIC_KEY"],
      modelId: process.env["ANTHROPIC_MODEL"]
    });
  } else if (agentConfig.type?.toLowerCase() === "grok") {
    agent = new GrokAgent({
      name: agentConfig.agentName,
      description: agentConfig.summary,
      apiKey: process.env["GROK_KEYS"]?.split(";")[Math.floor(Math.random() * process.env.TOKEN_COUNT)] || process.env["GROK_KEY"],
      modelId: process.env["GROK_MODEL"]
    });
  } else {
    console.error("Agent type not supported", agentConfig.type);
    return null;
  }
  if (agentConfig.fileId) {
    agent["s3details"] = `${instanceConfig.S3Bucket}##${agentConfig.fileId}`;
  }
  return agent;
};

export default Agents;
