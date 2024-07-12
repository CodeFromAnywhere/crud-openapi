import { Redis } from "@upstash/redis";
import { getDatabaseDetails } from "../../getDatabaseDetails.js";
import { embeddingsClient } from "../../embeddings.js";
export const remove = async (context) => {
    const { rowIds, databaseSlug, Authorization } = context;
    const { databaseDetails } = await getDatabaseDetails(databaseSlug);
    if (!databaseDetails) {
        return { isSuccessful: false, message: "Couldn't find database details" };
    }
    if (databaseDetails.authToken !== undefined &&
        databaseDetails.authToken !== "" &&
        Authorization !== `Bearer ${databaseDetails.authToken}`) {
        return { isSuccessful: false, message: "Unauthorized" };
    }
    if (rowIds === undefined || rowIds.length === 0) {
        return { isSuccessful: false, message: "Invalid inputs" };
    }
    const redis = new Redis({
        url: `https://${databaseDetails.endpoint}`,
        token: databaseDetails.rest_token,
    });
    databaseDetails.vectorIndexColumnDetails?.map((item) => {
        const { vectorRestUrl, vectorRestToken } = item;
        return embeddingsClient.deleteVector({
            vectorRestUrl,
            vectorRestToken,
            ids: rowIds,
        });
    });
    const deleteCount = await redis.del(...rowIds);
    return { isSuccessful: true, message: "Row(s) deleted", deleteCount };
};
//# sourceMappingURL=remove.js.map