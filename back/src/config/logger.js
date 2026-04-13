import env from './env.js'

const levels = {
	error: 0,
	warn: 1,
	info: 2,
	debug: 3,
}

const activeLevel = levels[env.logLevel] ?? levels.info

const shouldLog = level => levels[level] <= activeLevel

const format = (level, message, meta) => {
	const timestamp = new Date().toISOString()
	const payload = meta ? ` ${JSON.stringify(meta)}` : ''
	return `[${timestamp}] ${level.toUpperCase()} ${message}${payload}`
}

const createLogger = (context = {}) => ({
	child: additionalContext => createLogger({ ...context, ...additionalContext }),
	error: (message, meta) => logger.error(message, { ...context, ...meta }),
	warn: (message, meta) => logger.warn(message, { ...context, ...meta }),
	info: (message, meta) => logger.info(message, { ...context, ...meta }),
	debug: (message, meta) => logger.debug(message, { ...context, ...meta }),
})

const logger = {
	error(message, meta) {
		if (shouldLog('error')) console.error(format('error', message, meta))
	},
	warn(message, meta) {
		if (shouldLog('warn')) console.warn(format('warn', message, meta))
	},
	info(message, meta) {
		if (shouldLog('info')) console.log(format('info', message, meta))
	},
	debug(message, meta) {
		if (shouldLog('debug')) console.log(format('debug', message, meta))
	},
	createChild: createLogger,
}

export default logger
