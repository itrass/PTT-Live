/**
 * Logger.js
 * Système de logging centralisé avec niveaux configurables
 */

const LOG_LEVELS = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3,
  TRACE: 4
};

class Logger {
  constructor(category = 'default', level = 'INFO') {
    this.category = category;
    this.level = LOG_LEVELS[level] ?? LOG_LEVELS.INFO;
  }

  setLevel(level) {
    this.level = LOG_LEVELS[level] ?? LOG_LEVELS.INFO;
  }

  error(message, ...args) {
    if (this.level >= LOG_LEVELS.ERROR) {
      console.error(`[${this.category}] ❌`, message, ...args);
    }
  }

  warn(message, ...args) {
    if (this.level >= LOG_LEVELS.WARN) {
      console.warn(`[${this.category}] ⚠️ `, message, ...args);
    }
  }

  info(message, ...args) {
    if (this.level >= LOG_LEVELS.INFO) {
      console.log(`[${this.category}] ℹ️ `, message, ...args);
    }
  }

  success(message, ...args) {
    if (this.level >= LOG_LEVELS.INFO) {
      console.log(`[${this.category}] ✓`, message, ...args);
    }
  }

  debug(message, ...args) {
    if (this.level >= LOG_LEVELS.DEBUG) {
      console.log(`[${this.category}] 🔍`, message, ...args);
    }
  }

  trace(message, ...args) {
    if (this.level >= LOG_LEVELS.TRACE) {
      console.log(`[${this.category}] 🔬`, message, ...args);
    }
  }
}

// Configuration globale depuis env ou config
const globalLevel = process.env.LOG_LEVEL || 'INFO';

// Loggers par catégorie
const loggers = new Map();

export function getLogger(category) {
  if (!loggers.has(category)) {
    loggers.set(category, new Logger(category, globalLevel));
  }
  return loggers.get(category);
}

export function setGlobalLogLevel(level) {
  loggers.forEach(logger => logger.setLevel(level));
}

export default { getLogger, setGlobalLogLevel };
