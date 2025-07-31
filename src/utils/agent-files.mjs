const files = {};
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
const S3client = new S3Client();
import * as fs from "fs";
import logger from "../logger.mjs";

files.saveDescription = async (input, fileId, user, instanceConfig) => {
  if (process.env["LOCAL"]) {
    fs.writeFileSync("local-files/" + fileId, JSON.stringify(input));
    return true;
  } else {
    const S3Input = {
      "Body": JSON.stringify(input),
      "Bucket": instanceConfig.S3Bucket,
      "Key": fileId
    };
    try {
      const command = new PutObjectCommand(S3Input);
      await S3client.send(command);
      logger.info("Description saved to S3: ", S3Input)
      return true
    } catch (e) {
      logger.error("Exception: Unable to save Agent Description to S3", e);
      return false
    }
  }
};

// Cache for agent descriptions to avoid repeated S3/file reads
const descriptionCache = new Map();
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes in milliseconds

files.getDescription = async (agent, user, instanceConfig) => {
  const cacheKey = agent.fileId;

  // Check if we have a valid cached version
  const cachedItem = descriptionCache.get(cacheKey);
  if (cachedItem && (Date.now() - cachedItem.timestamp) < CACHE_TTL) {
    logger.debug(`Cache hit for agent description: ${agent.agentName}`);
    return cachedItem.description;
  }

  let description = "";

  if (process.env["LOCAL"]) {
    try {
      const data = JSON.parse(fs.readFileSync("local-files/" + agent.fileId));
      description = data.description || "";
    } catch (e) {
      logger.error(`Error reading local file for agent ${agent.agentName}: ${e.message}`);
      description = "";
    }
  } else {
    const S3Input = {
      "Bucket": instanceConfig.S3Bucket,
      "Key": agent.fileId
    };
    try {
      const command = new GetObjectCommand(S3Input);
      const resp = await S3client.send(command);
      const data = JSON.parse(await resp.Body.transformToString() || "{}");
      description = data.description || "";

      logger.debug(`Fetched description for ${agent.agentName}, : ${description}`);
    } catch (e) {
      logger.error("Exception: Unable to get Agent Description from S3", e);
      return false
    }
  }

  // Store in cache
  descriptionCache.set(cacheKey, {
    description,
    timestamp: Date.now()
  });

  return description;
};

files.removeDescription = async (fileId, user, instanceConfig) => {
  if (process.env["LOCAL"]) {
    fs.unlinkSync("local-files/" + fileId);
    return true;
  } else {
    const S3Input = {
      "Bucket": instanceConfig.S3Bucket,
      "Key": fileId
    };
    try {
      const command = new DeleteObjectCommand(S3Input);
      await S3client.send(command);
      logger.info("Description removed from S3: ", S3Input)
      return true
    } catch (e) {
      logger.error("Exception: Unable to remove Agent Description from S3", e);
      return false
    }
  }
};

export default files;
