import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  ScanCommand,
  QueryCommand,
  PutCommand,
  DeleteCommand,
  BatchWriteCommand,
} from "@aws-sdk/lib-dynamodb";

const TABLE = process.env.TABLE;
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});

const COLLECTIONS = ["members", "tasks", "meetings", "reviews", "settings"];
const CHILDREN = ["tasks", "meetings", "reviews"];
const MAX_MEMBERS = 5;
const MAX_BODY = 100 * 1024;
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

const json = (statusCode, body) => ({
  statusCode,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

async function listAll() {
  const items = [];
  let ExclusiveStartKey;
  do {
    const r = await ddb.send(new ScanCommand({ TableName: TABLE, ExclusiveStartKey }));
    items.push(...(r.Items || []));
    ExclusiveStartKey = r.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items;
}

async function listCollection(pk) {
  const r = await ddb.send(
    new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: "pk = :pk",
      ExpressionAttributeValues: { ":pk": pk },
    })
  );
  return r.Items || [];
}

async function getData() {
  const out = { members: [], tasks: [], meetings: [], reviews: [], settings: {} };
  for (const item of await listAll()) {
    if (item.pk === "settings") {
      if (item.sk === "team") out.settings = item.data || {};
    } else if (out[item.pk]) {
      out[item.pk].push({ ...item.data, id: item.sk });
    }
  }
  return out;
}

async function putItem(collection, id, body) {
  if (collection === "members") {
    const members = await listCollection("members");
    if (!members.some((m) => m.sk === id) && members.length >= MAX_MEMBERS) {
      return json(409, { error: `A team can have at most ${MAX_MEMBERS} people.` });
    }
  }
  const { id: _ignored, ...data } = body;
  await ddb.send(
    new PutCommand({
      TableName: TABLE,
      Item: { pk: collection, sk: id, data, updatedAt: new Date().toISOString() },
    })
  );
  return json(200, { ...data, id });
}

async function deleteItem(collection, id) {
  await ddb.send(new DeleteCommand({ TableName: TABLE, Key: { pk: collection, sk: id } }));
  // Removing a person also removes their tasks, 1:1 logs and reviews.
  if (collection === "members") {
    const keys = [];
    for (const pk of CHILDREN) {
      for (const item of await listCollection(pk)) {
        if (item.data?.memberId === id) keys.push({ pk, sk: item.sk });
      }
    }
    for (let i = 0; i < keys.length; i += 25) {
      await ddb.send(
        new BatchWriteCommand({
          RequestItems: {
            [TABLE]: keys.slice(i, i + 25).map((Key) => ({ DeleteRequest: { Key } })),
          },
        })
      );
    }
  }
  return json(200, { ok: true });
}

export async function main(event) {
  try {
    const route = event.routeKey;
    if (route === "GET /data") return json(200, await getData());

    const { collection, id } = event.pathParameters || {};
    if (!COLLECTIONS.includes(collection)) return json(400, { error: "Unknown collection." });
    if (!ID_RE.test(id || "")) return json(400, { error: "Invalid id." });

    if (route === "DELETE /{collection}/{id}") return await deleteItem(collection, id);

    if (route === "PUT /{collection}/{id}") {
      const raw = event.isBase64Encoded
        ? Buffer.from(event.body || "", "base64").toString("utf8")
        : event.body || "";
      if (raw.length > MAX_BODY) return json(413, { error: "That entry is too large." });
      let body;
      try {
        body = JSON.parse(raw);
      } catch {
        return json(400, { error: "Body must be JSON." });
      }
      if (!body || typeof body !== "object" || Array.isArray(body)) {
        return json(400, { error: "Body must be a JSON object." });
      }
      return await putItem(collection, id, body);
    }
    return json(404, { error: "Not found." });
  } catch (err) {
    console.error(err);
    return json(500, { error: "Something went wrong on the server. Try again." });
  }
}
