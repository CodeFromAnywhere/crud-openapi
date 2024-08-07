import { Redis } from "@upstash/redis";
import { removeEntireDatabase } from "../removeEntireDatabase.js";
import { getUpstashRedisDatabase } from "../upstashRedis.js";
export const removeDatabase = async (context) => {
    const { databaseSlug, Authorization } = context;
    const apiKey = Authorization?.slice("Bearer ".length);
    if (!apiKey || apiKey.length < 64) {
        return { isSuccessful: false, message: "Unauthorized", status: 403 };
    }
    const rootUpstashApiKey = process.env["X_UPSTASH_API_KEY"];
    const rootUpstashEmail = process.env["X_UPSTASH_EMAIL"];
    const rootUpstashDatabaseId = process.env["X_UPSTASH_ROOT_DATABASE_ID"];
    if (!rootUpstashApiKey || !rootUpstashEmail || !rootUpstashDatabaseId) {
        return {
            isSuccessful: false,
            message: "Missing environment variables",
        };
    }
    const rootDatabaseDetails = await getUpstashRedisDatabase({
        upstashEmail: rootUpstashEmail,
        databaseId: rootUpstashDatabaseId,
        upstashApiKey: rootUpstashApiKey,
    });
    if (!rootDatabaseDetails) {
        return {
            isSuccessful: false,
            message: "Couldn't find root database details",
        };
    }
    const root = new Redis({
        url: `https://${rootDatabaseDetails.endpoint}`,
        token: rootDatabaseDetails.rest_token,
    });
    const databaseDetails = (await root.get(`db_${databaseSlug}`));
    if (!databaseDetails || databaseDetails.adminAuthToken !== apiKey) {
        return {
            isSuccessful: false,
            message: "Unauthorized or database not found",
            status: 403,
        };
    }
    const result = await removeEntireDatabase({
        root,
        databaseSlug,
        databaseDetails,
    });
    console.log(result);
    return { isSuccessful: true, message: "Database removed successfully" };
};
//# sourceMappingURL=removeDatabase.js.map