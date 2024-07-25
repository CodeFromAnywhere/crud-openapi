export interface paths {
    "/read": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["read"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/create": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/remove": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["remove"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/update": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["update"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        /** @description To be replaced with the actual model item */
        ModelItem: {
            [key: string]: unknown;
        };
        CreateContext: {
            databaseSlug?: string;
            items: components["schemas"]["ModelItem"][];
        };
        CreateResponse: {
            isSuccessful: boolean;
            message: string;
            /** @description The rowIds created */
            result?: string[];
        };
        ReadResponse: {
            isSuccessful: boolean;
            message: string;
            $schema?: string;
            items?: {
                [key: string]: components["schemas"]["ModelItem"] | undefined;
            };
            schema?: {
                [key: string]: unknown;
            };
            canWrite?: boolean;
            hasMore?: boolean;
        };
        ReadContext: {
            databaseSlug?: string;
            search?: string;
            vectorSearch?: {
                propertyKey: string;
                input: string;
                topK: number;
                minimumSimilarity: number;
            };
            rowIds?: string[];
            startFromIndex?: number;
            maxRows?: number;
            filter?: components["schemas"]["Filter"][];
            sort?: components["schemas"]["Sort"][];
            objectParameterKeys?: string[];
            ignoreObjectParameterKeys?: string[];
        };
        Sort: {
            /** @enum {string} */
            sortDirection: "ascending" | "descending";
            objectParameterKey: string;
        };
        Filter: {
            /** @enum {string} */
            operator: "equal" | "notEqual" | "endsWith" | "startsWith" | "includes" | "includesLetters" | "greaterThan" | "lessThan" | "greaterThanOrEqual" | "lessThanOrEqual" | "isIncludedIn" | "isFalsy" | "isTruthy";
            value: string;
            objectParameterKey: string;
        };
        UpdateContext: {
            databaseSlug?: string;
            /** @description The id (indexed key) of the item to update. Update that functions as upsert. If the id didn't exist, it will be created. */
            id: string;
            /** @description New (partial) value of the item. Will update all keys provided here. Please note that it cannot be set to 'undefined' as this doesn't transfer over JSON, but if you set it to 'null', the value will be removed from the database. */
            partialItem: components["schemas"]["ModelItem"];
        };
        UpdateResponse: {
            isSuccessful: boolean;
            message: string;
        };
        RemoveContext: {
            databaseSlug?: string;
            /** @description Which IDs should be removed */
            rowIds: string[];
        };
        RemoveResponse: {
            isSuccessful: boolean;
            message: string;
            /** @description The number of items deleted */
            deleteCount?: number;
        };
    };
    responses: never;
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    read: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ReadContext"];
            };
        };
        responses: {
            /** @description OpenAPI */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ReadResponse"];
                };
            };
        };
    };
    create: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CreateContext"];
            };
        };
        responses: {
            /** @description OpenAPI */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CreateResponse"];
                };
            };
        };
    };
    remove: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RemoveContext"];
            };
        };
        responses: {
            /** @description OpenAPI */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RemoveResponse"];
                };
            };
        };
    };
    update: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UpdateContext"];
            };
        };
        responses: {
            /** @description OpenAPI */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["UpdateResponse"];
                };
            };
        };
    };
}
export type ModelItem = components["schemas"]["ModelItem"];
export type CreateContext = components["schemas"]["CreateContext"];
export type CreateResponse = components["schemas"]["CreateResponse"];
export type ReadResponse = components["schemas"]["ReadResponse"];
export type ReadContext = components["schemas"]["ReadContext"];
export type Sort = components["schemas"]["Sort"];
export type Filter = components["schemas"]["Filter"];
export type UpdateContext = components["schemas"]["UpdateContext"];
export type UpdateResponse = components["schemas"]["UpdateResponse"];
export type RemoveContext = components["schemas"]["RemoveContext"];
export type RemoveResponse = components["schemas"]["RemoveResponse"];
export declare const operationUrlObject: {
    read: {
        method: string;
        path: string;
    };
    create: {
        method: string;
        path: string;
    };
    remove: {
        method: string;
        path: string;
    };
    update: {
        method: string;
        path: string;
    };
};
export declare const operationKeys: string[];
//# sourceMappingURL=crud.d.ts.map