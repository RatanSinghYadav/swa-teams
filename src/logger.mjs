import winston from "winston";
import ser from "./services.mjs";

const MAX_LOG_SIZE = 5 * 1024; // 250KB (leaving room for metadata)

const truncate = winston.format((info) => {
    if (info.message && info.message.length > MAX_LOG_SIZE) {
        info.message = info.message.substring(0, MAX_LOG_SIZE) + '...[TRUNCATED]';
    }
    return info;
});

const formatCause = winston.format(info => {
    if (!("cause" in info)) return info;

    const cause = info.cause;

    if (typeof info.cause === "object" && typeof cause.toJSON === "function") {
        info.cause = cause.toJSON();
        return info;
    }

    if (cause instanceof Error) {
        info.cause = {
            name: cause.name,
            message: cause.message,
            stack: cause.stack,
            ...cause,
        };
    }
    return info;
});

const formatOrder = winston.format(info => {
    for (const key in info) {
        info[key] = ser.convertToJson(info[key]);
    }
    const { level, message, timestamp, ...meta } = info;
    return { level, message, timestamp, ...meta }
});


// const syslogColors = {
//     debug: "rainbow",
//     info: "cyan",
//     notice: "white",
//     warning: "yellow",
//     error: "bold red",
//     crit: "inverse yellow",
//     alert: "bold inverse red",
//     emerg: "bold inverse magenta",
// };


const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || "info",
    format: winston.format.combine(
        truncate(),
        winston.format.timestamp(),
        winston.format.errors({ cause: true, stack: true }),
        formatCause(),
        formatOrder(),
        winston.format.json({ deterministic: true }),
    ),
    transports: [new winston.transports.Console()],
    exceptionHandlers: [new winston.transports.Console()],
    rejectionHandlers: [new winston.transports.Console()],
});

export default logger;
