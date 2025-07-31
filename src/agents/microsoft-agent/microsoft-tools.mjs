import logger from '../../logger.mjs';
import microsoft from './microsoft-actions.mjs';
import { ParticipantRole } from '@swatechnology/swa-multi-agent-orchestrator';
import auth from '../../utils/auth-utils.mjs';
import secMgr from '../../utils/sec-mgr.mjs';

const sendEmail = {
  "toolSpec": {
    "name": 'sendemail',
    "method": "POST",
    "url": "/me/sendMail",
    "fields": ["message"],
    "description":
      'Use this tool send emails. Always make sure this tool is executed. If not email wont be sent.',
    "inputSchema": {
      "json": {
        "type": 'object',
        "properties": {
          "subject" :{
            "type": 'string',
            "description": "Subject for the mail. Auto generate it if needed from the content"
          },
          "contenttype" :{
            "type": 'string',
            "description": "A valid content type for the email body. valid values are text or html"
          },
          "content" :{
            "type": 'string',
            "description": "A valid content for the email body. Format it for better email etiquette and make it professional"
          },
          "to" :{
            "type": 'string',
            "description": "List of comma separated email address of people in to list"
          },
          "cc" :{
            "type": 'string',
            "description": "List of comma separated email address of people in cc list"
          },
        },
        "required": ['subject','contenttype', 'content'],
      }
    },
  },
};

export const microsoftTools = [];
microsoftTools.push(sendEmail);


export async function microsoftAgentHandler(
  response,
  conversation,
  additionalParams,
) {
  logger.info('microsoftAgentHandler input', { response, additionalParams });

  //read from parameter store and set params
  const paramsBase = additionalParams.teamId.toLowerCase();
  const microsoftParams = {};
  const microsoftDomain = await secMgr.getParameter(`/${paramsBase}/microsoftdomain`)
  microsoftParams["microsoftdomain"] = microsoftDomain;

  const responseContentBlocks = response.content;
  let toolResults = [];
  if (!responseContentBlocks) {
    throw new Error('No content blocks in response');
  }

  for (const contentBlock of response.content) {
    if (contentBlock["toolUse"]) {
      const toolUseBlock = contentBlock["toolUse"];
      let content = '';
      let tool = microsoftTools.find(x => x.toolSpec.name === toolUseBlock.name)?.toolSpec;

      if (tool) {
        //Need to getToken. 
          let authResponse = await auth.getOauthToken("microsoft", additionalParams.userId, additionalParams.channelId, additionalParams.teamId  )
          if(authResponse.status === "reauth"){
            logger.info("Needs user reauth to microsoft.");
            content = "You need to reauthorize microsoft. Please check your messages";
            let reauthResp = await auth.reauthUser("microsoft", additionalParams.userId, additionalParams.channelId, additionalParams.teamId  );
            content = reauthResp.body;
          }else if(authResponse.status === "success"){
            microsoftParams["oauthToken"] = authResponse.token
            microsoft.setParams(microsoftParams);
            let options = microsoft.createSendEmailOptions(tool.url, toolUseBlock.input);
            // let options = microsoft.createAxiosOptions(tool.method, tool.url, toolUseBlock.input, tool.fields);
            content = await microsoft.makeAxiosCall(options);
          }else{
            content = "An error has occurred. Please try again";
          }
      } else {
        content = `This feature for microsoft Agent is not supported by @swa yet.`;
      }

      if (typeof content === 'object') {
        content = JSON.stringify(content);
      }
      logger.info(`microsoft tool handler content: ${content}`);
      let toolRes = {};
      let toolresult = {};
      toolRes["toolResult"] = toolresult;
      toolresult.toolUseId = toolUseBlock["toolUseId"];
      toolresult.content = [];
      toolresult.content.push({ text: content });
      toolResults.push(toolRes);
    }
  }

  const message = { role: ParticipantRole.USER, content: toolResults };
  return message;
}
