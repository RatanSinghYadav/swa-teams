import { ParticipantRole } from "@swatechnology/swa-multi-agent-orchestrator";
import db from "../utils/db.mjs";
import files from "../utils/agent-files.mjs";
import { v4 as uuidv4 } from "uuid";
import logger from "../logger.mjs";
import llm from "../utils/llm-helper.mjs"

export const createAgentToolDescription = [
  {
    name: "Master_Agent",
    description:
      "Use this tool to handle all questions and queries related to agents. When a customer wants to create, edit, list, delete a custom agent or get details of an agent or anything to do with an agent, use this tool",
    input_schema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "name of the agent",
        },
        description: {
          type: "string",
          description:
            "detailed description for the agent to be used as prompt",
        },
        type: {
          type: "string",
          description:
            "Type of agent to be created. Possible values are openai, anthropic, grok and perplexity",
        },
        action: {
          type: "string",
          description:
            "what action does user wants to perform. Possible values are create, update , delete , list, details. Auto fill this value from user request.",
        },
      },
      required: ["name",],
    },
  },
];

export const CREATE_AGENT_PROMPT = `
You are the agent to help users with all questions, queries, doubts related to agents and llm agents in general.
You are a assistant to create an agent, edit an agent, list all agents of the user, get details of an agent and delete a custom agent. you will be given the details for the agent if required.
Confirm with the user if they want to proceed with the action.Dont be so elaborate in answers and be crisp and upto the point,giving short answers.

- Never guess or make up information.
- Repeat the tool use for subsequent requests if necessary.
- For create request, ask the user for agent name, description and type. Description is mandatory for this.
- For update request, ask the user for agent name, description and type. Description is mandatory for this.
- For delete you only need to ask for the agent name.
- For getting details of an agent, just ask for agent name and if user is not sure remind about list agents option.
- For listing agents, no need to confirm with the user. Just proceed to the tool and give the list to user, only the list. nothing else.
- If list of agents are given, format it better and return the same.
- For any request type which you cannot understand, offer users with list of available options: create, update ,delete , list and view agents.
- Remind users that Correct Agent is invoked automatically based on user request. No need for users to specify which agent to use.  
- For type there are three possible values: openai, anthropic, grok and perplexity. Prompt the user to enter those values.
- Even with spelling mistakes or even if users use abbrevations, figure out the right type value.
- Auto fill the action value based on user intent. Possible values are create, update or delete. 
- If the tool errors, apologize, explain the order failed reason, and suggest other options.
- Never claim to search online, access external data, or use tools besides Create_Agent.
- Complete the entire process until you have all required data before sending the complete response.
`;

const AGENT_SUMMARY_PROMPT = `Your task is to generate a very good summary to be used as agent description for an llm agent,  from the given description. 
Summary generated should be good enough to be used for agent selection by a llm.
.The summary of many such agents will be passed onto a llm, and asked it to figure out the best agent to be used based on the user query. So summary generated 
should be clear and precise, valid and having all relevant info so that llm can make the best guess on which agent is to be selected.
Return only the generated summary text and nothing else. Keep in mind that the text generated will be put in a dynamodb table field.
Important: Summary generated should force a llm to choose this agent when the user question is related to this. 
`;

export async function createAgentHandler(response, conversation, additionalParams) {
  logger.info("createAgentHandler input", { response, additionalParams });
  const responseContentBlocks = response.content;
  let toolResults = [];
  if (!responseContentBlocks) {
    throw new Error("No content blocks in response");
  }

  for (const contentBlock of response.content) {
    if (contentBlock.type === "tool_use") {
      const toolUseBlock = contentBlock;

      if (toolUseBlock.name === "Master_Agent") {
        let agentRes = await handleAgentRequest(toolUseBlock.input, additionalParams);
        toolResults.push({
          "type": "tool_result",
          "tool_use_id": toolUseBlock.id,
          "content": agentRes,
        });
      }
    }
  }

  const message = { role: ParticipantRole.USER, content: toolResults };
  logger.info("Tool use response:", message);
  return message;
}

const handleAgentRequest = async (input, additionalParams) => {
  let r1 = false, r2 = false;
  let instanceConfig = additionalParams.instanceConfig;
  if (input.action.toLowerCase() === "create") {
    if (!input.description || input.description.trim().length < 1) {
      logger.error("Agent Description is either too long or missing. Please try again", input);
      return "Agent Description is either too long or missing. Please try again."
    }
    let summary = await llm.callAnthropic({
      prompt: AGENT_SUMMARY_PROMPT,
      message: input.description,
      MAX_TOKENS: 20000,
      purpose: `Generate agent summary from description`
    })
    if (!summary || summary.trim().length < 1) {
      logger.error("Agent summary was not generated from description: ", input);
      return "Agent creation failed as not all required fields could be populated. Please check again."
    }
    input.summary = summary;
    const fileId = uuidv4();
    r1 = await db.createAgent(input, fileId, additionalParams.userId, instanceConfig)
    r2 = await files.saveDescription(input, fileId, additionalParams.userId, instanceConfig);

    if (r1 && r2) {
      logger.info("Agent created: ", input);
      return "Success. The agent has been created"
    } else {
      logger.error("Exception Agent creation failed", input);
      return "An error occurred";
    }
  } else if (input.action.toLowerCase() === "update") {
    let agent = await db.getAgent(input, additionalParams.userId, instanceConfig);
    if (agent) {
      if (!input.description || input.description.trim().length < 1) {
        logger.error("Exception: Agent Description is either too long or missing. Please try again", input);
        return "Agent Description is either too long or missing. Please try again."
      }
      let summary = await llm.callAnthropic({
        prompt: AGENT_SUMMARY_PROMPT,
        message: input.description,
        MAX_TOKENS: 20000,
        purpose: `Generate agent summary from description`
      })
      if (!summary || summary.trim().length < 1) {
        logger.error("Agent summary was not generated from description: ", input);
        return "Agent creation failed as not all required fields could be populated. Please check again."
      }
      input.summary = summary;
      r1 = await db.createAgent(input, agent.fileId, additionalParams.userId, instanceConfig)//upsert
      r2 = await files.saveDescription(input, agent.fileId, additionalParams.userId, instanceConfig);
      if (r1 && r2) {
        logger.info("Agent Updated: ", input);
        return "Success. The agent has been updated"
      } else {
        logger.error("Exception: Agent updation failed", input);
        return "An error occurred";
      }
    } else {
      logger.error("Exception: Agent updation failed as agent not found to update", input);
      return "Unable to update agent"
    }

  } else if (input.action.toLowerCase() === "delete") {
    let agent = await db.getAgent(input, additionalParams.userId, instanceConfig);
    if (agent) {
      r1 = await db.deleteAgent(input, additionalParams.userId, instanceConfig)
      r2 = await files.removeDescription(agent.fileId, additionalParams.userId, instanceConfig)
      if (r1 && r2) {
        logger.info("Agent Deleted: ", input);
        return "Success. The agent has been deleted"
      } else {
        logger.error("Exception: Agent deletion failed", input);
        return "An error occurred";
      }
    } else {
      logger.error("Exception: Agent deletion failed as agent not found to delete", input);
      return "Unable to delete agent"
    }
  } else if (input.action.toLowerCase() === "list") {
    let agents = await getAllAgents(additionalParams, instanceConfig);
    let agentList = "";
    for(let type in agents){
      let alist = agents[type];
      agentList = agentList+`\n\n These are your ${type} agents: \n `
      for(let a of alist){
        agentList = agentList + ` - An agent named ${a.agentName} and you are:  ${a.summary}. \n`;
      }
    }
    logger.info(`These are your agents [${agents.length}] : ${agentList} `);
    return agentList;
  } else if (input.action.toLowerCase() === "details") {
    let agent = await db.getAgent(input, additionalParams.userId, instanceConfig);
    if (agent) {
      //no need for description. Use summary instead
      // let description = await files.getDescription(agent, additionalParams.userId, instanceConfig);
      let agentDetails = `Agent Name: ${agent.name} and type: ${agent.type}. \n Summary: ${agent.summary}`;
      logger.info("Agent Details found: ", input, agent);
      return agentDetails;
    } else {
      logger.error("Exception: Agent not found", input);
      return "Agent was not found. Can you please check the agent details again?"
    }

  } else {
    logger.error("Option not configured ", input);
    return "I am sorry. I am not sure how to handle this. May be I will learn this in my future."
  }
};


async function getAllAgents(additionalParams, instanceConfig) {
  let agents = {};
  agents["user"] = await db.getAllAgents(additionalParams.userId, instanceConfig);
  agents["channel"] = await db.getAllAgents(additionalParams.channelId, instanceConfig);
  agents["admin"] = await db.getAllAgents("ADMIN", instanceConfig);
  agents["default"] = await db.getAllAgents("DEFAULT", instanceConfig);
  agents["swa"] = await db.getAllAgents("SWA", instanceConfig);
  return agents;
}