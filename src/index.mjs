import service from "./services.mjs";
import auth from "./auth.mjs";
import logger from "./logger.mjs";
import Orchestrator from "./multi-agent-orchestrator.mjs";
import SwaHomeLoad from "./home-event.mjs";

export const handler = async (event, context) => {

  let response = {
    statusCode: 200,
    body: "",
  };

  // Set minimal logger metadata
  logger.defaultMeta = {
    awsRequestId: context.awsRequestId || "local",
    service: "swa-bot",
    stage: process.env.STAGE || "local",
  };

  try {
    // Quick validation checks
    let body = event.payload || service.convertToJson(event.body);
    if (body?.challenge) {
      return {
        statusCode: 200,
        body: body.challenge
      };
    } else if (body.event?.bot_id) {
      return {
        statusCode: 200,
        body: "skipping bot message"
      };
    } else if (body?.event?.message?.subtype === "assistant_app_thread" || body?.event?.subtype === "message_changed") {
      return {
        statusCode: 200,
        body: "skipping as invalid message event"
      };
    } else if (body?.event?.type === "app_home_opened" && body?.event?.tab !== "home") {
      return {
        statusCode: 200,
        body: "skipping messages tab opened event from bot"
      };
    }

    // Authenticate request
    if (!auth.authenticate(event)) {
      return {
        statusCode: 401,
        body: "Unauthorized"
      };
    }

    // Parse request with minimal logging
    if (process.env.NODE_ENV !== 'production') {
      logger.info("Request received", body);
    }

    const request = service.parseRequest(body);

    // Set essential metadata for logging
    logger.defaultMeta.teamId = request.teamId;
    logger.defaultMeta.appId = request.appId;
    logger.defaultMeta.channelId = request.channelId;
    logger.defaultMeta.user = request.userId;

    if (body?.event?.type === "app_home_opened" && body?.event?.tab === "home") {
      return await SwaHomeLoad(request, logger.defaultMeta);
    }

    // Process the request
    response = await Orchestrator(request, logger.defaultMeta);
  } catch (e) {
    logger.error(`Exception: `, e);
    response.statusCode = 500;
    response.body = "Error processing request";
  }

  return response;
};
