const microsoft = {};
import axios from 'axios';
// const BASE_URL = `/rest/api/3/issue`;
import logger from '../../logger.mjs';
import service from '../../services.mjs';

let OAUTH_TOKEN;
let MICROSOFT_DOMAIN;


microsoft.setParams = (params) => {
  OAUTH_TOKEN = params["oauthToken"];
  MICROSOFT_DOMAIN = params["microsoftdomain"];
}

microsoft.getOauthToken = ()=>{
  if(OAUTH_TOKEN && OAUTH_TOKEN.trim().length > 0){
    return OAUTH_TOKEN;
  }else{
    return false;
  }
}

microsoft.createSendEmailOptions = (url, data) => {
  let options = {
    method: "POST",
    headers: {
      Accept: 'application/json',
      "Content-Type": 'application/json',
      "Authorization": `Bearer ${OAUTH_TOKEN}`
    },
  };
  let email = {};
  let message = {};
  message["subject"] = data["subject"];
  message.body = {};
  message.body["contentType"] = data["contenttype"];
  message.body["content"] = data["content"];

  //to
  let toRecipients = data["to"] ? data["to"].split(","): [];
  if(toRecipients.length > 0){
    message.toRecipients = []
    for(let t of toRecipients){
      message.toRecipients.push({
        "emailAddress": {
          "address": t.trim()
        }
      })
    }
  }

  //cc
  let ccRecipients = data["cc"] ? data["cc"].split(","): [];
  if(ccRecipients.length > 0){
    message.ccRecipients = []
    for(let c of ccRecipients){
      message.toRecipients.push({
        "emailAddress": {
          "address": c.trim()
        }
      })
    }
  }
  email.message = message;

  options.url = `${MICROSOFT_DOMAIN}${url}`;
  options.data = JSON.stringify(email);
  return options;
}


microsoft.createAxiosOptions = (method, url, data, fields) => {
  let inputData = service.convertToJson(JSON.stringify(data));
  let options = {
    method: method,
    headers: {
      Accept: 'application/json',
      "Content-Type": 'application/json',
      "Authorization": `Bearer ${OAUTH_TOKEN}`
    },
  };

  if (url?.includes("{{")) {
    for (const key in inputData) {
      url = url.replace(`{{${key}}}`, inputData[key]);
    }
  }

  options.url = `${MICROSOFT_DOMAIN}${url}`;

  if (method != "GET" && data && fields) {
    let bodyValue = {};
    for (const key of fields) {
      let jsonValue = service.convertToJson(inputData);
      bodyValue = Object.assign(bodyValue, typeof jsonValue === "object" && jsonValue[key] && typeof service.convertToJson(jsonValue[key]) === "object" ? service.convertToJson(jsonValue[key]) : { [key]: inputData[key] });
    }
    options.data = JSON.stringify(bodyValue);
  }

  return options;
}

microsoft.makeAxiosCall = async (options) => {
  try {
    logger.info(`Making microsoft api  call: ${options.method} ${options.url}: ${options.data}`);
    let response = await axios(options);
    if (response.data || response.status < 210) {
      logger.info("Microsoft Action: response received. ");
      return response.data || "success";
    }
  } catch (e) {
    if (e.response) {
      logger.error(
        `Microsoft Action: Error in API call: ${e.response.status}`, e.response.data
      );
    } else {
      logger.error('Microsoft Action: Error in API call : Unknown:', e);
    }
    console.log(e);
  }
  return "Error accessing Microsoft API. Please contact administrator"
}


export default microsoft;
