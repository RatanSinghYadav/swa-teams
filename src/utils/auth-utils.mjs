const auth = {};
import service from "../services.mjs";
import InvokeLambda from "./invoke-lambda.mjs";

auth.getOauthToken = async (provider, userId, channelId,teamId ) => {
    const options = {};
    let ob = {}
    ob.provider = provider;
    ob.userId = userId;
    ob.channelId = channelId;
    ob.teamId = teamId;
    options.Payload = ob;
    options.FunctionName = process.env["OAUTH_GENERATOR"]+"-"+process.env["STAGE"];
    let lambdaRes =  await InvokeLambda(options)
    let respObj = lambdaRes.body ? service.convertToJson(lambdaRes.body) : {};
    return respObj;
}

auth.reauthUser = async(provider, userId, channelId,teamId) => {
    let ob = {};
    ob.action = "initiate_auth";
    ob.provider = provider;
    ob.userId = userId;
    ob.channelId = channelId;
    ob.teamId = teamId;
    const options = {};
    options.Payload = ob;
    options.FunctionName = process.env["OAUTH_HANDLER"]+"-"+process.env["STAGE"];
    let lambdaRes = await InvokeLambda(options);
    return service.convertToJson(lambdaRes);
}


export default auth;