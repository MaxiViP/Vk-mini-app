import { PrismaClient } from '@prisma/client'

let prisma

try {
	prisma = new PrismaClient()
} catch (error) {
	const reason = error instanceof Error ? error.message : 'Unknown Prisma init error'
	prisma = new Proxy(
		{},
		{
			get() {
				throw new Error(`Prisma client is not initialized. Run \"prisma generate\" first. ${reason}`)
			},
		},
	)
}

export default prisma
