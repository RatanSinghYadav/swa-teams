import logger from '../../logger.mjs';
import jira from './jira-actions.mjs';
import secMgr from '../../utils/sec-mgr.mjs';
import service from '../../services.mjs';

const jiratypeTool = {
  type: 'function',
  function: {
    name: 'jiratypeTool',
    description:
      'Use this tool to fetch jira issue types for a given project, when user asks to create a jira. For example, for a given jira project code, use this tool to fetch list of jira types(story, bug, task , epic etc) and their ids. This is needed because jira type id is needed to fetch jira schema before creating a jira. ',
    parameters: {
      type: 'object',
      properties: {
        project: {
          type: 'string',
          description: 'The jira project code to fetch jira issue types. ',
        },
      },
      required: ['project'],
      additionalProperties: false
    },
    strict: true
  },
};

const jiraschemaTool = {
  type: 'function',
  function: {
    name: 'jiraschemaTool',
    description: `Use this tool to fetch jira schema for a given project and issuetype, when user asks to create a jira. This tool can only be run after running jiratypeTool.
           For example, if project given is ABC, issue type is story and its id is 123, use this tool to fetch the schema. This is needed because after fetching the schema, we need to figure out the required fields and fill them or ask user for the values. `,
    parameters: {
      type: 'object',
      properties: {
        project: {
          type: 'string',
          description: 'The jira project code to fetch jira issue types. ',
        },
        issuetype: {
          type: 'string',
          description: 'The jira issue type id to fetch schema ',
        },
      },
      required: ['project', 'issuetype'],
      additionalProperties: false
    },
    strict: true
  },
};

const jirafetchTool = {
  type: 'function',
  function: {
    name: 'jirafetchTool',
    description: `Use this tool to fetch all info of a jira ticket when user asks for jira details. We only need the issue number in the format abc-123 `,
    parameters: {
      type: 'object',
      properties: {
        issue: {
          type: 'string',
          description: 'The jira issue number to fetch details of ',
        },
      },
      required: ['issue'],
      additionalProperties: false
    },
    strict: true
  },
};

const jiracreateTool = {
  type: 'function',
  function: {
    name: 'jiracreateTool',
    description: `Use this tool to create a jira. This can be run only after jiratypeTool and jiraschemaTool . Once we have the schema and the data filled in, with all required fields, invoke this to create jira. `,
    parameters: {
      type: 'object',
      properties: {
        js: {
          type: 'string',
          description:
            'This is valid json string for jira creation payload.Fill this up for project and issue type with all required fields. Auto generate this json object by using the jira schema returned. The convert to string',
        },
      },
      required: ['js'],
      additionalProperties: false
    },
    strict: true
  },
};

const jiracommentTool = {
  type: 'function',
  function: {
    name: 'jiracommentTool',
    description: `Use this tool add comments to a jira. We only need jira issue number and the comment to be added. `,
    parameters: {
      type: 'object',
      properties: {
        issue: {
          type: 'string',
          description: 'The  jira issue to add comments to  ',
        },
        comment: {
          type: 'string',
          description: `JSON String for The comments to be added. This should be formatted in this way:  {"body": {"content": [{"content": [{"text": "<replace user comment here>","type": "text"}],"type": "paragraph"}],"type": "doc","version": 1}}. Form the json object and convert it to string`,
        },
      },
      required: ['issue', 'comment'],
      additionalProperties: false
    },
    strict: true
  },
};

const jirajqlTool = {
  type: 'function',
  function: {
    name: 'jirajqlTool',
    description: `Use this tool for fetching jira tickets via jql query. When users ask to fetch all their issues, or their top issues, to issues assigned to them and so on, use this tool. `,
    parameters: {
      type: 'object',
      properties: {
        jql: {
          type: 'string',
          description: `The  formatted jql query in the form jql=<field>=<value>&<field>=<value>. 
              - The query should begin with jql=
              - Query should be url encoded.
              - When the field value needs user name or id and if you dont have a value for it, just add the value #userid, which will be replaced later. 
              - if there is a valid email given in request, then set the user name or id as the part before the @ in the email.
              - For all other fields, create a valid jql query.
              - You should use the symbol & instead of the word AND.
              - The values should not have any space in them and should be trimmed. 
              - Fetch only important fields and not all fields in jira. Few examples are summary, description, assignee, status, priority, created etc.
              - Also limit the max number of issues fetched to 10.`,
        },
      },
      required: ['jql'],
      additionalProperties: false
    },
    strict: true
  },
};

export const jiraTools = [];
jiraTools.push(jiracommentTool);
jiraTools.push(jiracreateTool);
jiraTools.push(jiraschemaTool);
jiraTools.push(jiratypeTool);
jiraTools.push(jirafetchTool);
jiraTools.push(jirajqlTool);


export async function jiraAgentHandler(choice, conversation, additionalParams) {
  logger.info('jiraAgentHandler input', { choice, additionalParams });

  //read from parameter store and set jira params
  const paramsBase = additionalParams.teamId.toLowerCase();
  const jiraParams = await secMgr.getParameters([
    `/${paramsBase}/jiratoken`,
    `/${paramsBase}/jirauser`,
    `/${paramsBase}/jiradomain`,
  ]);
  jira.setParams(jiraParams);

  const responseMessage = choice.message;
  let toolResults = [];
  if (!responseMessage || !responseMessage.tool_calls) {
    throw new Error('No message blocks or tools in response');
  }

  for (const tool of responseMessage.tool_calls) {
    if (tool.type === 'function') {
      let func = tool.function;
      let args = service.convertToJson(func.arguments);
      let content = 'Error accessing jira.';
      if (func.name === 'jiratypeTool') {
        content = await jira.fetchJiraTypes(args['project']);
      } else if (func.name === 'jiraschemaTool') {
        content = await jira.fetchJiraSchema(
          args['project'],
          args['issuetype'],
        );
      } else if (func.name === 'jiracreateTool') {
        content = await jira.createJira(args);
      } else if (func.name === 'jirafetchTool') {
        content = await jira.fetchJira(args['issue']);
      } else if (func.name === 'jiracommentTool') {
        content = await jira.addComment(args['issue'], args['comment']);
      } else if (func.name === 'jirajqlTool') {
        content = await jira.jqlSearch(args['jql'], additionalParams['userid']);
      }
      // logger.info(`jira tool handler content: ${content}`);
      toolResults.push({
        role: 'tool',
        tool_call_id: tool.id,
        content: content,
      });
    }
  }

  return toolResults;
}
