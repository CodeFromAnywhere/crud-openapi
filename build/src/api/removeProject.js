import { Redis } from "@upstash/redis";
import { getProjectDetails } from "../getProjectDetails.js";
import { removeEntireDatabase } from "../removeEntireDatabase.js";
import { getUpstashRedisDatabase } from "../upstashRedis.js";
export const removeProject = async (context) => {
    const { projectSlug, Authorization } = context;
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
    const { projectDetails } = await getProjectDetails(projectSlug);
    if (!projectDetails || projectDetails.adminAuthToken !== apiKey) {
        return {
            isSuccessful: false,
            status: 403,
            message: "Unauthorized",
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
    const details = await root.mget(projectDetails.databaseSlugs.map((databaseSlug) => `db_${databaseSlug}`));
    const databases = projectDetails.databaseSlugs.map((databaseSlug, index) => ({
        databaseSlug,
        details: details[index],
    }));
    // NB: When removing databases, also remove all database entries!
    // This does 4 API requests per database.
    await Promise.all(databases
        // NB: doublecheck for correct adminAuthToken
        .filter((item) => item.details?.adminAuthToken === apiKey)
        .map((item) => removeEntireDatabase({
        databaseSlug: item.databaseSlug,
        databaseDetails: item.details,
        root,
    })));
    await root.del(`project_${projectSlug}`);
    await root.srem(`projects_${apiKey}`, projectSlug);
    return { isSuccessful: true, message: "Project removed successfully" };
};
//# sourceMappingURL=removeProject.js.map