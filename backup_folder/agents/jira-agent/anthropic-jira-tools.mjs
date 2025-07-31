
import logger from "../../logger.mjs";
import jira  from "./jira-actions.mjs"
import { ParticipantRole } from "@swatechnology/swa-multi-agent-orchestrator";
import secMgr from "../../utils/sec-mgr.mjs"

const jiratypeTool = {
    name: "jiratypeTool",
    description:
      "Use this tool to fetch jira issue types for a given project, when user asks to create a jira. For example, for a given jira project code, use this tool to fetch list of jira types(story, bug, task , epic etc) and their ids. This is needed because jira type id is needed to fetch jira schema before creating a jira. ",
    input_schema: {
      type: "object",
      properties: {
        project: {
          type: "string",
          description: "The jira project code to fetch jira issue types. ",
        },
    },
    required: ["project"],
  },
};

const jiraschemaTool = {
  name: "jiraschemaTool",
  description:
    `Use this tool to fetch jira schema for a given project and issuetype, when user asks to create a jira. This tool can only be run after running jiratypeTool.
     For example, if project given is ABC, issue type is story and its id is 123, use this tool to fetch the schema. This is needed because after fetching the schema, we need to figure out the required fields and fill them or ask user for the values. `,
  input_schema: {
    type: "object",
    properties: {
      project: {
        type: "string",
        description: "The jira project code to fetch jira issue types. ",
      },
      issuetype: {
        type: "string",
        description: "The jira issue type id to fetch schema ",
      },
  },
  required: ["project","issuetype"],
},
};

const jirafetchTool = {
  name: "jirafetchTool",
  description:
    `Use this tool to fetch all info of a jira ticket when user asks for jira details. We only need the issue number in the format abc-123 `,
  input_schema: {
    type: "object",
    properties: {
      issue: {
        type: "string",
        description: "The jira issue number to fetch details of ",
      },
  },
  required: ["issue"],
},
};

const jiracreateTool = {
  name: "jiracreateTool",
  description:
    `Use this tool to create a jira. This can be run only after jiratypeTool and jiraschemaTool . Once we have the schema and the data filled in, with all required fields, invoke this to create jira. `,
  input_schema: {
    type: "object",
    properties: {
      jiraschema: {
        type: "object",
        description: "The  filled up jira schema for project and issue type with all required fields filled in ",
      },
  },
  required: ["jiraschema"],
},
};

const jiracommentTool = {
  name: "jiracommentTool",
  description:
    `Use this tool add comments to a jira. We only need jira issue number and the comment to be added. `,
  input_schema: {
    type: "object",
    properties: {
      issue: {
        type: "string",
        description: "The  jira issue to add comments to  ",
      },
      comment: {
        type: "object",
        description: `The comments to be added. This should be formatted in this way:  {"body": {"content": [{"content": [{"text": "<replace user comment here>","type": "text"}],"type": "paragraph"}],"type": "doc","version": 1}}`,
      },
  },
  required: ["issue","comment"],
},
};

const jirajqlTool = {
  name: "jirajqlTool",
  description:
    `Use this tool for fetching jira tickets via jql query. When users ask to fetch all their issues, or their top issues, to issues assigned to them and so on, use this tool. `,
  input_schema: {
    type: "object",
    properties: {
      jql: {
        type: "string",
        description: `The  formatted jql query in the form jql=<field>=<value>&<field>=<value>. 
        - The query should begin with jql=
        - Query should be url encoded.
        - When the field value needs user name or id and if you dont have a value for it, just add the value #userid, which will be replaced later. 
        - if there is a valid email given in request, then set the user name or id as the part before the @ in the email.
        - For all other fields, create a valid jql query.
        - You should use the symbol & instead of the word AND.
        - The values should not have any space in them and should be trimmed. 
        - Also limit the max number of issues fetched to 10.`,
      },
  },
  required: ["jql"],
},
};

export const jiraTools = [];
jiraTools.push(jiracommentTool);
jiraTools.push(jiracreateTool);
jiraTools.push(jiraschemaTool);
jiraTools.push(jiratypeTool);
jiraTools.push(jirafetchTool);
jiraTools.push(jirajqlTool);



// export const JIRA_AGENT_PROMPT = `
// You are the agent to help users with things related to jira.
// You are a assistant to create jira, update jira, comment on a jira, re-assign a jira,  get details of a jira and so on.
// Ask more details from user if needed to get the required task completed. 

// - Never guess or make up information.
// - Repeat the tool use for subsequent requests if necessary.
// - For create request is a multi step process. User will give a description and few details. We need to first get all issue types for the 
// project, and get issue type id. then we will fetch the metadata for that issue type, Then we will figure out the required fields. Finally we will convert user input to the required schema and call the api to create jira.
// - For update request, we need the jira number. We will fetch details of the jira, then fetch metadata of the jira and issue type. Then based on what 
// user needs to change , we will update the jira schema and make a request.
// - For getting details of jira, we will get jira number from user, call jira api and provide only the relevant details to the user.
// - For adding comment to a jira, we need the jira number from user and the comment. We will just call the jira api with the comment.
// - Dont ask user for any fields other than jira number. You should auto generate the summary and other fields from the user provided description
// - Project key to use is SWA.
// - For any request type which you cannot understand, offer users to do the action directly in jira portal.
// - Even with spelling mistakes or even if users use abbrevations, figure out the right type value.
// - If the tool errors, apologize, explain the order failed reason, and suggest other options like the jira portal.
// - Never claim to search online, access external data, or use tools besides provided.
// - Complete the entire process until you have all required data before sending the complete response.
// - User will have only one step of giving the details. Rest all steps will be done by you.
// `;

export async function jiraAgentHandler(response, conversation, additionalParams) {
  logger.info("jiraAgentHandler input", { response, additionalParams });

  //read from parameter store and set jira params
  const paramsBase = additionalParams.teamId.toLowerCase();
  const jiraParams = await secMgr.getParameters([
    `/${paramsBase}/jiratoken`,
    `/${paramsBase}/jirauser`,
    `/${paramsBase}/jiradomain`
  ])
  jira.setParams(jiraParams);

  const responseContentBlocks = response.content;
  let toolResults = [];
  if (!responseContentBlocks) {
    throw new Error("No content blocks in response");
  }

  for (const contentBlock of response.content) {
    if (contentBlock.type === "tool_use") {
      const toolUseBlock = contentBlock;
      let content = "Error accessing jira."
      if (toolUseBlock.name === "jiratypeTool") {
        content = await jira.fetchJiraTypes(toolUseBlock.input["project"]);
      }else if(toolUseBlock.name === "jiraschemaTool"){
        content = await jira.fetchJiraSchema(toolUseBlock.input["project"], toolUseBlock.input["issuetype"]);
      }else if(toolUseBlock.name === "jiracreateTool"){
        content = await jira.createJira(toolUseBlock.input);
      }else if(toolUseBlock.name === "jirafetchTool"){
        content = await jira.fetchJira(toolUseBlock.input["issue"]);
      }else if(toolUseBlock.name === "jiracommentTool"){
        content = await jira.addComment(toolUseBlock.input["issue"],toolUseBlock.input["comment"]);
      }else if(toolUseBlock.name === "jirajqlTool"){
        content = await jira.jqlSearch(toolUseBlock.input["jql"],additionalParams["userid"]);
      }
      // logger.info(`jira tool handler content: ${content}`);
      toolResults.push({
        "type": "tool_result",
        "tool_use_id": toolUseBlock.id,
        "content": content,
      });
    }
  }

  const message = { role: ParticipantRole.USER, content: toolResults };
  // logger.info("Tool use response:", message);
  return message;
}
