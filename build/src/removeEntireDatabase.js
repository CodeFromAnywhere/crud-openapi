import { getUpstashRedisRangeKeys } from "./upstashRedis.js";
/**
Deletes an entire dbs and everything in it:

- root:db_{slug}
- root:project_{slug}.databaseSlugs:string[]
- database:db_{databaseSlug}_*

This does 4 API requests per database.
*/
export const removeEntireDatabase = async (context) => {
    const { databaseDetails, databaseSlug, root } = context;
    if (!databaseDetails) {
        console.log("found no details for ", databaseSlug);
        return;
    }
    const useRootDatabase = process.env["USE_ROOT_DATABASE"]
        ? process.env["USE_ROOT_DATABASE"] !== "false"
        : false;
    if (!useRootDatabase) {
        // delete actual db
    }
    const baseKey = `db_${databaseSlug}_`;
    const keys = await getUpstashRedisRangeKeys({
        redisRestToken: databaseDetails.rest_token,
        redisRestUrl: databaseDetails.endpoint,
        baseKey,
    });
    // Delete all rows
    const deletedCount = await root.del(...keys);
    await root.del(`db_${databaseSlug}`);
    const projectDetails = await root.get(`project_${databaseDetails.projectSlug}`);
    if (projectDetails) {
        await root.set(`project_${databaseDetails.projectSlug}`, {
            ...projectDetails,
            databaseSlugs: projectDetails.databaseSlugs.filter((x) => x !== databaseSlug),
        });
    }
    // Remove vector indexes if they exist
    if (databaseDetails.vectorIndexColumnDetails) {
        for (const indexDetail of databaseDetails.vectorIndexColumnDetails) {
            // TODO: implement this
            //   await embeddingsClient.deleteIndex({
            //     upstashApiKey: rootUpstashApiKey,
            //     upstashEmail: rootUpstashEmail,
            //     vectorIndexName: `${databaseSlug}-${indexDetail.propertyKey}`,
            //   });
        }
    }
    return { isSuccessful: true, message: "Deleted: " + databaseSlug };
};
//# sourceMappingURL=removeEntireDatabase.js.map