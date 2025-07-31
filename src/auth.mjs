const auth = {};
import { createHmac } from "node:crypto";
import timeSafeCompare from "tsscmp";
import { stringify as qsStringify } from "qs";
import logger from "./logger.mjs";

auth.authenticate = (event) => {
  try {
    console.log("event headers", JSON.stringify(event.headers));
    let ts =
      event.headers &&
      (event.headers["x-slack-request-timestamp"] ||
        event.headers["X-Slack-Request-Timestamp"]);
    let sign =
      event.headers &&
      (event.headers["x-slack-signature"] ||
        event.headers["X-Slack-Signature"]);
    let retryCount =
      (event.headers &&
        (event.headers["x-slack-retry-num"] ||
          event.headers["X-Slack-Retry-Num"])) ||
      event.retry_attempt;

    if (retryCount > 0) {
      console.log("Repeat request");
      return false;
    } else if (event.envelope_id && event.envelope_id.length > 0 && process.env.STAGE !== "prod") {
      console.log("envelope-id present. socket mode running");
      return true;
    } else if (!ts || !sign) {
      console.log("Invalid request");
      return false;
    }
    //localtesting.
    if (process.env["DEBUG_AUTH"]) {
      return true;
    }

    const [v, h] = sign.split("=");
    const hmac = createHmac("sha256", process.env.SWA_SLACK_SIGNING_SECRET);
    let qsBody = qsStringify(event.body, { format: 'RFC1738' }) || event.body;
    console.log("qsBody", qsBody);
    hmac.update(`${v}:${ts}:${qsBody}`);
    let output = timeSafeCompare(h, hmac.digest("hex"));
    console.log("tsscmp output", output);
    if (!output) {
      logger.error("Exception: Slack Signature mismatch");
      return false
    } else {
      return true
    }
  } catch (e) {
    console.error(e);
    return false;
  }
};

export default auth;
