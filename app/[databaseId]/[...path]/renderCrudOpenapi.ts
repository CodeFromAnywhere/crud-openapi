import { Endpoint, ResponseType } from "@/client";
import { getDatabaseDetails } from "@/getDatabaseDetails";
import { O, removeOptionalKeysFromObjectStrings } from "from-anywhere";
import { OpenapiSchemaObject } from "from-anywhere/types";
import { JSONSchema7 } from "json-schema";
import { SchemaObject } from "openapi-typescript";
import { resolveSchemaRecursive } from "openapi-util/build/resolveSchemaRecursive";
import openapi from "../../../public/openapi.json";
import { OpenapiDocument } from "openapi-util";

export const withoutProperties = (
  schema: OpenapiSchemaObject,
  properties: string[],
) => {
  if (!schema.properties) {
    return schema as SchemaObject;
  }

  const newProperties = removeOptionalKeysFromObjectStrings(
    schema.properties,
    properties,
  );

  return {
    ...schema,
    properties: newProperties as JSONSchema7["properties"],
  } as SchemaObject;
};

export const replaceRefs = (schema: OpenapiSchemaObject, refs: O) => {
  const string = JSON.stringify(schema);

  const finalString = Object.keys(refs).reduce((newString, refKey) => {
    const json = JSON.stringify(refs[refKey]);
    const jsonWithoutBrackets = json.slice(1, json.length - 1);

    // NB: no spaces!
    return newString.replaceAll(`"$ref":"${refKey}"`, jsonWithoutBrackets);
  }, string);

  // console.log(finalString);
  return JSON.parse(finalString) as any;
};

/** Renames all refs to #/components/schemas/ instead of #/definitions */
export const renameRefs = (schema: SchemaObject | undefined) => {
  if (!schema) {
    return schema;
  }
  const string = JSON.stringify(schema);

  const newString = string.replaceAll(
    `"$ref":"#/definitions/`,
    `"$ref":"#/components/schemas/`,
  );

  return JSON.parse(newString) as any;
};

/**
Should make a CRUD openapi from the schema fetched from database id
*/

export const renderCrudOpenapi: Endpoint<"renderCrudOpenapi"> = async (
  context,
) => {
  const { databaseSlug } = context;
  // comes from path parameter
  const { databaseDetails } = await getDatabaseDetails(databaseSlug);

  // NB: no auth needed for this endpoint.

  if (!databaseDetails) {
    return {
      isSuccessful: false,
      message: "Couldn't find database details for db " + databaseSlug,
    };
  }

  const crudPaths = {
    "/create": removeOptionalKeysFromObjectStrings(
      openapi.paths["/{databaseSlug}/create"],
      ["parameters"],
    ),

    "/read": removeOptionalKeysFromObjectStrings(
      openapi.paths["/{databaseSlug}/read"],
      ["parameters"],
    ),
    "/update": removeOptionalKeysFromObjectStrings(
      openapi.paths["/{databaseSlug}/update"],
      ["parameters"],
    ),
    "/remove": removeOptionalKeysFromObjectStrings(
      openapi.paths["/{databaseSlug}/remove"],
      ["parameters"],
    ),
  };

  const origin =
    process.env.NODE_ENV === "development"
      ? "http://localhost:3000"
      : "https://data.actionschema.com";

  const improved = {
    ...openapi,
    components: {
      ...openapi.components,
      schemas: {
        ...openapi.components.schemas,
        ModelItem: databaseDetails.schema,
      },
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "Bearer",
          description: "Your authToken should be provided",
        },
      },
    },
    paths: crudPaths,
    info: { title: `${databaseSlug} CRUD`, version: "1.0", description: "" },
    servers: [{ url: `${origin}/${databaseSlug}` }],
    security: [{ bearerAuth: [] }],
  };

  const dereferenced = (await resolveSchemaRecursive({
    document: improved,
    shouldDereference: true,
  })) as typeof improved | undefined;

  if (!dereferenced) {
    return { isSuccessful: false, message: "Dereferencing didn't work out" };
  }

  const componentsWithoutSchemas = removeOptionalKeysFromObjectStrings(
    dereferenced.components,
    ["schemas"],
  ) as OpenapiDocument["components"];

  return {
    ...dereferenced,
    components: componentsWithoutSchemas,
    // bit ugly but couldn't find another way
  } as unknown as ResponseType<"renderCrudOpenapi">;
};
