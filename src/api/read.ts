import {
  O,
  getSubsetFromObject,
  hasAllLetters,
  objectMapSync,
  removeOptionalKeysFromObjectStrings,
} from "edge-util";
import {
  upstashRedisGetMultiple,
  upstashRedisGetRange,
} from "../upstashRedis.js";
import { Sort, Filter, Crud } from "../sdk.js";
import { getDatabaseDetails } from "../getDatabaseDetails.js";
import { embeddingsClient } from "../embeddings.js";
import { getCrudOperationAuthorized } from "../getCrudOperationAuthorized.js";

const sortData = (sort: Sort[] | undefined, data: { [key: string]: O }) => {
  if (!sort?.length) {
    return data;
  }

  const result = sort.reduce((sortedData, datasetSort) => {
    const sortedKeys: string[] = Object.keys(sortedData).sort((a, b) => {
      const itemA = sortedData[a];
      const itemB = sortedData[b];
      const valueA = itemA[datasetSort.objectParameterKey];
      const valueB = itemB[datasetSort.objectParameterKey];
      const directionMultiplier =
        datasetSort.sortDirection === "ascending" ? 1 : -1;

      if (typeof valueA === "number" && typeof valueB === "number") {
        // Number sorg
        return (valueA - valueB) * directionMultiplier;
      }

      // String sort
      return String(valueA) < String(valueB)
        ? directionMultiplier * 1
        : directionMultiplier * -1;
    });

    const newSortedData = sortedKeys.reduce((data, key) => {
      return { ...data, [key]: sortedData };
    }, {} as { [key: string]: O });

    return newSortedData;
  }, data);

  return result;
};
const filterData = (
  filter: Filter[] | undefined,
  data: { [key: string]: O },
) => {
  if (!filter?.length) {
    return data;
  }

  const result = filter.reduce((filteredData, datasetFilter) => {
    const keys = Object.keys(filteredData).filter((key) => {
      const item = filteredData[key];

      const objectParameterKey =
        datasetFilter.objectParameterKey as keyof typeof item;

      const value = item[objectParameterKey];

      if (datasetFilter.operator === "equal") {
        return String(value) === datasetFilter.value;
      }

      if (datasetFilter.operator === "notEqual") {
        return String(value) === datasetFilter.value;
      }

      if (datasetFilter.operator === "isFalsy") {
        return !value;
      }

      if (datasetFilter.operator === "isTruthy") {
        return !!value;
      }

      const lowercaseValue = String(value).toLowerCase();
      const lowercaseDatasetValue = String(datasetFilter.value).toLowerCase();

      if (datasetFilter.operator === "endsWith") {
        return lowercaseValue.endsWith(lowercaseDatasetValue);
      }

      if (datasetFilter.operator === "startsWith") {
        return lowercaseValue.startsWith(lowercaseDatasetValue);
      }

      if (datasetFilter.operator === "includes") {
        return lowercaseValue.includes(lowercaseDatasetValue);
      }

      if (datasetFilter.operator === "includesLetters") {
        return hasAllLetters(lowercaseValue, lowercaseDatasetValue);
      }

      if (
        datasetFilter.operator === "greaterThan" &&
        datasetFilter.value !== null &&
        datasetFilter.value !== undefined
      ) {
        return Number(value) > Number(datasetFilter.value);
      }

      if (
        datasetFilter.operator === "lessThan" &&
        datasetFilter.value !== null &&
        datasetFilter.value !== undefined
      ) {
        return Number(value) < Number(datasetFilter.value);
      }

      if (
        datasetFilter.operator === "greaterThanOrEqual" &&
        datasetFilter.value !== null &&
        datasetFilter.value !== undefined
      ) {
        return Number(value) >= Number(datasetFilter.value);
      }

      if (
        datasetFilter.operator === "lessThanOrEqual" &&
        datasetFilter.value !== null &&
        datasetFilter.value !== undefined
      ) {
        return Number(value) <= Number(datasetFilter.value);
      }

      if (datasetFilter.operator === "isIncludedIn") {
        return lowercaseDatasetValue.split(",").includes(lowercaseValue);
      }

      return false;
    });

    const newFilteredData: { [key: string]: O } = getSubsetFromObject(
      filteredData,
      keys,
    );

    return newFilteredData;
  }, data);

  return result;
};
const searchData = (search: string | undefined, data: { [key: string]: O }) => {
  if (!search || search.length === 0) {
    return data;
  }

  const keys = Object.keys(data).filter((key) => {
    const item = data[key];

    if (!item) {
      return false;
    }

    const searchable = Object.values(item)
      .map((value) => JSON.stringify(value))
      .join(",")
      .toLowerCase();

    return searchable.includes(search.toLowerCase());
  });

  return getSubsetFromObject(data, keys);
};

export type ModelKey = string;

export const read = async (
  context: Crud["read"]["input"] & { Authorization?: string },
) => {
  const {
    rowIds,
    search,
    startFromIndex,
    maxRows,
    filter,
    sort,
    objectParameterKeys,
    ignoreObjectParameterKeys,
    databaseSlug,
    vectorSearch,
    Authorization,
  } = context;
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
  const authSuffix = databaseDetails.isUserLevelSeparationEnabled
    ? `_${apiKey}`
    : "";
  const baseKey = `db_${databaseSlug}${authSuffix}_`;

  const result = rowIds
    ? (
        await upstashRedisGetMultiple({
          redisRestToken: databaseDetails.rest_token,
          redisRestUrl: databaseDetails.endpoint,
          keys: rowIds,
          baseKey,
        })
      ).reduce(
        (previous, current, currentIndex) => {
          const key = rowIds[currentIndex];
          return { ...previous, [key]: current };
        },
        {} as {
          [x: string]: O;
        },
      )
    : await upstashRedisGetRange({
        redisRestToken: databaseDetails.rest_token,
        redisRestUrl: databaseDetails.endpoint,
        baseKey,
      });

  if (!result) {
    return { isSuccessful: false, message: "No result" };
  }

  let normalized: O[] | undefined = undefined;
  let vectorSearchIds: string[] | undefined = undefined;
  if (vectorSearch) {
    const { input, minimumSimilarity, propertyKey, topK } = vectorSearch;
    const { openaiApiKey, vectorIndexColumnDetails } = databaseDetails;
    const vectorIndexDetails = vectorIndexColumnDetails?.find(
      (x) => x.propertyKey === propertyKey,
    );

    if (vectorIndexDetails && openaiApiKey) {
      const { vectorRestToken, vectorRestUrl, model } = vectorIndexDetails;

      const results = await embeddingsClient.search({
        input,
        topK,
        vectorRestToken,
        vectorRestUrl,
        openaiApiKey,
        model,
      });

      //console.log({ results });

      const similarResults = results.filter((x) => {
        if (!minimumSimilarity) {
          return true;
        }
        return x.score >= minimumSimilarity;
      });

      normalized = similarResults.map((x) => ({
        propertyKey,
        score: x.score,
        id: x.id as string,
      }));

      vectorSearchIds = normalized.map((x) => x.id);
    }
  }

  // TODO: Make this more efficient
  const vectorResult = vectorSearchIds
    ? objectMapSync(
        getSubsetFromObject(result, vectorSearchIds),
        (id, value) => ({
          ...value,
          _score: normalized?.find((x) => x.id === id)?.score,
        }),
      )
    : result;

  // console.log({ vectorSearchIds, normalized, vectorResult });

  // TODO: make this more efficient
  const specificResult =
    rowIds && rowIds.length > 0
      ? getSubsetFromObject(vectorResult, rowIds)
      : vectorResult;

  const searchedData = searchData(search, specificResult);

  // NB: filter the sliced data, if needed
  const filteredData = filterData(filter, searchedData);

  // NB: sort the filtered data, if needed
  const sortedData = sortData(sort, filteredData);

  const subsetData = objectParameterKeys?.length
    ? objectMapSync(sortedData, (key, value) =>
        getSubsetFromObject(
          value,
          objectParameterKeys! as readonly (keyof O)[],
        ),
      )
    : sortedData;

  const ignoredData = ignoreObjectParameterKeys?.length
    ? objectMapSync(subsetData, (key, item) => {
        return removeOptionalKeysFromObjectStrings(
          item as { [key: string]: any },
          ignoreObjectParameterKeys!,
        );
      })
    : subsetData;

  // NB: slice the data, if needed
  const slicedStartData = startFromIndex
    ? getSubsetFromObject(
        ignoredData,
        Object.keys(ignoredData).slice(startFromIndex),
      )
    : ignoredData;

  const slicedLimitData = maxRows
    ? getSubsetFromObject(
        slicedStartData,
        Object.keys(slicedStartData).slice(0, maxRows),
      )
    : slicedStartData;

  const hasMore = slicedLimitData.length < slicedStartData.length;

  const finalData = slicedLimitData;

  // console.log({ result });
  return {
    isSuccessful: true,
    message: "Found json and schema",
    hasMore,
    items: finalData,
    // $schema,
    // schema,
  };
};
