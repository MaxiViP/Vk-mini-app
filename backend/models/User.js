// models/User.js
import mongoose from 'mongoose'

const UserSchema = new mongoose.Schema({
	vkId: { type: String, required: true, unique: true },
	firstName: String,
	lastName: String,
	avatar: String,
	balance: { type: Number, default: 0 }, // деньги/баллы
	requestsLeft: { type: Number, default: 50 }, // количество оставшихся запросов
})

export const User = mongoose.model('User', UserSchema)
