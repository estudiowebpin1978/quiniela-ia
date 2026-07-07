import winston from "winston";
import DailyRotateFile from "winston-daily-rotate-file";

const logFormat = winston.format.combine(
  winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

const fileTransport = new DailyRotateFile({
  filename: "logs/quiniela-ia-%DATE%.log",
  datePattern: "YYYY-MM-DD",
  zippedArchive: true,
  maxSize: "20m",
  maxFiles: "14d",
});

const consoleTransport = new winston.transports.Console({
  format: winston.format.combine(
    winston.format.colorize(),
    winston.format.printf(
      ({ timestamp, level, message, ...meta }) => {
        const msg = `${timestamp} [${level}]: ${message}`;
        return Object.keys(meta).length ? `${msg} ${JSON.stringify(meta)}` : msg;
      }
    )
  ),
});

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: logFormat,
  transports: [fileTransport, consoleTransport],
  exitOnError: false,
});

export default logger;