import {
  Agent,
  ParticipantRole,
} from "@swatechnology/swa-multi-agent-orchestrator";
import { Anthropic } from "@anthropic-ai/sdk";
import logger from "../../logger.mjs"
// import { AgentToolResult, AgentTools } from "@swatechnology/swa-multi-agent-orchestrator";
import { isConversationMessage } from "@swatechnology/swa-multi-agent-orchestrator";
import {jiraTools, jiraAgentHandler} from "./jira-tools.mjs"


export class JiraAgent extends Agent {

  constructor(options) {
    super(options);

    if (!options.apiKey && !options.client) {
      throw new Error("Jira Agent: Anthropic API key or Anthropic client is required");
    }
    if (!options.modelId) {
      throw new Error("Jira Agent: ModelId is required");
    }
    if (options.client) {
      this.client = options.client;
    } else {
      if (!options.apiKey) throw new Error("Jira Agent: Anthropic API key is required");
      this.client = new Anthropic({ apiKey: options.apiKey });
    }

    this.name = options.name;
    this.systemPrompt = "";
    this.customVariables = {};

    this.streaming = options.streaming ?? false;
    this.logRequest = options.logRequest ?? false;

    this.modelId = options.modelId;

    const defaultMaxTokens = 4096; // You can adjust this default value as needed
    this.inferenceConfig = {
      maxTokens: options.inferenceConfig?.maxTokens ?? defaultMaxTokens,
      temperature: options.inferenceConfig?.temperature ?? 0.1,
      topP: options.inferenceConfig?.topP ?? 0.9,
      stopSequences: options.inferenceConfig?.stopSequences ?? [],
    };

    this.retriever = options.retriever;

    this.toolConfig = options.toolConfig;

    this.promptTemplate = `You are named as ${this.name}. ${this.description}. 

    You will handle all jira ticket creation, update, retrival , adding comments. If the request is for any action that you are not familiar with 
    apologize and guide users to use the jira protal itself. Mention that you are still learning to do things.

    For creating a jira, you should automatically add a good and relevant jira summary based on the description provided. 

    You can use the provided set of tools for completing your task. 

    if jira schema has allowed values, then use only those values to fill up the schema for creating jira. If user gives a different value,
    make a best guess to find a value from the list of allowed values. 
    
    Refer a valid jira schema for create issue. Fill up the values based on that. Jira schema can have different fields of type other than 
    array, string. For those refer your knowledge base on jira schema types and fill up the values accordingly.

    You canuse the tools as many times as required to complete the required task.
    You can ask users for clarification and more data to complete the task.

    If create jira fails, dont retry. If any of the tools for jira provided fails, dont retry.

    After fetching jira, summarize the data for users, and add only the most relevant fields, ignoring empty ones.
    
    For description while creating jira the schema to be followed is this:
     {"content": [{"content": [{"text": "<Add your description of comment here>","type": "text"}],"type": "paragraph"}],"type": "doc","version": 1}

    Format the jira numbers with a hyperlink to the jira. You should figure out the jira domain from response.

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
   * Transforms the tools into a format compatible with Anthropic's Claude format.
   * This method maps each tool to an object containing its name, description, and input schema.
   *
   * @param tools - The Tools object containing an array of tools to be formatted.
   * @returns An array of tools in Claude's expected format.
   */
    formatTools(tools){
      return tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        input_schema: {
          type: "object",
          properties: tool.properties,
          required: tool.required,
        },
      }));
  }

  /**
   * Formats tool results into Anthropic's expected format
   * @param toolResults - Results from tool execution
   * @returns Formatted message in Anthropic's format
   */
  formatToolResults(toolResults) {
    if (isConversationMessage(toolResults)) {
      return toolResults;
    }

    const result = {
      role: ParticipantRole.USER,
      content: toolResults.map((item) => ({
        type: "tool_result",
        tool_use_id: item.toolUseId,
        content: [{ type: "text", text: item.content }],
      })),
    };
    return result;
  }

  /**
   * Extracts the tool name from the tool use block.
   * This method retrieves the `name` field from the provided tool use block.
   *
   * @param toolUseBlock - The block containing tool use details, including a `name` field.
   * @returns The name of the tool from the provided block.
   */
  getToolName(toolUseBlock) {
    return toolUseBlock.name;
  }

  /**
   * Extracts the tool ID from the tool use block.
   * This method retrieves the `toolUseId` field from the provided tool use block.
   *
   * @param toolUseBlock - The block containing tool use details, including a `toolUseId` field.
   * @returns The tool ID from the provided block.
   */
  getToolId(toolUseBlock) {
    // For Anthropic, the ID is under id, not toolUseId
    return toolUseBlock.id;
  }

  /**
   * Extracts the input data from the tool use block.
   * This method retrieves the `input` field from the provided tool use block.
   *
   * @param toolUseBlock - The block containing tool use details, including an `input` field.
   * @returns The input data associated with the tool use block.
   */
  getInputData(toolUseBlock) {
    return toolUseBlock.input;
  }

  /**
   * Retrieves the tool use block from the provided block.
   * This method checks if the block contains a `toolUse` field and returns it.
   *
   * @param block - The block from which the tool use block needs to be extracted.
   * @returns The tool use block if present, otherwise null.
   */
  getToolUseBlock(block) {
    const result = block.type === "tool_use" ? block : null;
    return result;
  }

  async processRequest(
    inputText,
    userId,
    sessionId,
    chatHistory,
    _additionalParams,
  ) {
    // Format messages to Anthropic's format
    const messages= chatHistory.map((message) => ({
      role:
        message.role === ParticipantRole.USER
          ? ParticipantRole.USER
          : ParticipantRole.ASSISTANT,
      content: message?.content?.[0]?.["text"] ?? "", // Fallback to empty string if content is undefined
    }));
    messages.push({ role: ParticipantRole.USER, content: inputText });

    this.enhanceSystemPrompt(_additionalParams);
    // this.updateSystemPrompt();
    const modelStats = [];

    let systemPrompt = this.systemPrompt;

    // Update the system prompt with the latest history, agent descriptions, and custom variables
    if (this.retriever) {
      // retrieve from Vector store and combined results as a string into the prompt
      const response =
        await this.retriever.retrieveAndCombineResults(inputText);
      const contextPrompt =
        "\nHere is the context to use to answer the user's question:\n" +
        response;
      systemPrompt = systemPrompt + contextPrompt;
    }

    try {
        let finalMessage = "";
        let toolUse = false;
        let recursions = 10;
        do {
          // Call Anthropic
          const llmInput = {
            model: this.modelId,
            max_tokens: this.inferenceConfig.maxTokens,
            messages: messages,
            system: systemPrompt,
            temperature: this.inferenceConfig.temperature,
            top_p: this.inferenceConfig.topP,
            tools: jiraTools,
          };

          if(this.logRequest){
            logger.info("\n\n---- Jira Anthropic Agent ----");
            logger.info(JSON.stringify(llmInput));
          }

          const response = await this.handleSingleResponse(llmInput);

          if(this.logRequest){
            logger.info(JSON.stringify(response));
          }

          const obj = {};
          obj["id"] = response.id;
          obj["model"] = response.model;
          obj["usage"] = response.usage;
          obj["from"] = "jira-agent-anthropic";
          modelStats.push(obj);
          logger.info(`jira Anthropic Agent Usage: `, obj);
          

          const toolUseBlocks = response.content.filter(
            (content) => content.type === "tool_use"
          );


          if (toolUseBlocks.length > 0) {
            // Append current response to the conversation
            messages.push({
              role: ParticipantRole.ASSISTANT,
              content: response.content,
            });

            const toolResponse = await jiraAgentHandler(response, messages, _additionalParams);
            const formattedResponse = this.formatToolResults(toolResponse);
            // Add the formatted response to messages
            messages.push(formattedResponse);
            toolUse = true;
          } else {
            const textContent = response.content.find(
              (content) =>
                content.type === "text"
            );
            finalMessage = textContent?.text || "";
          }

          if (response.stop_reason === "end_turn") {
            toolUse = false;
          }

          recursions--;
          if(recursions <= 0){
            const textContent = response.content.find(
              (content) =>
                content.type === "text"
            );
            finalMessage = textContent?.text || "Error accessing Jira";
          }
        } while (toolUse && recursions > 0);
        return {
          role: ParticipantRole.ASSISTANT,
          content: [{ text: finalMessage }],
          modelStats: modelStats
        };
      
    } catch (error) {
      logger.error("Jira Anthropic Agent: Error processing request:", error);
      // Instead of returning a default result, we'll throw the error
      throw error;
    }
  }

  async handleSingleResponse(input) {
    try {
      const response = await this.client.messages.create(input, {maxRetries: 0});
      return response;
    } catch (error) {
      logger.error("JIra Agent: Error invoking Anthropic:", error);
      throw error;
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

  enhanceSystemPrompt(_additionalParams){
    this.promptTemplate = this.promptTemplate + `\n. Current user is: ${_additionalParams.email}. If no other email or user id is provided, use this. If user asks for my jira or my issues etc, use this email id.`;
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

  replaceplaceholders(template,variables) {
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
