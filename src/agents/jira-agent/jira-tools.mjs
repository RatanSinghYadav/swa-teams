import logger from '../../logger.mjs';
import jira from './jira-actions.mjs';
import { ParticipantRole } from '@swatechnology/swa-multi-agent-orchestrator';
import secMgr from '../../utils/sec-mgr.mjs';

const jiratypeTool = {
  "toolSpec": {
    "name": 'jiratypeTool',
    "method": "GET",
    "url": "/rest/api/3/issue/createmeta/{{project}}/issuetypes",
    "description":
      'Use this tool to fetch jira issue types for a given project, when user asks to create a jira. For example, for a given jira project code, use this tool to fetch list of jira types(story, bug, task , epic etc) and their ids. This is needed because jira type id is needed to fetch jira schema before creating a jira. ',
    "inputSchema": {
      "json": {
        "type": 'object',
        "properties": {
          "project": {
            "type": 'string',
            "description": 'The jira project code to fetch jira issue types. ',
          },
        },
        "required": ['project'],
      }
    },
  },
};

const jiraschemaTool = {
  "toolSpec": {
    "name": 'jiraschemaTool',
    "method": "GET",
    "url": "/rest/api/3/issue/createmeta/{{project}}/issuetypes/{{issuetype}}",
    "description": `Use this tool to fetch jira schema for a given project and issuetype, when user asks to create a jira. This tool can only be run after running jiratypeTool.
     Try to figure out project code from the prompt. It could be in the Epic if user has told you about the epic to be used. 
     Project is needed because after fetching the schema, we need to figure out the required fields and fill them or ask user for the values. 
     Do not assume the project code, it should be from prompt, either direct or other input fields like epic. If you're not sure of the project, feel free to ask the user for it.`,
    "inputSchema": {
      "json": {
        "type": 'object',
        "properties": {
          "project": {
            "type": 'string',
            "description": 'The jira project code to fetch jira issue types. ',
          },
          "issuetype": {
            "type": 'string',
            "description": 'The jira issue type id to fetch schema ',
          },
        },
        "required": ['project', 'issuetype'],
      }
    },
  },
};

const fetchJiraTransitionsTool = {
  "toolSpec": {
    "name": 'fetchJiraTransitionsTool',
    "method": "GET",
    "url": "/rest/api/3/issue/{{issue}}/transitions",
    "description": `Use this tool to fetch the list of available transitions for the issue, when user asks to transition an issue.
     For example, if jira issue given is CORE-123, use this tool to fetch the all available transitions for CORE-123 issue. This is needed because after fetching the available transitions, we need to map to one value that user wants to transition to.`,
    "inputSchema": {
      "json": {
        "type": 'object',
        "properties": {
          "issue": {
            "type": 'string',
            "description": 'The jira issue number to fetch details of ',
          },
        },
        "required": ['issue'],
      }
    },
  },
}

const jiraTransitionsTool = {
  "toolSpec": {
    "name": 'jiraTransitionsTool',
    "method": "POST",
    "url": "/rest/api/3/issue/{{issue}}/transitions",
    "fields": ['body'],
    "description": `Use this tool to transition a jira issue to new transition id. This can be run only after fetchJiraTransitionsTool. We full body of that will be submitted to POST API call for transitioning to the new id.
    {
      "transition": {
        "id": "<replace with actual transition id>"
      }
    }
    Return the JSON object exactly as shown above, replacing <replace with actual transition id> with the actual id.`,
    "inputSchema": {
      "json": {
        "type": 'object',
        "properties": {
          "issue": {
            "type": 'string',
            "description": 'The jira issue key to be transitioned.',
          },
          "body": {
            "type": 'string',
            "description": `The transition api call body to be passed. This should be formatted as a JSON object directly under the "body" field.`,
          },
        },
        "required": ['issue', 'body'],
      }
    },
  },
};

const jirafetchTool = {
  "toolSpec": {
    "name": 'jirafetchTool',
    "method": "GET",
    "url": "/rest/api/3/issue/{{issue}}",
    "description": `Use this tool to fetch all info of a jira ticket when user asks for jira details. We only need the issue number in the format abc-123. Do not add any REST API URL details in the response.`,
    "inputSchema": {
      "json": {
        "type": 'object',
        "properties": {
          "issue": {
            "type": 'string',
            "description": 'The jira issue number to fetch details of ',
          },
        },
        "required": ['issue'],
      }
    },
  },
};

const jiracreateTool = {
  "toolSpec": {
    "name": 'jiracreateTool',
    "method": "POST",
    "url": "/rest/api/3/issue",
    "fields": ['jiraschema'],
    "description": `Use this tool to create a jira. This can be run only after jiratypeTool and jiraschemaTool . Once we have the schema and the data filled in, with all required fields, invoke this to create jira.
    Step you need to follow : \n 1. Fetch jira types using the tool jiratypeTool. \n 2. Then fetch jira schema using tool jiraschemaTool. \n 3.Use the schema to create jira
    `,
    "inputSchema": {
      "json": {
        "type": 'object',
        "properties": {
          "jiraschema": {
            "type": 'string',
            "description":
              'This is valid json string for jira creation payload. Fill this up for project and issue type with all required fields. Auto generate this json object by using the jira schema returned. Then convert to string ',
          },
        },
        "required": ['jiraschema'],
      }
    },
  },
};

const jiracommentTool = {
  "toolSpec": {
    "name": 'jiracommentTool',
    "method": "POST",
    "url": "/rest/api/3/issue/{{issue}}/comment",
    "fields": ['comment'],
    "description": `Use this tool to add comments to a Jira issue. We only need the Jira issue number and the comment to be added. The comment should be formatted as follows:
    {
      "body": {
        "content": [
          {
            "content": [
              {
                "text": "<replace user comment here>",
                "type": "text"
              }
            ],
            "type": "paragraph"
          }
        ],
        "type": "doc",
        "version": 1
      }
    }.
    Return the JSON object exactly as shown above, replacing <replace user comment here> with the actual comment.`,
    "inputSchema": {
      "json": {
        "type": 'object',
        "properties": {
          "issue": {
            "type": 'string',
            "description": 'The Jira issue to add comments to.',
          },
          "comment": {
            "type": 'string',
            "description": `The comment to be added. This should be formatted as a JSON object directly under the "body" field.`,
          },
        },
        "required": ['issue', 'comment'],
      }
    },
  },
};

const jirajqlTool = {
  "toolSpec": {
    "name": 'jirajqlTool',
    "method": "GET",
    "url": "/rest/api/3/search?{{jql}}",
    "description": `Use this tool for fetching jira tickets via jql query. When users ask to fetch all their issues, or their top issues, to issues assigned to them and so on, use this tool. `,
    "inputSchema": {
      "json": {
        "type": 'object',
        "properties": {
          "jql": {
            "type": 'string',
            "description": `The  formatted jql query in the form jql=<field>=<value>&<field>=<value>. 
          - The query should begin with jql=
          - Query shouldn't have any spaces in it.
          - Query should not have word conditions like AND, OR etc. It must be a valid jql query which uses symbols like &.
          - Query should be url encoded.
          - When the field value needs user name or id and if you dont have a value for it, just add the value #userid, which will be replaced later. 
          - if there is a valid email given in request, then set the user name or id as the part before the @ in the email.
          - For all other fields, create a valid jql query.
          - Link multiple filters with & operator. Example assignee=mark&maxResults=10. There is no space between operators.
          - The values should not have any space in them and should be trimmed. 
          - Also limit the max number of issues fetched to 10.
          - Jira links should be browser friendly and not rest api links
          - Important: When forming jql query, Fetch only required fields: summary, description, status, assignee and not all fields`,
          },
        },
        "required": ['jql'],
      }
    },
  }
};

const jiraFetchIssueLinkTypeTool = {
  "toolSpec": {
    "name": 'jiraFetchIssueLinkTypeTool',
    "method": "GET",
    "url": "/rest/api/3/issueLinkType",
    "description": `Use this tool to fetch the list of available issue link type for a jira issue when user asks to link an issue. For example, if jira issue given is CORE-123, use this tool to fetch the all available issue link type for CORE-123 issue. This is needed because after fetching the available issue link type, we need to map to one value that user wants to link to.`,
    "inputSchema": {
      "json": {
        "type": 'object',
        "properties": {
          "issue": {
            "type": 'string',
            "description": 'The jira issue number to fetch possible issuelinktypes',
          },
        },
        "required": ['issue'],
      }
    },
  },
};

const jiraLinkIssueTool = {
  "toolSpec": {
    "name": 'jiraLinkIssueTool',
    "method": "POST",
    "url": "/rest/api/3/issueLink",
    "description": `Use this tool to link a jira issue with another jira issue with specific issue link type. We need issueLinkType, inwardIssue and outwardIssue for this. inwardIssue is the issue to be linked and outwardIssue is the issue to which inwardIssue must be linked.  This can be run only after jiraFetchIssueLinkTypeTool which will fetch all issueLinkType and map the one that will be used. Once we have the type and the data filled in, with all required fields, use the json as body to invoke APi to link jira issues. 
    {
      "body": {
        "type": {
          "name": "<name>>"
        },
        "inwardIssue": {
          "key": "<inwardIssue key>"
        },
        "outwardIssue": {
          "key": "<outwardIssue key>"
        }
      }
    }
    Return the JSON object exactly as shown above, replacing <inwardIssue key>, <outwardIssue key> and <type> with the actual key/name.`,
    "fields": ['body'],
    "inputSchema": {
      "json": {
        "type": "object",
        "properties": {
          "body": {
            "type": {
              "type": "object",
              "description": "This is the type of issue link to be created",
              "properties": {
                "name": {
                  "type": "string",
                  "description": "The name of issue link type to be created, for example 'Blocks', 'Relates', 'Duplicate', etc."
                }
              },
            },
            "inwardIssue": {
              "type": "object",
              "description": "The jira issue json to be linked with containing the issue key",
              "properties": {
                "key": {
                  "type": "string",
                  "description": "The jira issue key to be linked with, like CORE-123, TES-05 etc."
                }
              }
            },
            "outwardIssue": {
              "type": "object",
              "description": "The jira issue to be linked to containing the issue key",
              "properties": {
                "key": {
                  "type": "string",
                  "description": "The jira issue to be linked to, like CORE-123, TES-05 etc."
                }
              }
            }
          },
          "required": ["inwardIssue", "outwardIssue", "type"]
        },
        "required": ["body"]
      }
    }
  },
};

const jiraGetWatcherTool = {
  "toolSpec": {
    "name": 'jiraGetWatcherTool',
    "method": "GET",
    "url": "/rest/api/3/issue/{{issue}}/watchers",
    "description": `Use this tool to fetch the list of watchers for a Jira issue. We need the Jira issue key to retrieve the watchers. The response will include the list of users watching the issue.`,
    "inputSchema": {
      "json": {
        "type": 'object',
        "properties": {
          "issue": {
            "type": 'string',
            "description": 'The Jira issue key for which to fetch the list of watchers.',
          },
        },
        "required": ['issue'],
      }
    },
  },
};

const jiraGetUserAccountTool = {
  "toolSpec": {
    "name": 'jiragetUserAccountTool',
    "method": "GET",
    "url": "/rest/api/3/user/search?query={{email}}",
    "description": `Use this tool to fetch user account details in Jira. We need a query string (e.g., username or email) to search for the user. The response will include the user's account ID and other details.`,
    "inputSchema": {
      "json": {
        "type": 'object',
        "properties": {
          "email": {
            "type": 'string',
            "description": 'This is email or username of the user to be searched in Jira.',
          },
        },
        "required": ['email'],
      }
    },
  },
};

const jiraAssigneeTool = {
  "toolSpec": {
    "name": 'jiraAssigneeTool',
    "method": "PUT",
    "url": "/rest/api/3/issue/{{issue}}/assignee",
    "description": `Use this tool to assign a Jira issue to a specific user. We need the Jira issue key and the account ID or username of the user to whom the issue will be assigned. This can be run only after jiragetUserAccountTool which will fetch the accountId of the user. use that to fill the JSON body. The payload should be formatted as follows:
    {
      "accountId": "<replace with account ID>"
    }
    Return the JSON object exactly as shown above, replacing <replace with account ID> or <replace with username> with the actual value.`,
    "fields": ['assignee'],
    "inputSchema": {
      "json": {
        "type": 'object',
        "properties": {
          "issue": {
            "type": 'string',
            "description": 'The Jira issue key to be assigned.',
          },
          "assignee": {
            "type": 'object',
            "description": 'The assignee payload containing either the account ID or username.',
            "properties": {
              "accountId": {
                "type": 'string',
                "description": 'The account ID of the user to whom the issue will be assigned.',
              },
              "name": {
                "type": 'string',
                "description": 'The username of the user to whom the issue will be assigned.',
              },
            },
            "required": ['accountId'], // Use 'name' if accountId is not available
          },
        },
        "required": ['issue', 'assignee'],
      }
    },
  },
};

const jiraAddLabelTool = {
  "toolSpec": {
    "name": 'jiraAddLabelTool',
    "method": "PUT",
    "url": "/rest/api/3/issue/{{issue}}",
    "description": `Use this tool to add label to a Jira issue. Make user explicitly clear that only one label can be added per request. We need the Jira issue key and the label to be added. The payload should be formatted as follows:
    {
      "body": {
        "update": {
          "labels": [
            {
              "add": "<label>"
            }
          ]
        }
      }
    }
    Return the JSON object exactly as shown above, replacing <label> with the actual label to be added.`,
    "fields": ['body'],
    "inputSchema": {
      "json": {
        "type": 'object',
        "properties": {
          "body": {
            "update": {
              "type": 'object',
              "description": 'The payload containing the label to be added.',
              "properties": {
                "labels": {
                  "type": 'object',
                  "properties": {
                    "add": {
                      "type": 'string',
                      "description": 'The label to be added to the issue.',
                    },
                  },
                  "required": ['add'],
                },
              },
              "required": ['labels'],
            },
            "required": ['update'],
          },
          "issue": {
            "type": 'string',
            "description": 'The Jira issue key to which the labels will be added.',
          },
        },
        "required": ['issue', 'body'],
      }
    },
  },
};

const jiraRemoveLabelTool = {
  "toolSpec": {
    "name": 'jiraremoveLabelTool',
    "method": "PUT",
    "url": "/rest/api/3/issue/{{issue}}",
    "description": `Use this tool to add label to a Jira issue. Make user explicitly clear that only one label can be added per request. We need the Jira issue key and the label to be added. The payload should be formatted as follows:
    {
      "body": {
        "update": {
          "labels": [
            {
              "remove": "<label>"
            }
          ]
        }
      }
    }
    Return the JSON object exactly as shown above, replacing <label> with the actual label to be added.`,
    "fields": ['body'],
    "inputSchema": {
      "json": {
        "type": 'object',
        "properties": {
          "body": {
            "update": {
              "type": 'object',
              "description": 'The payload containing the label to be added.',
              "properties": {
                "labels": {
                  "type": 'object',
                  "properties": {
                    "remove": {
                      "type": 'string',
                      "description": 'The label to be removed from the issue.',
                    },
                  },
                  "required": ['remove'],
                },
              },
              "required": ['labels'],
            },
            "required": ['update'],
          },
          "issue": {
            "type": 'string',
            "description": 'The Jira issue key to which the labels will be removed from.',
          },
        },
        "required": ['issue', 'body'],
      }
    },
  },
};

const jirafetchPriorityTool = {
  "toolSpec": {
    "name": 'jirafetchPriorityTool',
    "method": "GET",
    "url": "/rest/api/3/priority",
    "description": `Use this tool to fetch the list of all available priorities in Jira. This can be used when the user asks to set or view the priority of an issue. The response will include the list of priorities and their corresponding IDs.`,
    "inputSchema": {
      "json": {
        "type": 'object',
        "properties": {},
        "required": [],
      }
    },
  },
};

const jiraSetPriorityTool = {
  "toolSpec": {
    "name": 'jiraSetPriorityTool',
    "method": "PUT",
    "url": "/rest/api/3/issue/{{issue}}",
    "description": `Use this tool to set the priority of a Jira issue. We need the Jira issue key and the priority ID to update the priority. This can be run only after jirafetchPriorityTool which will fetch all available priority and map the id of the one that users requests. The payload should be formatted as follows:
    {
      "body": {
        "fields": {
          "priority": {
            "id": "<priorityId>"
          }
        }
      }
    }
    Return the JSON object exactly as shown above, replacing <priorityId> with the actual priority ID.`,
    "fields": ['body'],
    "inputSchema": {
      "json": {
        "type": 'object',
        "properties": {
          "body": {
            "fields": {
              "type": 'object',
              "description": 'The payload containing the priority to be set.',
              "properties": {
                "priority": {
                  "type": 'object',
                  "description": 'The priority object containing the priority ID.',
                  "properties": {
                    "id": {
                      "type": 'string',
                      "description": 'The ID of the priority to be set.',
                    },
                  },
                  "required": ['id'],
                },
              },
              "required": ['priority'],
            },
          },
          "issue": {
            "type": 'string',
            "description": 'The Jira issue key for which the priority will be set.',
          },
        },
        "required": ['issue', 'body'],
      }
    },
  },
};

const jiraGetBoardIdTool = {
  "toolSpec": {
    "name": 'jiraGetBoardIdTool',
    "method": "GET",
    "url": "/rest/agile/1.0/board?projectKeyOrId={{project}}",
    "description": `Use this tool to fetch the board ID(s) for a given Jira project. We need the project key to retrieve the associated boards. The response will include details about the boards, such as their IDs and names.`,
    "inputSchema": {
      "json": {
        "type": 'object',
        "properties": {
          "project": {
            "type": 'string',
            "description": 'The jira project code to fetch jira issue types. ',
          },
        },
        "required": ['project'],
      }
    },
  },
};

const jiraGetActiveSprintTool = {
  "toolSpec": {
    "name": 'jiraGetActiveSprintTool',
    "method": "GET",
    "url": "/rest/agile/1.0/board/{{boardId}}/sprint?state=active",
    "description": `Use this tool to fetch the active sprint for a given Jira board. We need the board ID to retrieve the active sprint.  This can be run only after jiraGetBoardIdTool which will fetch the boardId of the project. The response will include details about the active sprint, such as its ID, name, and start/end dates.`,
    "inputSchema": {
      "json": {
        "type": 'object',
        "properties": {
          "boardId": {
            "type": 'string',
            "description": 'The ID of the Jira board for which to fetch the active sprint.',
          },
        },
        "required": ['boardId'],
      }
    },
  },
};

const jiraAddToSprintTool = {
  "toolSpec": {
    "name": 'jiraAddToSprintTool',
    "method": "POST",
    "url": "/rest/agile/1.0/sprint/{{sprintId}}/issue",
    "description": `Use this tool to add a Jira issue to the active sprint. This tool will:
    1. Extract the project ID from the Jira issue key. Logic: Extract the part of the issue key before the hyphen (e.g., 'ABC-123' -> 'ABC').
    2. Use jiraGetActiveSprintTool to find the active sprint for the project. jiraGetActiveSprintTool must be executed for this. jiraGetBoardIdTool must be executed before this. 
    3. Add the issue to the active sprint.
    The payload should be formatted as follows:
    {
      "body": {
        "issues": ["<issueKey>"]
      }
    }
    Return the JSON object exactly as shown above, replacing <issueKey> with the actual Jira issue key.`,
    "fields": ['body'],
    "inputSchema": {
      "json": {
        "type": 'object',
        "properties": {
          "body": {
            "issues": {
              "type": 'array',
              "description": 'The Jira issue key which needs to be added to sprint.',
            },
            "required": ['issues'],
          },
          "sprintId": {
            "type": 'string',
            "description": 'The ID of the active sprint to which the issue will be added.',
          },
        },
        "required": ['body', 'sprintId'],
      }
    },
  },
  "steps": [
    {
      "name": "extractProjectId",
      "description": "Extract the project ID from the Jira issue key.",
      "action": "parse",
      "input": "{{issueKey}}",
      "output": "projectId",
      "logic": "Extract the part of the issue key before the hyphen (e.g., 'ABC-123' -> 'ABC')."
    },
    {
      "name": "getActiveSprint",
      "description": "Fetch the active sprint for the project using jiraGetActiveSprintTool.",
      "action": "invokeTool",
      "tool": "jiraGetActiveSprintTool",
      "input": {
        "boardId": "{{boardId}}"
      },
      "output": "sprintId",
      "logic": "Retrieve the active sprint ID for the project."
    }
  ]
};

const jiraUpdateDescriptionTool = {
  "toolSpec": {
    "name": 'jiraUpdateDescriptionTool',
    "method": "PUT",
    "url": "/rest/api/3/issue/{{issue}}",
    "description": `Use this tool to update the description of a Jira issue. We need the Jira issue key and the new description to perform this action. The payload should be formatted as follows:
    {
      "body": {
        "fields": {
          "description": {
            "type": "doc",
            "version": 1,
            "content": [
              {
                "type": "paragraph",
                "content": [
                  {
                    "type": "text",
                    "text": "<newDescription>"
                  }
                ]
              }
            ]
          }
        }
      }
    }
    Return the JSON object exactly as shown above, replacing <newDescription> with the actual description to be updated.`,
    "fields": ['body'],
    "inputSchema": {
      "json": {
        "type": 'object',
        "properties": {
          "issue": {
            "type": 'string',
            "description": 'The Jira issue key for which the description will be updated.',
          },
          "body": {
            "type": 'object',
            "description": 'The payload containing the new description.',
            "properties": {
              "fields": {
                "type": 'object',
                "description": 'The fields to be updated in the issue.',
                "properties": {
                  "description": {
                    "type": 'string',
                    "description": `The new description to be set for the issue. This should be formatted as a JSON object with other fields in example given above.`,
                  },
                },
                "required": ['description'],
              },
            },
            "required": ['fields'],
          },
        },
        "required": ['issue', 'body'],
      }
    },
  },
};


export const jiraTools = [];
jiraTools.push(jiracommentTool);
jiraTools.push(jiracreateTool);
jiraTools.push(jiraschemaTool);
jiraTools.push(jiratypeTool);
jiraTools.push(jirafetchTool);
jiraTools.push(jirajqlTool);
jiraTools.push(fetchJiraTransitionsTool);
jiraTools.push(jiraTransitionsTool);
jiraTools.push(jiraFetchIssueLinkTypeTool);
jiraTools.push(jiraLinkIssueTool);
jiraTools.push(jiraGetWatcherTool);
jiraTools.push(jiraAssigneeTool);
jiraTools.push(jiraGetUserAccountTool);
jiraTools.push(jiraAddLabelTool);
jiraTools.push(jiraRemoveLabelTool);
jiraTools.push(jirafetchPriorityTool);
jiraTools.push(jiraSetPriorityTool);
jiraTools.push(jiraGetBoardIdTool);
jiraTools.push(jiraGetActiveSprintTool);
jiraTools.push(jiraAddToSprintTool);
jiraTools.push(jiraUpdateDescriptionTool);

export async function jiraAgentHandler(
  response,
  conversation,
  additionalParams,
) {
  logger.info('jiraAgentHandler input', { response, additionalParams });

  //read from parameter store and set jira params
  const paramsBase = additionalParams.teamId.toLowerCase();
  const jiraParams = await secMgr.getParameters([
    `/${paramsBase}/jiratoken`,
    `/${paramsBase}/jirauser`,
    `/${paramsBase}/jiradomain`,
  ]);
  jira.setParams(jiraParams);

  const responseContentBlocks = response.content;
  let toolResults = [];
  if (!responseContentBlocks) {
    throw new Error('No content blocks in response');
  }

  for (const contentBlock of response.content) {
    if (contentBlock["toolUse"]) {
      const toolUseBlock = contentBlock["toolUse"];
      let content = '';
      let tool = jiraTools.find(x => x.toolSpec.name === toolUseBlock.name)?.toolSpec;
      let input = toolUseBlock.input;
      fixToolUseBlockInput(input, tool);
      let options = jira.createAxiosOptions(tool.method, tool.url, input , tool.fields);
      console.log("Jira tool options: ", JSON.stringify(options));

      if (tool) {
        content = await jira.makeAxiosCall(options);
      } else {
        content = `This feature for Jira Agent is not supported by @swa yet.`;
      }

      if (typeof content === 'object') {
        content = JSON.stringify(content);
      }
      logger.info(`jira tool handler content: ${content}`);
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


function fixToolUseBlockInput(input, tool){
  if(tool.name === "jirajqlTool"){
    let jql = input["jql"];
    const arg = jql.substring(0, 4);
    if(arg !== "jql="){
      input["jql"] = `jql=${input["jql"]}`
    }
  }
}
