import bridge from '@vkontakte/vk-bridge'

export const initVK = async () => {
	await bridge.send('VKWebAppInit')
}

export const getUser = async () => {
	try {
		return await bridge.send('VKWebAppGetUserInfo')
	} catch {
		return null
	}
}
