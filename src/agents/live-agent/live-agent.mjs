import { Agent, ParticipantRole } from "@swatechnology/swa-multi-agent-orchestrator";
import OpenAI from 'openai';
import logger from "../../logger.mjs";
import { fetchDescription } from "../../utils/s3Utils.mjs"


export class LiveAgent extends Agent {

  constructor(options) {

    super(options);

    if (!options.apiKey && !options.client) {
      throw new Error("Live Agent API key or Live Agent client is required");
    }
    if (options.client) {
      this.client = options.client;
    } else {
      if (!options.apiKey) throw new Error("Live Agent API key is required");
      this.client = new OpenAI({
        apiKey: options.apiKey,
        baseURL: "https://api.x.ai/v1"
      });
    }

    this.model = options.model || options.modelId;
    this.streaming = options.streaming ?? false;
    this.logRequest = options.logRequest ?? false;
    this.inferenceConfig = {
      maxTokens: options.inferenceConfig?.maxTokens,
      temperature: options.inferenceConfig?.temperature,
      topP: options.inferenceConfig?.topP,
      stopSequences: options.inferenceConfig?.stopSequences,
    };

    this.retriever = options.retriever ?? null;

    // this is for debug purposes only, will be overwritten by the description fetched from S3
    this.promptTemplate = `You are a ${this.name}. ${this.description} 
    You will do a real time web search for user requests. Provide accurate results. Avoid search results from controversial sources, inappropriate results and not trustworthy sources.
    If you can mention the date of retrieving the results. Add a disclaimer that the results are fetched from web and users need to verify the accuracy themselves. 
    Dont make up results, say you cannot get the data. 
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
        options.customSystemPrompt.variables
      );
    }
  }

  async processRequest(
    inputText,
    userId,
    sessionId,
    chatHistory,
    additionalParams
  ) {


    //fetch detailed description from s3
    const [S3Bucket, fileId] = this.s3details.split("##");
    this.promptTemplate = await fetchDescription(S3Bucket, fileId) || this.promptTemplate;

    this.enhanceSystemPrompt(additionalParams);
    this.updateSystemPrompt();

    let systemPrompt = this.systemPrompt;

    const messages = [
      { role: 'system', content: systemPrompt },
      ...chatHistory.map(msg => ({
        role: msg.role.toLowerCase(),
        content: msg.content[0]?.text || ''
      })),
      { role: 'user', content: inputText }
    ];

    if (this.retriever) {
      // retrieve from Vector store
      const response = await this.retriever.retrieveAndCombineResults(inputText);
      const contextPrompt =
        "\nHere is the context to use to answer the user's question:\n" +
        response;
      systemPrompt = systemPrompt + contextPrompt;
    }

    const { maxTokens, temperature, topP, stopSequences } = this.inferenceConfig;

    const requestOptions = {
      model: this.model,
      messages: messages,
      max_tokens: maxTokens,
      stream: this.streaming,
      temperature,
      top_p: topP,
      stop: stopSequences,
      search_parameters: {
        "mode": "on"
      }
    };

    return this.handleSingleResponse(requestOptions);
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
      ...this.customVariables
    };
    this.systemPrompt = this.replaceplaceholders(this.promptTemplate, allVariables);
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

  async handleSingleResponse(input) {
    try {
      const nonStreamingOptions = { ...input, stream: false };
      const chatCompletion = await this.client.chat.completions.create(nonStreamingOptions);

      if (this.logRequest) {
        console.log("\n\n---- Live Agent ----");
        console.log(JSON.stringify(nonStreamingOptions));
        console.log(JSON.stringify(chatCompletion));
        console.log("\n\n");
      }
      if (!chatCompletion.choices || chatCompletion.choices.length === 0) {
        throw new Error('Live Agent: No choices returned from GROK API');
      }

      const modelStats = [];
      const obj = {};
      obj["id"] = chatCompletion.id;
      obj["model"] = chatCompletion.model;
      obj["usage"] = chatCompletion.usage;
      obj["from"] = "agent-live";
      modelStats.push(obj);
      logger.info(`Live Agent Usage: `, JSON.stringify(obj));
      const assistantMessage = chatCompletion.choices[0]?.message?.content;

      if (typeof assistantMessage !== 'string') {
        throw new Error('Live Agent: Unexpected response format from Live API');
      }

      return {
        role: ParticipantRole.ASSISTANT,
        content: [{ text: assistantMessage }],
        modelStats: modelStats,
        citations: chatCompletion.citations
      };
    } catch (error) {
      logger.error('Live Agent: Error in Live API call:', error);
      console.log(error);
      throw error;
    }
  }

}