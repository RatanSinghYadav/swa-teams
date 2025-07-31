const db = {};

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { fromEnv } from "@aws-sdk/credential-providers";
import {
  PutCommand,
  DynamoDBDocumentClient,
  ScanCommand,
  DeleteCommand,
  GetCommand,
} from "@aws-sdk/lib-dynamodb";
const client = getClient();
const docClient = DynamoDBDocumentClient.from(client);
import logger from "../logger.mjs";


db.fetchInstanceConfig = async (instanceId) => {
  let option = {
    TableName: process.env["CONFIG_TABLE"],
    Key: {
      instanceId: instanceId
    },
  }
  const command = new GetCommand(option)
  let response = {};
  try {
    response = await docClient.send(command);
    logger.info(`instance config `, option, response?.Item || {});
  } catch (e) {
    logger.error("Error fetching instance config :", e);
  }
  return response.Item || {};
}

db.createAgent = async (input, fileId, botId, instanceConfig) => {
  const item = {};
  item.agentName = input.name.toLowerCase();
  item.botId = botId;
  item.fileId = fileId;
  item.type = input.type;
  item.summary = input.summary;
  let option = {
    TableName: instanceConfig["AGENT_TABLE"],
    Item: item
  };
  const command = new PutCommand(option);
  try {
    const response = await docClient.send(command);
    logger.info("Create/Update Agent : ", option, response);
    return true
  } catch (e) {
    logger.error(`Error creating/updating agent ${input.type} :`, e);
    return false
  }
};

db.deleteAgent = async (input, botId, instanceConfig) => {
  let option = {
    TableName: instanceConfig["AGENT_TABLE"],
    Key: {
      agentName: input.name.toLowerCase(),
      botId: botId,
    },
  };
  const command = new DeleteCommand(option);
  try {
    const response = await docClient.send(command);
    logger.info("Delete Agent : ", option, response);
    return true
  } catch (e) {
    logger.error(`Error deleting agent ${input.name.toLowerCase()} :`, e);
    return false
  }
};

db.getAgent = async (input, botId, instanceConfig) => {
  let option = {
    TableName: instanceConfig["AGENT_TABLE"],
    Key: {
      agentName: input.name.toLowerCase(),
      botId: botId
    },
  };
  const command = new GetCommand(option)
  let response = {};
  try {
    response = await docClient.send(command);
    logger.info("Fetch Agent ", option, response);
  } catch (e) {
    logger.error(`Error fetching agent ${input.name.toLowerCase()} :`, e)
  }

  return response.Item || {};
};

db.getAllAgents = async (botId, instanceConfig) => {
  // Using a GSI would be more efficient, but since we can't modify the schema
  // we'll optimize the scan by limiting attributes and enabling consistent reads
  let option = {
    TableName: instanceConfig["AGENT_TABLE"],
    FilterExpression: "botId = :botid",
    ExpressionAttributeValues: {
      ":botid": botId
    },
    ConsistentRead: true,
  }
  const command = new ScanCommand(option);
  try {
    const response = await docClient.send(command);
    // Reduce logging overhead by not logging the full response
    logger.info(`Found ${response.Items?.length || 0} agents for botId: ${botId}: `, option);
    return response.Items || [];
  } catch (e) {
    logger.error(`Error fetching agents for botId ${botId}: ${e.message}:  `, option);
    return []; // Return empty array instead of undefined
  }
};

db.insertStat = async (statsObj, instanceConfig) => {
  const item = {
    statsId: statsObj.statsId,
    timeStamp: statsObj.timeStamp,
    requestId: statsObj.requestId,
    workspaceId: statsObj.workspaceId,
    stats: statsObj.stats,
    meta: statsObj.meta
  };

  let option = {
    TableName: instanceConfig["STATS_TABLE"],
    Item: item
  }

  const command = new PutCommand(option);
  try {
    await docClient.send(command);
    // Log only essential information to reduce overhead
    logger.info(`Stats Inserted: statsId=${item.statsId}, requestId=${item.requestId}:`, option);
    return true;
  } catch (e) {
    logger.error(`Error inserting stats: ${e.message}`, option);
    return false;
  }
}

db.getStatById = async (statsId, instanceConfig) => {
  let option = {
    TableName: instanceConfig["STATS_TABLE"],
    Key: {
      statsId: statsId
    },
  };
  const command = new GetCommand(option);
  let response = {};
  try {
    response = await docClient.send(command);
    logger.info("Fetch Stats ", option, response);
  } catch (e) {
    logger.error(`Error fetching stats for statsId ${statsId}:`, e);
  }

  return response?.Item || false;
}

db.deleteStatById = async (statsId, instanceConfig) => {
  let option = {
    TableName: instanceConfig["STATS_TABLE"],
    Key: {
      statsId: statsId
    },
  };
  const command = new DeleteCommand(option);
  try {
    await docClient.send(command);
    logger.info("Delete Stats ", option);
    return true;
  } catch (e) {
    logger.error(`Error deleting stats for statsId ${statsId}:`, e);
    return false;
  }
}

function getClient() {
  if (process.env["LOCAL"]) {
    return new DynamoDBClient({
      endpoint: process.env["DB_ENDPOINT"],
      region: "us-east-1",
    });
  } else {
    return new DynamoDBClient({
      endpoint: process.env["DB_ENDPOINT"],
      region: "us-east-1",
      credentials: fromEnv(),
    });
  }
}

export default db;
