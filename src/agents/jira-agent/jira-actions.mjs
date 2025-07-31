const jira = {};
import axios from 'axios';
// const BASE_URL = `/rest/api/3/issue`;
import logger from '../../logger.mjs';
import service from '../../services.mjs';

let JIRA_TOKEN = "";

//https://swatech.atlassian.net
let JIRA_DOMAIN = "";

let JIRA_USER = "";

jira.setParams = (params) => {
  JIRA_TOKEN = params["jiratoken"];
  JIRA_USER = params["jirauser"];
  JIRA_DOMAIN = params["jiradomain"];
}

jira.createAxiosOptions = (method, url, data, fields) => {
  let inputData = service.convertToJson(JSON.stringify(data));
  let options = {
    method: method,
    auth: {
      username: JIRA_USER,
      password: JIRA_TOKEN,
    },
    headers: {
      Accept: 'application/json',
      "Content-Type": 'application/json'
    },
  };

  if (url?.includes("{{")) {
    for (const key in inputData) {
      url = url.replace(`{{${key}}}`, inputData[key]);
    }
  }

  options.url = `${JIRA_DOMAIN}${url}`;

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

jira.makeAxiosCall = async (options) => {
  try {
    logger.info(`Making jira call: ${options.method} ${options.url}: ${options.data}`);
    let response = await axios(options);
    if (response.data || response.status < 210) {
      logger.info("Jira Action: response received. ");
      return response.data || "success";
    }
  } catch (e) {
    if (e.response) {
      logger.error(
        `Jira Action: Error in API call: ${e.response.status}`, e.response.data
      );
    } else {
      logger.error('Jira Action: Error in API call : Unknown:', e);
    }
    console.log(e);
  }
  return "Error accessing Jira API. Please contact administrator"
}

export default jira;
