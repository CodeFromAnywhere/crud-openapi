import { getSubsetFromObject, objectMapSync } from "from-anywhere";
import { upstashRedisGetMultiple, upstashRedisSetItems, } from "../upstashRedis.js";
import { getDatabaseDetails } from "../getDatabaseDetails.js";
import { upsertIndexVectors } from "../embeddings.js";
import { getCrudOperationAuthorized } from "../getCrudOperationAuthorized.js";
/**
Update an item in a specified row in a table.

- applies authorization
- validates the partial item against the schema to ensure its correct

 */
export const update = async (context) => {
    const { id, databaseSlug, partialItem, Authorization } = context;
    const apiKey = Authorization?.slice("Bearer ".length);
    if (!databaseSlug) {
        return { isSuccessful: false, message: "please provide a slug" };
    }
    const { databaseDetails } = await getDatabaseDetails(databaseSlug);
    if (!databaseDetails) {
        return { isSuccessful: false, message: "Couldn't find database details" };
    }
    if (!(await getCrudOperationAuthorized(databaseDetails, Authorization))) {
        return { isSuccessful: false, message: "Unauthorized" };
    }
    if (id === undefined || !partialItem) {
        return { isSuccessful: false, message: "Invalid inputs", status: 422 };
    }
    const partialItemPropertyKeys = Object.keys(partialItem);
    if (!databaseDetails.schema.properties) {
        return { isSuccessful: false, message: "Schema not found" };
    }
    const redisRestToken = databaseDetails.rest_token;
    const redisRestUrl = databaseDetails.endpoint;
    const [item] = await upstashRedisGetMultiple({
        redisRestToken,
        redisRestUrl,
        keys: [id],
    });
    const schemaPropertyKeys = Object.keys(databaseDetails.schema.properties);
    const validPartialItemPropertyKeys = partialItemPropertyKeys.filter((k) => schemaPropertyKeys.includes(k));
    const prunedPartialItem = getSubsetFromObject(partialItem, validPartialItemPropertyKeys);
    // Ensure all values that are null become undefined
    const castedPartialItem = objectMapSync(prunedPartialItem, (key, value) => (value === null ? undefined : value));
    const mergedItem = { ...(item || {}), ...castedPartialItem };
    const authSuffix = databaseDetails.isUserLevelSeparationEnabled
        ? `_${apiKey}`
        : "";
    const baseKey = `db_${databaseSlug}${authSuffix}_`;
    await upstashRedisSetItems({
        baseKey,
        redisRestToken,
        redisRestUrl,
        items: { [id]: mergedItem },
    });
    // also update vectors if they're there
    await upsertIndexVectors(databaseDetails, id, castedPartialItem);
    return { isSuccessful: true, message: "Updated" };
};
//# sourceMappingURL=update.js.map