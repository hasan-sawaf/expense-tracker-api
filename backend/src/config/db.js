import mongoose from 'mongoose';
import 'colors';

const cache = globalThis._mongooseCache || { conn: null, promise: null };
globalThis._mongooseCache = cache;

export const connectDB = async () => {
    if (cache.conn && mongoose.connection.readyState === 1) {
        return cache.conn;
    }

    try {
        const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
        if (!mongoUri) {
            throw new Error('MONGO_URI (or MONGODB_URI) environment variable is missing');
        }

        if (!cache.promise) {
            cache.promise = mongoose.connect(mongoUri);
        }

        cache.conn = await cache.promise;
        console.log(`MongoDB connected: ${cache.conn.connection.host}`.cyan.underline);
        return cache.conn;
    } catch (error) {
        cache.promise = null;
        console.error(`Error: ${error.message}`.red.bold);
        if (process.env.VERCEL) {
            throw error;
        }
        process.exit(1);
    }
};
