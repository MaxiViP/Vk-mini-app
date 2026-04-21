export const patchMethod = (target, key, implementation) => {
	const original = target[key]
	target[key] = implementation
	return () => {
		target[key] = original
	}
}

export const patchValue = (target, key, value) => {
	const original = target[key]
	target[key] = value
	return () => {
		target[key] = original
	}
}

export const restoreAll = restores => {
	for (const restore of restores.reverse()) {
		restore()
	}
}
