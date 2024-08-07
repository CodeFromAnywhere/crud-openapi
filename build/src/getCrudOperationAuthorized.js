import * as client from "./sdk/client.js";
/**
 Auth can be gained either from:

 - admin Authorization token
 - model-wide Authorization token
 - user Authorization token
*/
export const getCrudOperationAuthorized = async (databaseDetails, Authorization) => {
    if (!Authorization) {
        return false;
    }
    if (!databaseDetails) {
        return false;
    }
    if (process.env.ADMIN_SECRET &&
        Authorization === `Bearer ${process.env.ADMIN_SECRET}`) {
        // allow system admin
        return true;
    }
    if (databaseDetails.adminAuthToken &&
        Authorization === `Bearer ${databaseDetails.adminAuthToken}`) {
        // allow db manager admin
        return true;
    }
    if (databaseDetails.authToken &&
        Authorization === `Bearer ${databaseDetails.authToken}`) {
        // allow model admin
        return true;
    }
    const permission = await client.auth("permission", undefined, {
        headers: { Authorization },
    });
    if (!permission) {
        return false;
    }
    //allow entire project for admin as well as user
    const allowedScopes = [`admin`, `user`];
    if (allowedScopes.find((scope) => permission?.scope?.split(" ").find((s) => s === scope))) {
        // allow oauth2 user
        return true;
    }
    return false;
};
//# sourceMappingURL=getCrudOperationAuthorized.js.map