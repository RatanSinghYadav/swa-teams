import Slack from "./utils/slack-utils.mjs";
import secMgr from "./utils/sec-mgr.mjs";
import logger from "./logger.mjs";
import service from "./services.mjs";
import db from "./utils/db.mjs"

export default async function SwaHomeLoad(request, meta) {
    let ret = {
        statusCode: 200,
        body: "Success",
    };

    // Start config fetch
    const configPromise = db.fetchInstanceConfig(`${request.appId}_${request.teamId}`);
    // Secret prefetching to avoid blocking later
    const secretPromise = process.env["LOCAL"]
        ? Promise.resolve({ [request.appId + "_" + request.teamId]: process.env["SLACK_TOKEN"] })
        : secMgr.getSecrets("swa-slack-creds");

    const secrets = await secretPromise;
    Slack.configureClient(secrets[request.appId + "_" + request.teamId]);

    const userProfile = await Slack.getUserInfo(request.userId);
    request.email = userProfile?.email;
    request.userName = userProfile.email?.split("@")[0];
    logger.defaultMeta["email"] = userProfile?.email || "na";

    // Await config and do token validation
    const config = await configPromise;
    let instanceConfig = service.convertToJson(config["config"]);
    request.instanceConfig = instanceConfig;
    logger.info("Instance Config", config);

    let tokenCount = config["tokenCount"] || 0;
    logger.info(`Tokens Left: ${tokenCount}`);
    if (!tokenCount || tokenCount < 100) {
        await db.deleteStatById(`INTERACTIVE_${request.userId}_${request.teamId}_${request.appId}`, instanceConfig);
        return await ProcessRequest("insufficient_token", request)
    }

    let statsObj = service.formatStat(`INTERACTIVE_${request.userId}_${request.teamId}_${request.appId}`, meta, request);

    if (request.tab === "home" && !await db.getStatById(`INTERACTIVE_${request.userId}_${request.teamId}_${request.appId}`, instanceConfig)) {
        await ProcessRequest("initial_home_page", request);
        await db.insertStat(statsObj, instanceConfig);
    }

    return ret;
}

async function ProcessRequest(config, request) {
    let ret = {
        statusCode: 200,
    };
    let finaljson = {};
    if (typeof config === "string") {
        const jsonModule = await import(`./configs/${config}.json`, {
            assert: { type: "json" }
        });
        let json = jsonModule.default;
        finaljson = json.rules
    } else if (typeof config === "object") {
        // finaljson = config;
    }

    if (finaljson.static) {
        switch (finaljson.static.view_type) {
            case "home":
                ret.body = await Slack.publishView(service.fillTemplate(finaljson.static.value, request), request.userId);
                break;
            default:
                console.warn(`Unsupported view type: ${finaljson.view_type}`);
        }
    }

    return ret;
}
