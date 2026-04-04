
export const sendMessageStream = async (
	message: string,
	modelId: string,
	history: any[],
	onChunk: (text: string) => void,
	onDone: () => void,
) => {
	const res = await fetch('http://localhost:3000/api/chat', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({ message, modelId, history }),
	})

	const reader = res.body!.getReader()
	const decoder = new TextDecoder()

	let buffer = ''

	while (true) {
		const { done, value } = await reader.read()
		if (done) break

		buffer += decoder.decode(value)

		const parts = buffer.split('\n\n')
		buffer = parts.pop() || ''

		for (const part of parts) {
			if (part.startsWith('data: ')) {
				const json = part.replace('data: ', '')

				if (json === '[DONE]') {
					onDone()
					return
				}

				const data = JSON.parse(json)

				if (data.content) {
					onChunk(data.content)
				}

				if (data.done) {
					onDone()
				}
			}
		}
	}
}
