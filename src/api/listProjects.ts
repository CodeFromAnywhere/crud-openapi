import { Endpoint } from "../client.js";
import { Redis } from "@upstash/redis";
import { getDatabaseDetails } from "../getDatabaseDetails.js";
import { AdminDetails, DbKey, ProjectDetails } from "../types.js";
import { notEmpty } from "from-anywhere";
import { getUpstashRedisDatabase } from "../upstashRedis.js";

export const listProjects: Endpoint<"listProjects"> = async (context) => {
  const { Authorization } = context;
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
    `admin_${apiKey}` satisfies DbKey,
  );

  const projectSlugs: string[] = await root.smembers(
    `projects_${apiKey}` satisfies DbKey,
  );

  if (projectSlugs.length === 0) {
    return {
      isSuccessful: false,
      status: 403,
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
