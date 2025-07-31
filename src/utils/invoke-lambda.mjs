import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";
const client = new LambdaClient({ region: "us-east-1", maxAttempts: 1 });
import logger from "../logger.mjs";
import service from "../services.mjs";

const asciiDecoder = new TextDecoder("ascii");

export default async function InvokeLambda(options) {
  let ob = {};
  ob.body = options.Payload;
  let input = {
    FunctionName: options.FunctionName,
    InvocationType: options.InvocationType || "RequestResponse",
    LogType: "None",
    Payload: JSON.stringify(ob),
  };

  logger.info(
    `Invoking  Lambda : `, input,
  );
  let command = new InvokeCommand(input);
  let response = await client.send(command);
  const data = asciiDecoder.decode(response.Payload);
  logger.info(`lambda response : ${data}`);
  return service.convertToJson(data);
}
