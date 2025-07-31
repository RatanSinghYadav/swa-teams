const service = {};

service.convertToJson = (obj) => {
  try {
    return JSON.parse(obj);
  } catch (e) { // eslint-disable-line
    return obj;
  }
};

service.parseRequest = (body) => {
  let ob = {};
  let e = body.event;
  ob.appId = body.api_app_id || "";
  ob.teamId = body.team_id || "";
  ob.userId = e.user || "";
  ob.ts = e.ts || "";
  ob.channelId = e.channel || "";
  ob.eventTs = e.event_ts || "";
  ob.threadTs = e.thread_ts || "";
  ob.tab = e.tab || "";
  ob.type = e.type || "";
  let text = e.text || "";
  let arr = text.split(/<@\d*\w*>/);

  if (e["channel_type"] === "im") {
    ob.isDirect = true;
  }

  let cleanedText = text.replace(/<@\d*\w*>/g, '').trim();
  ob.query = cleanedText.replace(/\r?\n|\r/g, " ");
  if (!ob.query || ob.query.length < 1) {
    ob.query = "hi";
  }
  return ob;
};

service.formatStat = (uid, meta, request, modelStats) => {
  let obj = {};
  obj.statsId = uid;
  obj.requestId = meta.awsRequestId;
  obj.timeStamp = Date.now();
  obj.workspaceId = request.teamId;
  obj.stats = modelStats;

  //meta : depends on source medium
  obj.meta = {};
  obj.meta.channelId = request.channelId;
  obj.meta.userId = request.userId;
  obj.meta.eventTs = request.eventTs;
  obj.meta.threadTs = request.ts;
  obj.meta.teamId = request.teamId;
  obj.meta.appId = request.appId;

  return obj;
}

service.cleanOutpuText = (outputText) => {
  //bedrock thinking tag
  let txt = outputText.replace(/<thinking>.*?<\/thinking>/g, '');
  return txt;
}

service.fillTemplate = (json, obj) => {
  // Recursively replace ${var} in all string values of the JSON
  function templateReplace(item) {
    if (typeof item === "string") {
      return item.replace(/\$\{([^}]+)\}/g, (_, key) => obj[key.trim()] ?? "");
    } else if (Array.isArray(item)) {
      return item.map(templateReplace);
    } else if (typeof item === "object" && item !== null) {
      const res = {};
      for (const k in item) res[k] = templateReplace(item[k]);
      return res;
    }
    return item;
  }
  try {
    return templateReplace(json);
  } catch (e) { // eslint-disable-line
    return json;
  }
};

export default service;
