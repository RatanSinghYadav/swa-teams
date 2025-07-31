"use strict";

let secMgr = {};
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";
import { SSMClient, GetParameterCommand, GetParametersCommand } from "@aws-sdk/client-ssm"
import logger from "../logger.mjs";

// Cache for secrets to avoid repeated API calls
const secretsCache = new Map();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour in milliseconds

const paramsCache = new Map();

// Create client only once
const secClient = new SecretsManagerClient({ region: process.env.REGION || "us-east-1" });
const ssmClient = new SSMClient({ region: process.env.REGION || "us-east-1" });

secMgr.getSecrets = async (secretId) => {
  // Check cache first
  const cachedSecret = secretsCache.get(secretId);
  if (cachedSecret && (Date.now() - cachedSecret.timestamp) < CACHE_TTL) {
    logger.debug(`Using cached secret for ${secretId}`);
    return cachedSecret.value;
  }

  const secCommand = new GetSecretValueCommand({ SecretId: secretId });
  try {
    const response = await secClient.send(secCommand);
    const secretValue = JSON.parse(response.SecretString);

    // Store in cache
    secretsCache.set(secretId, {
      value: secretValue,
      timestamp: Date.now()
    });

    return secretValue;
  } catch (error) {
    logger.error(`Error fetching secret ${secretId}: ${error.message}`);
    throw error;
  }
};

//Fetches single parameter under a path
secMgr.getParameter = async (parameterName) => {
  const cachedParameter = paramsCache.get(parameterName);
  if (cachedParameter && (Date.now() - cachedParameter.timestamp) < CACHE_TTL) {
    logger.debug(`Using cached secret for ${parameterName}`);
    return cachedParameter.value;
  }
  try {
    const command = new GetParameterCommand({
      Name: parameterName,
      WithDecryption: true,
    });

    const response = await ssmClient.send(command);
    // Store in cache
    paramsCache.set(parameterName, {
      value: response.Parameter.Value,
      timestamp: Date.now()
    });
    return response.Parameter.Value;
  } catch (error) {
    logger.error("Error fetching parameter:", error);
    throw error;
  }
}

/**
 * Fetchs multiple parameters under a path and returns a map. Use it for less than 5 parameters.
 */
secMgr.getParameters = async (parameters, cache_key) => {
  const cachedParameter = paramsCache.get(cache_key);
  if (cachedParameter && (Date.now() - cachedParameter.timestamp) < CACHE_TTL) {
    logger.debug(`Using cached secret for ${cache_key}`);
    return cachedParameter.value;
  }
  try {
    const command = new GetParametersCommand({
      Names: parameters,
      WithDecryption: true,
    });

    const response = await ssmClient.send(command);
    const configMap = {};
    response.Parameters.forEach(param => {
      const key = param.Name.split("/").pop();
      configMap[key] = param.Value;
    });
    // Store in cache
    paramsCache.set(cache_key, {
      value: configMap,
      timestamp: Date.now()
    });
    return configMap;
  } catch (error) {
    logger.error("Error fetching parameter:", error);
    throw error;
  }
}



export default secMgr;
