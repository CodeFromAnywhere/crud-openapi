import {
  OpenapiDocument,
  OpenapiOperationObject,
  OpenapiPathItemObject,
  ReferenceObject,
  resolveReferenceBrowser,
} from "openapi-util";
import { Json, mergeObjectsArray, notEmpty, onlyUnique2 } from "edge-util";
import { tryValidateSchema, makeOpenapiPathRouter } from "openapi-util";
import { JSONSchemaType } from "ajv";
import { JSONSchema7 } from "json-schema";

import { create } from "../src/api/create.js";
import { read } from "../src/api/read.js";
import { update } from "../src/api/update.js";
import { remove } from "../src/api/remove.js";
import { getCrudOpenapi } from "../src/api/getCrudOpenapi.js";
import { getSchema } from "../src/api/getSchema.js";
import { listDatabases } from "../src/api/listDatabases.js";
import { getOpenapi } from "../src/api/getOpenapi.js";
import { setCurrentProject } from "../src/api/setCurrentProject.js";
import { listProjects } from "../src/api/listProjects.js";
import { removeProject } from "../src/api/removeProject.js";
import { removeDatabase } from "../src/api/removeDatabase.js";

import openapi from "../src/openapi.json" assert { type: "json" };
import crudOpenapi from "../src/crud-openapi.json" assert { type: "json" };

import { resolveReferenceOrContinue } from "../src/resolveReferenceOrContinue.js";
import { upsertDatabase } from "../src/api/upsertDatabase.js";
import { getProjectOpenapi } from "../src/api/getProjectOpenapi.js";
import { getProjectSchema } from "../src/api/getProjectSchema.js";

/** Retreives the right body from the request based on the openapi and operation */
export const getRequestOperationBody = async (
  openapi: OpenapiDocument,
  operation: OpenapiOperationObject,
  documentLocation: string,
  request: Request,
) => {
  if (!operation.requestBody) {
    return { schema: undefined, data: undefined };
  }

  // TODO: it's better if this is cached!
  const requestBody = await resolveReferenceBrowser(
    operation.requestBody,
    openapi,
    documentLocation,
  );

  const mediaTypes = requestBody?.content
    ? Object.keys(requestBody.content)
    : [];
  const headerMediaType = request.headers.get("content-type");
  const mediaType =
    headerMediaType && mediaTypes.includes(headerMediaType)
      ? headerMediaType
      : (mediaTypes[0] as string | undefined);

  if (!mediaType) {
    return { schema: undefined, data: undefined };
  }

  const schemaOrReference = requestBody?.content?.[mediaType]?.schema as
    | JSONSchema7
    | ReferenceObject
    | undefined;

  const schema = await resolveReferenceBrowser(
    schemaOrReference,
    openapi,
    documentLocation,
  );

  try {
    // TODO: maybe there are more mediatypes that can be parsed like yaml and xml
    const data =
      mediaType === "application/json"
        ? await request.json()
        : mediaType === "plain/text"
        ? await request.text()
        : undefined;

    return { schema: schema as JSONSchema7, data };
  } catch (e) {
    return { schema, data: undefined };
  }
};

/** Retrieves an object of the query params belonging to an endpoint */
export const getUrlQueryParams = (
  url: string,
  permittedQueryKeys: string[],
) => {
  try {
    const urlQueryParams = Array.from(
      new URL(url).searchParams.entries(),
    ).reduce(
      (previous, [key, value]) => ({ ...previous, [key]: value }),
      {} as { [key: string]: string },
    );

    const queryParams = permittedQueryKeys.reduce(
      (previous, key) =>
        urlQueryParams[key]
          ? { ...previous, [key]: urlQueryParams[key] }
          : previous,
      {} as { [key: string]: string },
    );

    return queryParams;
  } catch (e) {
    return {};
  }
};

/**
 * Function that turns a regular function into an endpoint. If the function is available in the OpenAPI (with function name equalling the operationId), the input will be validated.
 *
 * NB: You can use this anywhere you want your openapi to be available. Usually it's in a catch-all route, but you can also use other next routing in case you need to have pages in some cases.
 */
export const resolveOpenapiAppRequest = async (
  request: Request,
  method: string,
  config: {
    /** If given, must be a parameterName. If so, will also try to match against all paths with the prefix removed, giving the parameter to the body. Useful when you want to serve openapis that are subsets of the main server implementation
     */
    prefixParameterName?: string;

    openapi: OpenapiDocument;
    functions: {
      [functionName: string]: (jsonBody: any) => any | Promise<any>;
    };
  },
) => {
  const { functions, openapi, prefixParameterName } = config;
  const defaultHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
  if (method === "options") {
    // preflight stuff
    return new Response("OK", {
      status: 200,
      headers: {
        ...defaultHeaders,
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  }

  const url = request.url;
  const urlObject = new URL(url);
  const requestPathname = urlObject.pathname;
  // basePath may depend on openapi server
  const serverUrl = openapi.servers?.[0]?.url || urlObject.origin;
  const serverBasePathname = new URL(serverUrl).pathname;
  const restPathname = "/" + requestPathname.slice(serverBasePathname.length);

  const router = makeOpenapiPathRouter(openapi);

  const regularMatch = router(restPathname);

  //////// NB: Logic to also resolve if theres a prefix /////////
  const chunks = restPathname.split("/");
  const prefixParameterValue = prefixParameterName ? chunks[1] : undefined;
  const pathnameWithoutPrefix = prefixParameterName
    ? "/" + restPathname.split("/").slice(2).join("/")
    : undefined;
  const prefixMatch = pathnameWithoutPrefix
    ? router(pathnameWithoutPrefix)
    : undefined;
  const match = (regularMatch || prefixMatch)!;
  const prefixParamPart =
    prefixParameterName && prefixParameterValue && prefixMatch
      ? { [prefixParameterName]: prefixParameterValue }
      : {};
  /////////

  // console.log({
  //   chunks,
  //   prefixParameterName,
  //   prefixParameterValue,
  //   pathnameWithoutPrefix,
  //   prefixMatch,
  //   match,
  //   prefixParamPart,
  // });

  if (!regularMatch && !prefixMatch) {
    const allowedMethods = [
      "get",
      "post",
      "put",
      "patch",
      "delete",
      "head",
      "options",
    ];
    const methods = mergeObjectsArray(
      Object.keys(openapi.paths).map((path) => {
        return {
          [path]: Object.keys((openapi as any).paths[path]).filter((method) =>
            allowedMethods.includes(method),
          ),
        };
      }),
    );

    return new Response(
      JSON.stringify({
        message: `Invalid method.`,
        methods,
        restPathname,
      }),
      {
        status: 404,
        headers: { ...defaultHeaders, "Content-Type": "application/json" },
      },
    );
  }

  const pathItem = (openapi.paths as any)?.[
    match.path
  ] as OpenapiPathItemObject;

  const operation = pathItem?.[method as keyof typeof pathItem] as
    | OpenapiOperationObject
    | undefined;

  if (!operation) {
    return new Response("Endpoint not found", {
      status: 404,
      headers: defaultHeaders,
    });
  }

  const parameters = pathItem.parameters || operation?.parameters;

  const documentLocation = undefined;

  const resolvedParameters = parameters
    ? await Promise.all(
        parameters.map((parameter) => {
          return resolveReferenceOrContinue(
            parameter,
            openapi,
            documentLocation,
          );
        }),
      )
    : undefined;

  const parameterHeaderKeys =
    resolvedParameters
      ?.filter((item) => item?.in === "header")
      .map((x) => x!.name) || [];

  const parameterQueryKeys =
    resolvedParameters
      ?.filter((item) => item?.in === "query")
      .map((x) => x!.name) || [];

  const headerKeys = parameterHeaderKeys
    //always add Authorization as a possible header
    .concat("Authorization")
    .filter(onlyUnique2());

  const headers = mergeObjectsArray(
    headerKeys
      .map((key) => {
        const value = request.headers.get(key);
        if (value === null) {
          // this could be a problem if it were required
          return;
        }
        return { [key]: value };
      })
      .filter(notEmpty),
  );

  const queryParams = getUrlQueryParams(request.url, parameterQueryKeys);

  const { schema, data } = await getRequestOperationBody(
    openapi,
    operation,
    "",
    request,
  );

  // console.log({
  //   url,
  //   data,
  //   requestPathname,
  //   match,
  //   headers,
  //   queryParams,
  // });

  const errors = schema
    ? tryValidateSchema({ schema: schema as JSONSchemaType<any>, data })
    : undefined;

  // validate this schema and return early if it fails

  if (errors && errors.length > 0) {
    console.log({ errors });
    return new Response(
      JSON.stringify({
        isSuccessful: false,
        message:
          "Invalid Input\n\n" +
          errors
            .map((x) => x.instancePath + x.schemaPath + ": " + x.message)
            .join(" \n\n"),
        // errors,
      }),
      {
        status: 422,
        headers: { ...defaultHeaders, "Content-Type": "application/json" },
      },
    );
  }

  const operationId =
    operation.operationId || match.path.slice(1) + "=" + method;

  const fn = functions[operationId];

  if (!fn) {
    return new Response("Function not found", {
      status: 404,
      headers: defaultHeaders,
    });
  }

  const pathParams =
    Object.keys(match.context).length > 0 ? match.context : undefined;

  // TODO: Add proper typing for this if we ever accept non-object bodies in our openapi spec
  const body =
    typeof data === "object" && !Array.isArray(data) && data !== null
      ? data
      : data === undefined
      ? undefined
      : { body: data };

  const context = {
    ...body,
    ...pathParams,
    ...queryParams,
    ...headers,
    ...prefixParamPart,
  };

  // console.log({ parameters, resolvedParameters, headers, context });

  // valid! Let's execute.
  const resultJson = await fn(context);

  if (typeof resultJson === undefined) {
    return new Response("No response", { status: 404 });
  }

  return new Response(JSON.stringify(resultJson), {
    status: 200,
    headers: { ...defaultHeaders, "Content-Type": "application/json" },
  });
};

const fullOpenapi = {
  ...openapi,
  paths: { ...openapi.paths, ...crudOpenapi.paths },
  components: {
    ...openapi.components,
    schemas: {
      ...openapi.components.schemas,
      ...crudOpenapi.components.schemas,
    },
  },
};

/** function creator to DRY */
const getHandler = (method: string) => (request: Request) => {
  return resolveOpenapiAppRequest(request, method, {
    openapi: fullOpenapi as OpenapiDocument,
    prefixParameterName: "databaseSlug",
    functions: {
      create,
      read,
      update,
      remove,
      getOpenapi,
      getProjectOpenapi,
      getProjectSchema,
      getCrudOpenapi,
      upsertDatabase,
      getSchema,
      listDatabases,
      setCurrentProject,
      listProjects,
      removeProject,
      removeDatabase,
    },
  });
};

export const GET = getHandler("get");
export const POST = getHandler("post");
export const PUT = getHandler("put");
export const PATCH = getHandler("patch");
export const DELETE = getHandler("delete");
export const HEAD = getHandler("head");
export const OPTIONS = getHandler("options");
