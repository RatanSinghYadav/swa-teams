const llm = {};

import Anthropic from '@anthropic-ai/sdk';
const anthropic = new Anthropic({
  apiKey: process.env["ANTHROPIC_KEYS"]?.split(";")[Math.floor(Math.random() * process.env.TOKEN_COUNT)] || process.env["ANTHROPIC_KEY"],
});
import logger from '../logger.mjs';

//call anthropic and get results.
llm.callAnthropic = async ({
  prompt,
  message,
  MAX_TOKENS = 4096,
  model = process.env['ANTHROPIC_MODEL'],
  purpose = 'Anthropic Response',
}) => {
  let input = {
    system: prompt,
    model: model,
    max_tokens: MAX_TOKENS,
    messages: [{ role: 'user', content: message }],
  };
  let r = {};
  let msg = "";
  try {
    r = await anthropic.messages.create(input);

    logger.info(`${purpose}: ${msg}`);
    const obj = {};
    obj['id'] = r.id;
    obj['model'] = model;
    obj['usage'] = r.usage;
    obj['from'] = 'llm-anthropic-helper';
    logger.info(`LLM anthropic helper usage: `, JSON.stringify(obj));
    msg = r.content[0].text || '';
  } catch (e) {
    logger.info('Error with input of: ', input);
    logger.error('Error with anthropic call ', e);
  }
  return msg;
};

export default llm;
