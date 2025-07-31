import { AnthropicAgent } from "@swatechnology/swa-multi-agent-orchestrator";
import {
  CREATE_AGENT_PROMPT,
  createAgentToolDescription,
  createAgentHandler,
} from "../tools/createAgent.mjs";

export const AgentManager = new AnthropicAgent({
  name: "Agent Manager",
  description: `You are the agent to help users with anything related to agents. Specialized agent for helping users create an agent, update an agent, list an agent, get details of an agent or delete an agent. 
 Use the provided tools for getting additional information. Handle all questions for agents with this. Dont be too elaborate in answers and be crisp and to the point, giving short answers. Always confirm your action with the user before proceeding.`,
  streaming: false,
  inferenceConfig: {
    temperature: 0.1,
  },
  toolConfig: {
    useToolHandler: createAgentHandler,
    tool: createAgentToolDescription,
    toolMaxRecursions: 5,
  },
  apiKey: process.env["ANTHROPIC_KEYS"]?.split(";")[Math.floor(Math.random() * process.env.TOKEN_COUNT)] || process.env["ANTHROPIC_KEY"],
  modelId: process.env["ANTHROPIC_MODEL"],
});

AgentManager.setSystemPrompt(CREATE_AGENT_PROMPT);

export default AgentManager;
