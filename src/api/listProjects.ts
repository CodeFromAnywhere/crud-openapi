import { Endpoint } from "../client.js";
import { Redis } from "@upstash/redis";
import { AdminDetails, DbKey, ProjectDetails } from "../types.js";
import { notEmpty } from "edge-util";
import { getUpstashRedisDatabase } from "../upstashRedis.js";
import { getAdminUserId } from "../getAdminUserId.js";

export const listProjects: Endpoint<"listProjects"> = async (context) => {
  const { Authorization } = context;
  const userId = await getAdminUserId(Authorization);

  if (!userId) {
    return { isSuccessful: false, message: "Unauthorized", status: 403 };
  }

  const rootUpstashApiKey = process.env["X_UPSTASH_API_KEY"];
  const rootUpstashEmail = process.env["X_UPSTASH_EMAIL"];
  const rootUpstashDatabaseId = process.env["X_UPSTASH_ROOT_DATABASE_ID"];

  if (!rootUpstashApiKey || !rootUpstashEmail || !rootUpstashDatabaseId) {
    return {
      isSuccessful: false,
      status: 404,
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
      status: 404,
      message: "Couldn't find root database details",
    };
  }

  const root = new Redis({
    url: `https://${rootDatabaseDetails.endpoint}`,
    token: rootDatabaseDetails.rest_token,
  });

  const admin: AdminDetails | null = await root.get(
    `admin_${userId}` satisfies DbKey,
  );

  const projectSlugs: string[] = await root.smembers(
    `projects_${userId}` satisfies DbKey,
  );

  if (projectSlugs.length === 0) {
    return {
      isSuccessful: false,
      projects: [],
      message: "No projects",
    };
  }

  const projectKeys = projectSlugs.map((s) => `project_${s}` satisfies DbKey);

  const projects = (await root.mget(...projectKeys))
    .map((item, index) => {
      const typed = item as ProjectDetails | null;

      if (!typed) {
        return;
      }
      return {
        description: typed?.description,
        databaseSlugs: typed?.databaseSlugs,
        projectSlug: projectSlugs[index],
      };
    })
    .filter(notEmpty);

  return {
    isSuccessful: true,
    message: "Projects retrieved successfully",
    projects,
    currentProjectSlug: admin?.currentProjectSlug,
  };
};
