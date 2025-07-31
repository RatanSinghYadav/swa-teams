const qb = {};
import axios from 'axios';
// const BASE_URL = `/rest/api/3/issue`;
import logger from '../../logger.mjs';
import service from '../../services.mjs';

let OAUTH_TOKEN;
let QB_DOMAIN;


qb.setParams = (params) => {
  OAUTH_TOKEN = params["oauthToken"];
  QB_DOMAIN = params["qbdomain"];
}

qb.getOauthToken = ()=>{
  if(OAUTH_TOKEN && OAUTH_TOKEN.trim().length > 0){
    return OAUTH_TOKEN;
  }else{
    return false;
  }
}


qb.createAxiosOptions = (method, url, data, fields) => {
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

  options.url = `${QB_DOMAIN}${url}`;

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

qb.makeAxiosCall = async (options) => {
  try {
    logger.info(`Making qb call: ${options.method} ${options.url}: ${options.data}`);
    let response = await axios(options);
    if (response.data || response.status < 210) {
      logger.info("QB Action: response received. ");
      return response.data || "success";
    }
  } catch (e) {
    if (e.response) {
      logger.error(
        `QB Action: Error in API call: ${e.response.status}`, e.response.data
      );
    } else {
      logger.error('QB Action: Error in API call : Unknown:', e);
    }
    console.log(e);
  }
  return "Error accessing QB API. Please contact administrator"
}


export default qb;
