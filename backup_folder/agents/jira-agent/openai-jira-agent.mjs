import {
  Agent,
  ParticipantRole,
} from '@swatechnology/swa-multi-agent-orchestrator';
import OpenAI from 'openai';
import logger from '../../logger.mjs';
import { jiraTools, jiraAgentHandler } from './jira-tools.mjs';

const DEFAULT_MAX_TOKENS = 4096;

export class JiraAgent extends Agent {
  constructor(options) {
    super(options);

    if (!options.apiKey && !options.client) {
      throw new Error('OpenAI API key or OpenAI client is required');
    }
    if (options.client) {
      this.client = options.client;
    } else {
      if (!options.apiKey) throw new Error('OpenAI API key is required');
      this.client = new OpenAI({ apiKey: options.apiKey });
    }
    if (!options.modelId) {
      throw new Error('Jira Agent: ModelId is required');
    }

    this.modelId = options.modelId;
    this.streaming = options.streaming ?? false;
    this.logRequest = options.logRequest ?? false;
    this.inferenceConfig = {
      maxTokens: options.inferenceConfig?.maxTokens ?? DEFAULT_MAX_TOKENS,
      temperature: options.inferenceConfig?.temperature,
      topP: options.inferenceConfig?.topP,
      stopSequences: options.inferenceConfig?.stopSequences,
    };

    this.retriever = options.retriever ?? null;

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

    While creating jql query, limit fields to important fields and fetch only max 10 jiras.
    
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

    this.customVariables = {};
    this.systemPrompt = '';

    if (options.customSystemPrompt) {
      this.setSystemPrompt(
        options.customSystemPrompt.template,
        options.customSystemPrompt.variables,
      );
    }
  }

  async processRequest(
    inputText,
    userId,
    sessionId,
    chatHistory,
    additionalParams,
  ) {
    // this.updateSystemPrompt();

    this.enhanceSystemPrompt(additionalParams);

    let systemPrompt = this.promptTemplate;

    if (this.retriever) {
      // retrieve from Vector store
      const response =
        await this.retriever.retrieveAndCombineResults(inputText);
      const contextPrompt =
        "\nHere is the context to use to answer the user's question:\n" +
        response;
      systemPrompt = systemPrompt + contextPrompt;
    }

    const messages = [
      { role: 'system', content: systemPrompt },
      ...chatHistory.map((msg) => ({
        role: msg.role.toLowerCase(),
        content: msg.content[0]?.text || '',
      })),
      { role: 'user', content: inputText },
    ];

    const { maxTokens, temperature, topP, stopSequences } =
      this.inferenceConfig;


    const requestOptions = {
      model: this.modelId,
      messages: messages,
      max_tokens: maxTokens,
      stream: false,
      temperature,
      top_p: topP,
      stop: stopSequences,
      tools: jiraTools,
    };

    if (this.streaming) {
      return this.handleStreamingResponse(requestOptions);
    } else {
      return this.handleSingleResponse(requestOptions, additionalParams);
    }
  }

  enhanceSystemPrompt(additionalParams) {
    this.promptTemplate =
      this.promptTemplate +
      `\n. Current user is: ${additionalParams.email}. If no other email or user id is provided, use this. If user asks for my jira or my issues etc, use this email id.`;
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
      allVariables,
    );
  }

  replaceplaceholders(template, variables) {
    return template.replace(/{{(\w+)}}/g, (match, key) => {
      if (key in variables) {
        const value = variables[key];
        return Array.isArray(value) ? value.join('\n') : String(value);
      }
      return match;
    });
  }

  async handleSingleResponse(input, additionalParams) {
    try {
      let finalMessage = '';
      let toolUse = false;
      let recursions = 10;

      const modelStats = [];
      do {
        const nonStreamingOptions = { ...input, stream: false };
        if (this.logRequest) {
          logger.info('\n\n---- OpenAI Agent ----');
          logger.info(JSON.stringify(nonStreamingOptions));
        }
        const chatCompletion = await this.client.chat.completions.create(
          nonStreamingOptions,
          { maxRetries: 0 },
        );
        if (this.logRequest) {
          logger.info(JSON.stringify(chatCompletion));
        }

        if (!chatCompletion.choices || chatCompletion.choices.length === 0) {
          throw new Error('JIra Agent: No choices returned from OpenAI API');
        }
        const obj = {};
        obj['id'] = chatCompletion.id;
        obj['model'] = chatCompletion.model;
        obj['usage'] = chatCompletion.usage;
        obj['from'] = 'agent-openai';
        modelStats.push(obj);
        logger.info(`Jira openAI Agent Usage: `, JSON.stringify(obj));

        let choice = chatCompletion.choices[0];
        const toolUseBlocks = choice.message.tool_calls;

        if (toolUseBlocks && toolUseBlocks.length > 0) {
          // Append current response to the conversation
          input.messages.push({
            role: ParticipantRole.ASSISTANT,
            tool_calls: toolUseBlocks,
          });

          const toolResponse = await jiraAgentHandler(
            choice,
            input.messages,
            additionalParams,
          );
          input.messages.push(...toolResponse);
          toolUse = true;
        } else {
          const textContent = choice.message;
          finalMessage = textContent?.content || '';
        }

        if (choice.finish_reason === 'stop') {
          toolUse = false;
        }

        recursions--;
        if (recursions <= 0) {
          const textContent = choice.message;
          finalMessage = textContent?.content || 'Error accessing Jira';
        }
      } while (toolUse && recursions > 0);

      return {
        role: ParticipantRole.ASSISTANT,
        content: [{ text: finalMessage }],
        modelStats: modelStats,
      };
    } catch (error) {
      logger.error('OpenAI Agent: Error in OpenAI API call:', error);
      throw error;
    }
  }
}
