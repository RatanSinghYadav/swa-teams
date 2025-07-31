import {
  BedrockRuntimeClient,
  ConverseCommand,
} from "@aws-sdk/client-bedrock-runtime";
import { Agent, isConversationMessage, ParticipantRole } from "@swatechnology/swa-multi-agent-orchestrator";
import logger from "../../logger.mjs";
import { jiraTools, jiraAgentHandler } from "./jira-tools.mjs"
import { fetchDescription } from "../../utils/s3Utils.mjs"


/**
 * BedrockAgent class represents an agent that uses Amazon Bedrock for natural language processing.
 * It extends the base Agent class and implements the processRequest method using Bedrock's API.
 */
export class JiraAgent extends Agent {

  /**
   * Constructs a new BedrockAgent instance.
   * @param options - Configuration options for the agent, inherited from AgentOptions.
   */
  constructor(options) {
    super(options);

    this.client = options.client
      ? options.client
      : options.region
        ? new BedrockRuntimeClient({ region: options.region })
        : new BedrockRuntimeClient();

    // Initialize the modelId
    this.modelId = options.modelId;

    this.streaming = options.streaming ?? false;

    this.inferenceConfig = options.inferenceConfig ?? {};

    this.guardrailConfig = options.guardrailConfig ?? null;

    this.retriever = options.retriever ?? null;

    this.toolConfig = options.toolConfig ?? null;

    this.logRequest = options.logRequest ?? false;

    //this is a reference. Actual template is fetched from s3.
    this.promptTemplate = `You are named as ${this.name}. ${this.description}. 

    You will handle all jira ticket creation, update, retrival, transition, adding comments. If the request is for any action that you are not familiar with 
    apologize and guide users to use the jira portal or website. Mention that you are still learning to do things.

    You will never add the <thinking></thinking> part in response text. Never.

    For creating a jira, you should automatically add a good and relevant jira summary based on the description provided. 

    You can use the provided set of tools for completing your task. 

    If jira schema has allowed values, then use only those values to fill up the schema for creating jira. If user gives a different value,
    make a best guess to find a value from the list of allowed values. 
    
    Refer a valid jira schema for create issue. Fill up the values based on that. Jira schema can have different fields of type other than 
    array, string. For those refer your knowledge base on jira schema types and fill up the values accordingly.

    You can use the tools as many times as required to complete the required task.
    You can ask users for clarification and more data to complete the task.

    If create jira fails, dont retry. If any of the tools for jira provided fails, dont retry.

    After fetching jira, summarize the data for users, and add only the most relevant fields, ignoring empty ones.

    While creating JQL query, limit fields to important fields and fetch only max 10 jiras. Make sure you dont add spaces to JQL query. Double confirm the JQL is accurate without spaces. Use right conditional text in JQL.
    
    For description while creating jira the schema to be followed is this:
     {"content": [{"content": [{"text": "<Add your description of comment here>","type": "text"}],"type": "paragraph"}],"type": "doc","version": 1}

    You should figure out the jira domain from response.

    Always return the jira numbers with a link to be opened in browser. Link must be able to be browsed on url and MUST follow https://<domain>/browse/<issue> pattern. Never ever return the API URL with the text '/rest/api/3/issue/' without specifically being asked for it. 

    You will engage in an open-ended conversation, providing helpful and accurate information based on your expertise.

    Throughout the conversation, you should aim to:
    - Understand the context and intent behind each new question or prompt.
    - Use tools you have to gather required inputs and perform actions.
    - Provide substantive and well-reasoned responses that directly address the query.
    - Draw insights and connections from your extensive knowledge when appropriate.
    - Ask for clarification if any part of the question or prompt is ambiguous.
    - Maintain a consistent, respectful, and engaging tone tailored to the human's communication style.
    - Seamlessly transition between topics as the human introduces new subjects.`;
  }


  /**
   * Formats the tool results into a conversation message format.
   * This method converts an array of tool results into a format expected by the system.
   *
   * @param toolResults - An array of ToolResult objects that need to be formatted.
   * @returns A ConversationMessage object containing the formatted tool results.
   */
  formatToolResults(toolResults) {
    if (isConversationMessage(toolResults)) {
      return toolResults;
    }

    return {
      role: ParticipantRole.USER,
      content: toolResults.map((item) => ({
        toolResult: {
          toolUseId: item.toolUseId,
          content: [{ text: item.content }],
        },
      })),
    };
  }

  /**
   * Abstract method to process a request.
   * This method must be implemented by all concrete agent classes.
   *
   * @param inputText - The user input as a string.
   * @param chatHistory - An array of Message objects representing the conversation history.
   * @param additionalParams - Optional additional parameters as key-value pairs.
   * @returns A Promise that resolves to a Message object containing the agent's response.
   */
  async processRequest(
    inputText,
    userId,
    sessionId,
    chatHistory,
    additionalParams
  ) {
    try {
      // Construct the user's message based on the provided inputText
      const userMessage = {
        role: ParticipantRole.USER,
        content: [{ text: `${inputText}` }],
      };

      // Combine the existing chat history with the user's message
      const conversation = [...chatHistory, userMessage];

      //fetch detailed description from s3
      const [S3Bucket, fileId] = this.s3details.split("##");
      this.promptTemplate = await fetchDescription(S3Bucket, fileId);

      this.enhanceSystemPrompt(additionalParams);
      this.updateSystemPrompt();

      let systemPrompt = this.systemPrompt;

      const modelStats = [];

      // Update the system prompt with the latest history, agent descriptions, and custom variables
      if (this.retriever) {
        // retrieve from Vector store
        const response =
          await this.retriever.retrieveAndCombineResults(inputText);
        const contextPrompt =
          "\nHere is the context to use to answer the user's question:\n" +
          response;
        systemPrompt = systemPrompt + contextPrompt;
      }

      // Prepare the command to converse with the Bedrock API
      const converseCmd = {
        modelId: this.modelId,
        messages: conversation,
        system: [{ text: systemPrompt }],
        toolConfig: {
          tools: jiraTools,
        },
      };

      let continueWithTools = false;
      let finalMessage = {
        role: ParticipantRole.USER,
        content: [],
      };
      let maxRecursions =
        this.toolConfig?.toolMaxRecursions || 10;

      do {
        // send the conversation to Amazon Bedrock
        if (this.logRequest) {
          logger.info("\n\n---- Jira Bedrock Agent ----");
          logger.info(JSON.stringify(converseCmd));
        }
        const bedrockResponse = await this.handleSingleResponse(converseCmd);

        if (this.logRequest) {
          logger.info(JSON.stringify(bedrockResponse));
        }

        const obj = {};
        obj["id"] = bedrockResponse["$metadata"]["requestId"];
        obj["model"] = converseCmd.modelId;
        obj["usage"] = bedrockResponse.usage;
        obj["from"] = "jira-agent-bedrock";
        modelStats.push(obj);
        logger.info(`jira bedrock Agent Usage: `, obj);


        let bedRockMessage = bedrockResponse?.output?.message;
        // process model response
        if (
          bedRockMessage?.content?.some((c) => "toolUse" in c)
        ) {

          conversation.push({
            role: ParticipantRole.ASSISTANT,
            content: bedRockMessage.content
          });
          const toolResponse = await jiraAgentHandler(
            bedRockMessage,
            conversation,
            additionalParams
          );
          const formattedResponse = this.formatToolResults(toolResponse);
          continueWithTools = true;
          converseCmd.messages.push(formattedResponse);
        } else {
          continueWithTools = false;
          finalMessage = bedRockMessage.content[0].text;
        }
        maxRecursions--;

      } while (continueWithTools && maxRecursions > 0);
      return {
        role: ParticipantRole.ASSISTANT,
        content: [{ text: finalMessage }],
        modelStats: modelStats
      };
    } catch (error) {
      logger.error("Error processing  Bedrock jira agent:", error.message);
      throw `Error processing request Bedrock jira agent: ${error.message}`;
    }
  }

  async handleSingleResponse(input) {
    try {
      const command = new ConverseCommand(input);

      const response = await this.client.send(command);
      if (!response.output) {
        throw new Error("No output received from Bedrock model");
      }
      return response;
    } catch (error) {
      logger.error("Error invoking Bedrock model:", error.message);
      console.log(error);
      throw `Error invoking Bedrock model: ${error.message}`;
    }
  }

  setSystemPrompt(template, variables) {
    if (template) {
      this.promptTemplate = template;
    }

    if (variables) {
      this.customVariables = variables;
    }

    this.updateSystemPrompt();
  }

  updateSystemPrompt() {
    const allVariables = {
      ...this.customVariables,
    };

    this.systemPrompt = this.replaceplaceholders(
      this.promptTemplate,
      allVariables
    );

  }

  enhanceSystemPrompt(additionalParams) {
    this.promptTemplate =
      this.promptTemplate +
      `\n. Current user is: ${additionalParams.email}. If no other email or user id is provided, use this. If user asks for my jira or my issues etc, use this email id.`;
  }

  replaceplaceholders(
    template,
    variables
  ) {
    return template.replace(/{{(\w+)}}/g, (match, key) => {
      if (key in variables) {
        const value = variables[key];
        if (Array.isArray(value)) {
          return value.join("\n");
        }
        return value;
      }
      return match; // If no replacement found, leave the placeholder as is
    });
  }
}
