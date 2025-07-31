const token = {};
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import logger from "../logger.mjs"

const client = new SQSClient({ region: "us-east-1", });

token.pushToSQS = async (statsObj) => {
    try {
        const options = {};
        options.QueueUrl = process.env["TOKEN_QUEUE"];
        options.MessageBody = JSON.stringify(statsObj);
        const command = new SendMessageCommand(options);
        const response = await client.send(command);
        logger.info("Token message sent: ", response);
    } catch (e) {
        logger.error("Exception: Error sending to token queue", e);
    }
}

export default token;