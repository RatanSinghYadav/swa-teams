const personality = {};
import Anthropic from "@anthropic-ai/sdk";
const anthropic = new Anthropic({
  apiKey: process.env["ANTHROPIC_KEYS"]?.split(";")[Math.floor(Math.random() * process.env.TOKEN_COUNT)] || process.env["ANTHROPIC_KEY"]
});
import logger from "../logger.mjs";

let SWA_PROMPT = `You are a personal assistant named Swa. You are always friendly and approachable, creating a welcoming helpful vibe. You are great at problem solving and quite resourceful. You always help people find solutions to their problems.
Your resposnes has these characteristics:
    1. Warm and friendly, without being overly casual.
    2. Encouraging and supportive when guiding users.
    3. Clear and concise to avoid overwhelming users
    4. Use positive, action-oriented language.
    5. You always Break down complex tasks into easy-to-follow steps.
    
Also you Inject light humor to your messages where ever appropriate.
Make sure the response is markdown friendly.

Your task is to rewrite the user given message to one that aligns with the above personality and traits.

If there are reference citation links provided, format it and add it to the end of the message.\n. 
`;

const DEFAULT_PROMPT = "\n. You should only return the rewritten message and nothing else. No additional context added. Dont speak in third person, just return the formatted text.";


const MEDIUM_PROMPTS = {};

const slackPrompt = `\n\n You should format the message to be posted to Slack. Links should be formatted to be compatible with Slack. You should make the text as user friendly and as easier to read as possible, to be posted in Slack. Do separate out sections, with headings and nice paragraphs and proper annotations and formatting, all compatible with Slack. You shouldnt add any additional text. 
You should only format the given message into the required format. Nothing else.  Dont make up answers from your knowledge base. Any Jira API links should be replaced with Jira browser URL links and formatted to be compatible with Slack. If there are any links, make sure they are formatted as per Slack's requirements. \n\n`;
MEDIUM_PROMPTS["slack"] = slackPrompt;

personality.applyPersonality = async (message, instanceConfig, medium) => {
  let prompt = "";

  // Skip personality for empty messages
  if (!message || message.trim().length < 1) {
    return "I apologize, but an error occurred. We'll look into it.";
  }

  let isPersonality = true;
  if (instanceConfig && instanceConfig["personality"]) {
    isPersonality = instanceConfig["personality"];
  }

  // If personality is false, return the original message with basic formatting
  if (!isPersonality) {
    // Apply minimal formatting without calling API
    return message;
  }

  // Build prompt only when needed
  prompt = SWA_PROMPT + MEDIUM_PROMPTS[medium] + DEFAULT_PROMPT;

  try {
    // Reduce logging in production
    if (process.env.NODE_ENV !== 'production') {
      logger.debug('Applying personality to message');
    }

    const r = await anthropic.messages.create({
      system: prompt,
      max_tokens: 4000, // Reduced token count for faster response
      model: process.env["ANTHROPIC_MODEL"],
      messages: [{ role: "user", content: message }],
    });

    const personalizedMessage = r.content[0].text;

    return personalizedMessage;
  } catch (e) {
    logger.error(`Error applying personality`, e);
    // If personality fails, return original message
    return message;
  }
};

export default personality;
