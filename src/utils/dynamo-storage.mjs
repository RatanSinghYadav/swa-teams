import { DynamoDbChatStorage } from "@swatechnology/swa-multi-agent-orchestrator";

const region = "us-east-1";
const TTL_DURATION = 3600; // in seconds
const dynamoStorage = {};
dynamoStorage.createStorage = (tb) => {
  const tableName = tb || process.env["STORAGE_TABLE"];
  return new DynamoDbChatStorage(
    tableName,
    region,
    "timestamp",
    TTL_DURATION,
    false
  );
}
export default dynamoStorage;
