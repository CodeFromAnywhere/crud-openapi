import { Redis } from "@upstash/redis";

import { Endpoint } from "../client.js";
import {
  AdminDetails,
  DatabaseDetails,
  DbKey,
  ProjectDetails,
} from "../types.js";
import {
  createUpstashRedisDatabase,
  getUpstashRedisDatabase,
} from "../upstashRedis.js";
import {
  generateRandomString,
  notEmpty,
  onlyUnique2,
  tryParseJson,
} from "edge-util";
import { JSONSchema7 } from "json-schema";
import { rootDatabaseName } from "../state.js";
import { embeddingsClient } from "../embeddings.js";
import { getAdminUserId } from "../getAdminUserId.js";

export const upsertDatabase: Endpoint<"upsertDatabase"> = async (context) => {
  const {
    databaseSlug,
    schemaString,
    region,
    openaiApiKey,
    vectorIndexColumns,
    Authorization,
    authToken,
    isUserLevelSeparationEnabled,
  } = context;

  const userId = await getAdminUserId(Authorization);

  if (!userId) {
    return { isSuccessful: false, message: "Unauthorized", status: 403 };
  }

  // comes from .env
  const useRootDatabase = process.env["USE_ROOT_DATABASE"]
    ? process.env["USE_ROOT_DATABASE"] !== "false"
    : false;

  const rootUpstashApiKey = process.env["X_UPSTASH_API_KEY"];
  const rootUpstashEmail = process.env["X_UPSTASH_EMAIL"];
  const rootUpstashDatabaseId = process.env["X_UPSTASH_ROOT_DATABASE_ID"];

  if (!rootUpstashApiKey || !rootUpstashEmail || !rootUpstashDatabaseId) {
    return {
      isSuccessful: false,
      message: "Please provide your upstash details environment variables",
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
      message: "Couldn't get root database details",
    };
  }

  // now we have root-db

  const root = new Redis({
    url: `https://${rootDatabaseDetails.endpoint}`,
    token: rootDatabaseDetails.rest_token,
  });

  let admin: AdminDetails | null = await root.get(
    `admin_${userId}` satisfies DbKey,
  );

  if (!admin) {
    const newAdmin: AdminDetails = {
      currentProjectSlug: generateRandomString(16),
    };

    await root.set(
      `admin_${userId}` satisfies DbKey,
      newAdmin satisfies AdminDetails,
    );

    await root.sadd(
      `projects_${userId}` satisfies DbKey,
      newAdmin.currentProjectSlug,
    );

    admin = newAdmin;
  }

  if (!admin) {
    //should be created by now
    return { isSuccessful: false, message: "Couldn't find user" };
  }

  let previousDatabaseDetails: DatabaseDetails | null = await root.get(
    `db_${databaseSlug}` satisfies DbKey,
  );

  const schema = tryParseJson<JSONSchema7>(schemaString);

  if (!schema) {
    return { isSuccessful: false, message: "Invalid Schema" };
  }

  if (
    ["root", rootDatabaseName].includes(databaseSlug) ||
    (previousDatabaseDetails &&
      !!previousDatabaseDetails.adminUserId &&
      previousDatabaseDetails.adminUserId !== userId)
  ) {
    return {
      isSuccessful: false,
      status: 403,
      message:
        "A database with this name already exists, and you're not authorized to edit it.",
    };
  }

  let databaseDetails: DatabaseDetails | null = null;

  if (!previousDatabaseDetails) {
    // creates indexes
    const vectorIndexColumnDetails =
      vectorIndexColumns && rootUpstashApiKey && rootUpstashEmail
        ? (
            await Promise.all(
              vectorIndexColumns.map(async (item) => {
                const index = await embeddingsClient.createIndex({
                  upstashApiKey: rootUpstashApiKey,
                  upstashEmail: rootUpstashEmail,
                  dimension_count: item.dimension_count,
                  region: item.region,
                  similarity_function: item.similarity_function,
                  vectorIndexName: `${databaseSlug}-${item.propertyKey}`,
                });
                if (!index) {
                  return;
                }
                const { propertyKey } = item;
                const { endpoint, token, name } = index;
                return {
                  propertyKey,
                  vectorRestToken: token,
                  vectorRestUrl: `https://${endpoint}`,
                  dimensions: item.dimension_count,
                  model: item.model,
                };
              }),
            )
          ).filter(notEmpty)
        : undefined;

    //create if we couldn't find it before

    let created: { isSuccessful: boolean; message: string; result?: any } = {
      result: undefined,
      isSuccessful: true,
      message: "Using root",
    };

    if (!useRootDatabase) {
      created = await createUpstashRedisDatabase({
        upstashApiKey: rootUpstashApiKey,
        upstashEmail: rootUpstashEmail,
        name: `db_${databaseSlug}`,
        region,
      });

      if (!created.result) {
        return {
          isSuccessful: false,
          message: `Upstash result failed: ${created.message}`,
        };
      }
    }

    const realAuthToken = authToken || generateRandomString(64);

    databaseDetails = {
      projectSlug: admin.currentProjectSlug,
      openaiApiKey,
      vectorIndexColumnDetails,
      adminUserId: userId,
      upstashApiKey: rootUpstashApiKey,
      upstashEmail: rootUpstashEmail,
      authToken: realAuthToken,
      schema,
      isUserLevelSeparationEnabled: isUserLevelSeparationEnabled || false,
      // Set the correct DB Details!
      database_id: useRootDatabase
        ? rootDatabaseDetails.database_id
        : created?.result.database_id,
      endpoint: useRootDatabase
        ? rootDatabaseDetails.endpoint
        : created?.result.endpoint,
      rest_token: useRootDatabase
        ? rootDatabaseDetails.rest_token
        : created?.result.rest_token,
    };

    console.log(`creating`, { databaseDetails });
  } else {
    databaseDetails = {
      ...previousDatabaseDetails,
      upstashApiKey: rootUpstashApiKey,
      upstashEmail: rootUpstashEmail,
      schema,
      authToken: authToken || previousDatabaseDetails.authToken,
    };
  }

  // re-set the database details
  await root.set(`db_${databaseSlug}` satisfies DbKey, databaseDetails);
  // add database slug to project

  const projectKey = `project_${admin.currentProjectSlug}` satisfies DbKey;
  const projectDetails = (await root.get(projectKey)) as ProjectDetails | null;
  await root.set(projectKey, {
    ...(projectDetails || {
      description: `Project ${databaseSlug}`,
      adminUserId: userId,
    }),
    databaseSlugs: (projectDetails?.databaseSlugs || [])
      .concat(databaseSlug)
      .filter(onlyUnique2()),
  } satisfies ProjectDetails);

  // add the project, if not already
  // TODO: can later be removed
  await root.sadd(
    `projects_${databaseDetails.adminUserId}`,
    admin.currentProjectSlug,
  );

  return {
    isSuccessful: true,
    message: "Database created",
    adminUserId: databaseDetails.adminUserId,
    databaseSlug,
    openapiUrl:
      "https://data.actionschema.com/" + databaseSlug + "/openapi.json",
    projectOpenapiUrl:
      "https://data.actionschema.com/project/" +
      admin.currentProjectSlug +
      "/openapi.json",
  };
};
