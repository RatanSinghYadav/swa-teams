import logger from '../../logger.mjs';
import qb from './qb-actions.mjs';
import { ParticipantRole } from '@swatechnology/swa-multi-agent-orchestrator';
import auth from '../../utils/auth-utils.mjs';
import secMgr from '../../utils/sec-mgr.mjs';

//https://sandbox-quickbooks.api.intuit.com/v3/company/9341453916774427
const getAccountDetails = {
  "toolSpec": {
    "name": 'getAccountDetails',
    "method": "GET",
    "url": "/query?minorversion=75&query={{query}}",
    "description":
      'Use this tool to fetch details of a quickbooks account ',
    "inputSchema": {
      "json": {
        "type": 'object',
        "properties": {
          "query": {
            "type": 'string',
            "description": 'The quickbooks api query to fetch details of an account by its name ',
          },
        },
        "required": ['query'],
      }
    },
  },
};

const getVendorDetails = {
  "toolSpec": {
    "name": 'getVendorDetails',
    "method": "GET",
    "url": "/query?minorversion=75&query={{query}}",
    "description":
      'Use this tool to fetch details of a quickbooks vendor ',
    "inputSchema": {
      "json": {
        "type": 'object',
        "properties": {
          "query": {
            "type": 'string',
            "description": `The quickbooks api query to fetch details of an vendor by its name. sample query is : select * from vendor where displayname='TestVendor'  `,
          },
        },
        "required": ['query'],
      }
    },
  },
};


const createVendor = {
  "toolSpec": {
    "name": 'createVendor',
    "method": "POST",
    "url": "/vendor",
    "fields": ["vendorschema"],
    "description":
      'Use this tool to create a new vendor in quickbooks ',
    "inputSchema": {
      "json": {
        "type": 'object',
        "properties": {
          "vendorschema": {
            "type": 'string',
            "description": `The json object, for creating a new vendor in quickbooks. Convert this to string format. Fill up the schema with required fields for creating a vendor. Try to auto populate the schema from user input. ask user for more inputs if needed. 
            A sample schema is given below: Note that , all fields are not required.
              {
                "PrimaryEmailAddr": {
                  "Address": "dbradley@myemail.com"
                }, 
                "WebAddr": {
                  "URI": "http://DiannesAutoShop.com"
                }, 
                "PrimaryPhone": {
                  "FreeFormNumber": "(650) 555-2342"
                }, 
                "DisplayName": "Dianne's Auto Shop", 
                "Suffix": "Sr.", 
                "Title": "Ms.", 
                "Mobile": {
                  "FreeFormNumber": "(650) 555-2000"
                }, 
                "CompanyName": "Dianne's Auto Shop", 
                "BillAddr": {
                  "City": "Millbrae", 
                  "Country": "U.S.A", 
                  "Line3": "29834 Mustang Ave.", 
                  "Line2": "Dianne Bradley", 
                  "Line1": "Dianne's Auto Shop", 
                  "PostalCode": "94030", 
                  "CountrySubDivisionCode": "CA"
                }, 
                "GivenName": "Dianne", 
                "PrintOnCheckName": "Dianne's Auto Shop"
              } `,
          },
        },
        "required": ['vendorschema'],
      }
    },
  },
};

const createBill = {
  "toolSpec": {
    "name": 'createBill',
    "method": "POST",
    "url": "/bill?minorversion=75",
    "fields": ["billSchema"],
    "description":
      'Use this tool to create a new bill in quickbooks. This needs account and vendor details. So this can be run only after running getAccountDetails and  getVendorDetails',
    "inputSchema": {
      "json": {
        "type": 'object',
        "properties": {
          "billSchema": {
            "type": 'string',
            "description": `The json object, for creating a new bill in quickbooks. This needs the account and vendor details, so run those tools before filling up this schema. Convert this to string format. Fill up the schema with required fields for creating a vendor. Try to auto populate the schema from user input. ask user for more inputs if needed. 
            A sample schema is given below: Note that atleast one line item is needed.
            {
              "Line": [
                {
                  "DetailType": "AccountBasedExpenseLineDetail", 
                  "Amount": 200.0, 
                  "Id": "1", 
                  "AccountBasedExpenseLineDetail": {
                    "AccountRef": {
                      "value": "7"
                    }
                  }
                }
              ], 
              "VendorRef": {
                "value": "56"
              }
            } `,
          },
        },
        "required": ['billSchema'],
      }
    },
  },
};




export const qbTools = [];
qbTools.push(getAccountDetails);
qbTools.push(createVendor);
qbTools.push(getVendorDetails);
qbTools.push(createBill);

export async function qbAgentHandler(
  response,
  conversation,
  additionalParams,
) {
  logger.info('qbAgentHandler input', { response, additionalParams });

  //read from parameter store and set params
  const paramsBase = additionalParams.teamId.toLowerCase();
  const qbParams = {};
  const qbDomain = await secMgr.getParameter(`/${paramsBase}/qbdomain`)
  qbParams["qbdomain"] = qbDomain;

  const responseContentBlocks = response.content;
  let toolResults = [];
  if (!responseContentBlocks) {
    throw new Error('No content blocks in response');
  }

  for (const contentBlock of response.content) {
    if (contentBlock["toolUse"]) {
      const toolUseBlock = contentBlock["toolUse"];
      let content = '';
      let tool = qbTools.find(x => x.toolSpec.name === toolUseBlock.name)?.toolSpec;

      if (tool) {
        //Need to getToken. 
          let authResponse = await auth.getOauthToken("quickbooks", additionalParams.userId, additionalParams.channelId, additionalParams.teamId  )
          if(authResponse.status === "reauth"){
            logger.info("Needs user reauth to quickbooks.");
            content = "You need to reauthorize quickbooks. Please check your messages";
            let reauthResp = await auth.reauthUser("quickbooks", additionalParams.userId, additionalParams.channelId, additionalParams.teamId  );
            content = reauthResp.body;
          }else if(authResponse.status === "success"){
            qbParams["oauthToken"] = authResponse.token
            qb.setParams(qbParams);
            let options = qb.createAxiosOptions(tool.method, tool.url, toolUseBlock.input, tool.fields);
            content = await qb.makeAxiosCall(options);
          }else{
            content = "An error has occurred. Please try again";
          }
      } else {
        content = `This feature for quickbooks Agent is not supported by @swa yet.`;
      }

      if (typeof content === 'object') {
        content = JSON.stringify(content);
      }
      logger.info(`quickbooks tool handler content: ${content}`);
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
